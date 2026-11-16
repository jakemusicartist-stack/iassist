(function() {
	// src/shared/settings.ts
	/**
	* One settings object, one storage key, one migration path.
	*
	* Rules this file exists to enforce:
	*  - every stored value is validated on read, so a corrupted or older entry can
	*    never put the UI into an impossible state;
	*  - a version bump happens here and only here;
	*  - "effective" values (master switch AND sub-switch) are computed in one place,
	*    so the panel, the background worker and the content script agree.
	*
	* This module is pure at import time: no chrome.* access outside functions, which
	* is what lets the tests run it under Node.
	*/
	var SETTINGS_KEY = "instagrous.settings";
	var THEMES = [
		"system",
		"light",
		"dark"
	];
	var DEFAULT_SETTINGS = {
		version: 6,
		ads: {
			enabled: true,
			sponsored: true,
			network: true
		},
		ghost: {
			enabled: false,
			stories: true,
			messages: true,
			typing: true
		},
		downloads: {
			enabled: true,
			shortcuts: true
		},
		appearance: {
			theme: "system",
			glass: true,
			ambientGlow: false,
			tintInstagram: false
		}
	};
	var isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
	var asBool = (value, fallback) => typeof value === "boolean" ? value : fallback;
	var asTheme = (value, fallback) => typeof value === "string" && THEMES.includes(value) ? value : fallback;
	/**
	* Turns anything that came out of storage into a valid Settings object.
	* Unknown keys are dropped, wrong types fall back to the default, and a stale
	* version is upgraded in place.
	*/
	function migrate(raw) {
		if (!isRecord(raw)) return structuredClone(DEFAULT_SETTINGS);
		const ads = isRecord(raw.ads) ? raw.ads : {};
		const ghost = isRecord(raw.ghost) ? raw.ghost : {};
		const downloads = isRecord(raw.downloads) ? raw.downloads : {};
		const appearance = isRecord(raw.appearance) ? raw.appearance : {};
		return {
			version: 6,
			ads: {
				enabled: asBool(ads.enabled, DEFAULT_SETTINGS.ads.enabled),
				sponsored: asBool(ads.sponsored, DEFAULT_SETTINGS.ads.sponsored),
				network: asBool(ads.network, DEFAULT_SETTINGS.ads.network)
			},
			ghost: {
				enabled: asBool(ghost.enabled, DEFAULT_SETTINGS.ghost.enabled),
				stories: asBool(ghost.stories, DEFAULT_SETTINGS.ghost.stories),
				messages: asBool(ghost.messages, DEFAULT_SETTINGS.ghost.messages),
				typing: asBool(ghost.typing, DEFAULT_SETTINGS.ghost.typing)
			},
			downloads: {
				enabled: asBool(downloads.enabled, DEFAULT_SETTINGS.downloads.enabled),
				shortcuts: asBool(downloads.shortcuts, DEFAULT_SETTINGS.downloads.shortcuts)
			},
			appearance: {
				theme: asTheme(appearance.theme, DEFAULT_SETTINGS.appearance.theme),
				glass: asBool(appearance.glass, DEFAULT_SETTINGS.appearance.glass),
				ambientGlow: asBool(appearance.ambientGlow, DEFAULT_SETTINGS.appearance.ambientGlow),
				tintInstagram: asBool(appearance.tintInstagram, DEFAULT_SETTINGS.appearance.tintInstagram)
			}
		};
	}
	var blocksSponsored = (s) => s.ads.enabled && s.ads.sponsored;
	var ghostsStories = (s) => s.ghost.enabled && s.ghost.stories;
	var ghostsMessages = (s) => s.ghost.enabled && s.ghost.messages;
	var ghostsTyping = (s) => s.ghost.enabled && s.ghost.typing;
	var downloadButtonsOn = (s) => s.downloads.enabled;
	var keyboardShortcutsOn = (s) => s.downloads.shortcuts;
	async function loadSettings() {
		const raw = (await chrome.storage.sync.get(SETTINGS_KEY))?.[SETTINGS_KEY];
		const next = migrate(raw);
		if (!isRecord(raw) || raw.version !== next.version) await chrome.storage.sync.set({ [SETTINGS_KEY]: next });
		return next;
	}
	async function saveSettings(next) {
		await chrome.storage.sync.set({ [SETTINGS_KEY]: migrate(next) });
	}
	// src/shared/diagnostics.ts
	/**
	* Ghost mode's counter, so its effect can be verified without a second account.
	*
	* The MAIN-world script cannot touch chrome.storage, so it publishes counts into
	* a DOM attribute. The isolated script mirrors that into storage.local, and the
	* panel reads it. Attributes cross worlds; CustomEvent detail does not, which is
	* why this is an attribute rather than an event payload.
	*/
	var GHOST_HITS_KEY = "instagrous.ghostHits";
	var GHOST_HITS_ATTR = "data-instagrous-ghost-hits";
	var emptyGhostHits = () => ({
		stories: 0,
		messages: 0,
		updatedAt: 0
	});
	var asCount = (value) => typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
	/** Parses "3:2" as published by the MAIN-world script. */
	function parseHitsAttribute(raw) {
		if (!raw) return emptyGhostHits();
		const [stories, messages] = raw.split(":");
		return {
			stories: asCount(Number.parseInt(stories ?? "", 10)),
			messages: asCount(Number.parseInt(messages ?? "", 10)),
			updatedAt: Date.now()
		};
	}
	function parseGhostHits(raw) {
		if (typeof raw !== "object" || raw === null) return emptyGhostHits();
		const candidate = raw;
		return {
			stories: asCount(candidate.stories),
			messages: asCount(candidate.messages),
			updatedAt: asCount(candidate.updatedAt)
		};
	}
	async function readGhostHits() {
		return parseGhostHits((await chrome.storage.local.get(GHOST_HITS_KEY))?.[GHOST_HITS_KEY]);
	}
	/**
	* What the content script can see about the page it is running in.
	*
	* This exists because a missing stylesheet or a silently dead content script is
	* indistinguishable from a feature the user has not found yet. The stylesheet
	* flag is read from a custom property that only content.css declares, so
	* "loaded" means the browser really injected it.
	*/
	var PAGE_KEY = "instagrous.page";
	var asFlag = (value) => value === true;
	function parsePageHealth(raw) {
		if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
		const candidate = raw;
		return {
			stylesheet: asFlag(candidate.stylesheet),
			hidden: asCount(candidate.hidden),
			at: asCount(candidate.at)
		};
	}
	async function readPageHealth() {
		return parsePageHealth((await chrome.storage.local.get(PAGE_KEY))?.[PAGE_KEY]);
	}
	// src/content/media.ts
	var MEDIA_EXTENSIONS = [
		"jpg",
		"jpeg",
		"png",
		"webp",
		"gif",
		"mp4",
		"mov",
		"webm",
		"m4v"
	];
	/**
	* The largest candidate in a srcset.
	*
	* Width descriptors win over density descriptors, because a `w` states the real
	* pixel width while an `x` only describes a multiple of a layout size we do not
	* know.
	*
	* Uses regex matching instead of naive comma-splitting so URLs with commas
	* in query parameters (such as Meta's stp=c0.134.1080.1080a_dst-jpg...) are preserved.
	*/
	function largestFromSrcset(srcset) {
		if (!srcset || !srcset.trim()) return null;
		let byWidth = null;
		let byDensity = null;
		const regex = /(\S+)(?:\s+([\d.]+)([wx]))?/g;
		let match;
		while ((match = regex.exec(srcset)) !== null) {
			let url = match[1];
			if (url.endsWith(",")) url = url.slice(0, -1);
			if (!url) continue;
			const size = match[2] ? Number.parseFloat(match[2]) : NaN;
			const unit = match[3];
			const weight = Number.isFinite(size) ? size : 0;
			if (unit === "w") {
				if (!byWidth || weight > byWidth.weight) byWidth = {
					url,
					weight
				};
			} else if (unit === "x") {
				if (!byDensity || weight > byDensity.weight) byDensity = {
					url,
					weight
				};
			} else if (!byWidth && !byDensity) byDensity = {
				url,
				weight: 0
			};
		}
		return (byWidth ?? byDensity)?.url ?? null;
	}
	function extensionFor(url, kind) {
		const path = url.split("?")[0] ?? "";
		const extension = /\.([a-z0-9]{2,5})$/i.exec(path)?.[1]?.toLowerCase();
		if (extension && MEDIA_EXTENSIONS.includes(extension)) return extension;
		return kind === "video" ? "mp4" : "jpg";
	}
	var slugify = (value) => value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30);
	function mediaFileName(url, kind, now = Date.now(), hint) {
		const slug = hint ? slugify(hint) : "";
		return `instagrous-${slug ? `${kind}-${slug}` : kind}-${now}.${extensionFor(url, kind)}`;
	}
	function usernameFromAlt(alt) {
		if (!alt) return void 0;
		const trimmed = alt.trim();
		const enMatch = /^([a-z0-9._]{1,30})'s\s+profile\s+(?:picture|photo)$/i.exec(trimmed);
		if (enMatch?.[1]) return enMatch[1];
		const ofMatch = /^profile\s+(?:picture|photo)\s+(?:of|by)\s+([a-z0-9._]{1,30})$/i.exec(trimmed);
		if (ofMatch?.[1]) return ofMatch[1];
		const multiLangMatch = /(?:foto del perfil de|photo de profil de|profilbild von|zdjęcie profilowe użytkownika)\s+([a-z0-9._]{1,30})/i.exec(trimmed);
		if (multiLangMatch?.[1]) return multiLangMatch[1];
	}
	var AVATAR_ALT_MARKERS = [
		"profile picture",
		"profile photo",
		"profile image",
		"foto del perfil",
		"photo de profil",
		"profilbild",
		"immagine del profilo",
		"foto do perfil",
		"profil resm",
		"zdjęcie profilowe"
	];
	function isAvatar(element) {
		if ((element.getAttribute("data-instagrous-media-kind") || element.closest("[data-instagrous-media-kind]")?.getAttribute("data-instagrous-media-kind")) === "avatar") return true;
		const src = (element.currentSrc || element.src || "").toLowerCase();
		if (src.includes("/t51.2885-19/") || src.includes("/t51.29350-19/") || src.includes("/t51.36379-19/") || src.includes("-19/") || src.includes("s150x150") || src.includes("s240x240") || src.includes("s320x320") || src.includes("s480x480") || src.includes("s640x640") || src.includes("dst-jpg_s")) {
			if (src.includes("-19/")) return true;
			if (src.includes("s150x150") || src.includes("s240x240") || src.includes("s320x320") || src.includes("dst-jpg_s")) {
				if (!element.closest("article, [role=\"dialog\"] article")) return true;
			}
		}
		const alt = (element.alt ?? "").toLowerCase();
		if (alt) {
			if (alt.includes("profile") || alt.includes("avatar") || alt.includes("perfil") || alt.includes("profilbild")) return true;
			if (AVATAR_ALT_MARKERS.some((marker) => alt.includes(marker))) return true;
		}
		if (element.closest("header")) return true;
		if (element.closest("div[role=\"button\"][tabindex]") || element.closest("button")) {
			const parentHeader = element.closest("header, main section, [role=\"main\"]");
			if (parentHeader && parentHeader.querySelector("h1, h2")) return true;
		}
		const link = element.closest("a[href^=\"/\"]");
		if (link && link.querySelector("img") === element) {
			const href = link.getAttribute("href") || "";
			if (/^\/[a-zA-Z0-9._-]+\/?$/.test(href) && !href.startsWith("/p/") && !href.startsWith("/reel/")) return true;
		}
		if (typeof window !== "undefined" && window.location) {
			const firstPart = window.location.pathname.split("/").filter(Boolean)[0];
			if (Boolean(firstPart) && ![
				"p",
				"reel",
				"reels",
				"stories",
				"explore",
				"direct",
				"accounts",
				"emails",
				"your_activity"
			].includes(firstPart)) {
				if (!element.closest("article, [role=\"tabpanel\"], div._ac7v, div._aabd")) {
					const inTopSection = element.closest("main section, [role=\"main\"] section, header");
					if (inTopSection) {
						const isRound = (window.getComputedStyle ? window.getComputedStyle(element) : null)?.borderRadius === "50%" || element.parentElement?.style?.borderRadius === "50%";
						const width = element.clientWidth || element.naturalWidth;
						const height = element.clientHeight || element.naturalHeight;
						const isSquare = width > 0 && height > 0 && Math.abs(width - height) <= 10;
						if (isRound || isSquare || inTopSection.querySelector("h1, h2")) return true;
					}
				}
			}
		}
		return false;
	}
	function resolveUsername(element) {
		const fromAlt = usernameFromAlt(element.alt);
		if (fromAlt) return fromAlt;
		if (typeof window !== "undefined" && window.location) {
			const firstPart = window.location.pathname.split("/").filter(Boolean)[0];
			if (firstPart && ![
				"p",
				"reel",
				"reels",
				"stories",
				"explore",
				"direct",
				"accounts",
				"emails",
				"your_activity"
			].includes(firstPart)) return firstPart;
		}
		const stampedUser = element.getAttribute("data-instagrous-username") || element.closest("[data-instagrous-username]")?.getAttribute("data-instagrous-username");
		if (stampedUser) return stampedUser;
		const header = element.closest("header, main section, [role=\"main\"] section") || document.querySelector("header");
		if (header) {
			const headingText = header.querySelector("h2, h1")?.textContent?.trim();
			if (headingText && /^[a-zA-Z0-9._]+$/.test(headingText)) return headingText;
		}
		const link = element.closest("a[href^=\"/\"]");
		if (link) {
			const href = (link.getAttribute("href") || "").replace(/^\/|\/$/g, "");
			if (href && !href.includes("/")) return href;
		}
		if (typeof document !== "undefined" && document.title) {
			const titleMatch = /\(@([a-zA-Z0-9._]+)\)/.exec(document.title);
			if (titleMatch?.[1]) return titleMatch[1];
		}
	}
	function findPostCode(element) {
		const stamped = element.getAttribute("data-instagrous-carousel-code") || element.closest("[data-instagrous-carousel-code]")?.getAttribute("data-instagrous-carousel-code");
		if (stamped) return stamped;
		const container = element.closest("article, [role=\"presentation\"], [role=\"dialog\"], section, main");
		if (container) {
			const href = container.querySelector("a[href*=\"/p/\"], a[href*=\"/reel/\"], a[href*=\"/reels/\"]")?.getAttribute("href") || "";
			const m = /\/(?:p|reel|reels)\/([a-zA-Z0-9_-]+)/.exec(href);
			if (m?.[1]) return m[1];
			const timeLink = container.querySelector("time")?.closest("a");
			if (timeLink) {
				const thref = timeLink.getAttribute("href") || "";
				const tm = /\/(?:p|reel|reels)\/([a-zA-Z0-9_-]+)/.exec(thref);
				if (tm?.[1]) return tm[1];
			}
		}
		if (typeof window !== "undefined" && window.location) {
			const pageMatch = /\/(?:p|reel|reels)\/([a-zA-Z0-9_-]+)/.exec(window.location.pathname);
			if (pageMatch?.[1]) return pageMatch[1];
		}
	}
	/**
	* Decides whether a hovered element is worth offering a download for, and for
	* which file. Returns null for interface icons and anything unrecognised.
	*/
	function describeTarget(element) {
		const postCode = findPostCode(element);
		const stampedUrl = element.getAttribute("data-instagrous-media-url") || element.closest("[data-instagrous-media-url]")?.getAttribute("data-instagrous-media-url");
		const stampedKind = element.getAttribute("data-instagrous-media-kind") || element.closest("[data-instagrous-media-kind]")?.getAttribute("data-instagrous-media-kind") || "";
		if (stampedUrl && !stampedUrl.startsWith("blob:")) {
			const isAv = stampedKind === "avatar" || element instanceof HTMLImageElement && isAvatar(element);
			const username = element instanceof HTMLImageElement ? resolveUsername(element) : void 0;
			const kind = isAv ? "avatar" : stampedKind || (stampedUrl.includes(".mp4") || stampedUrl.includes("/video/") ? "video" : "photo");
			return {
				url: stampedUrl,
				fallbackUrl: element instanceof HTMLImageElement ? element.currentSrc || element.src : void 0,
				kind,
				filename: mediaFileName(stampedUrl, kind, Date.now(), username),
				username,
				code: postCode
			};
		}
		if (typeof HTMLVideoElement !== "undefined" && element instanceof HTMLVideoElement) {
			if (stampedUrl && !stampedUrl.startsWith("blob:")) {
				const kind = stampedKind || "video";
				return {
					url: stampedUrl,
					fallbackUrl: element.currentSrc && element.currentSrc !== stampedUrl ? element.currentSrc : void 0,
					kind,
					filename: mediaFileName(stampedUrl, kind),
					code: postCode
				};
			}
			const url = element.getAttribute("src") || element.currentSrc || element.src || element.querySelector("source[src]")?.getAttribute("src") || "";
			if (!url) return null;
			return {
				url,
				fallbackUrl: element.currentSrc && element.currentSrc !== url ? element.currentSrc : void 0,
				kind: "video",
				filename: mediaFileName(url, "video"),
				code: postCode
			};
		}
		if (typeof HTMLImageElement !== "undefined" && element instanceof HTMLImageElement) {
			const source = element.currentSrc || element.src;
			if (!source) return null;
			if (isAvatar(element)) {
				const username = resolveUsername(element);
				return {
					url: source,
					fallbackUrl: source,
					kind: "avatar",
					filename: mediaFileName(source, "avatar", Date.now(), username),
					username,
					code: postCode
				};
			}
			if (element.naturalWidth > 0 && element.naturalWidth < 80) return null;
			const best = largestFromSrcset(element.srcset) ?? source;
			return {
				url: best,
				fallbackUrl: source,
				kind: "photo",
				filename: mediaFileName(best, "photo"),
				code: postCode
			};
		}
		return null;
	}
	// src/content/downloads.ts
	var BUTTON_SIZE = 30;
	var GAP = 8;
	var REVEAL_DELAY = 160;
	var HIDE_DELAY = 380;
	var SAMPLE_MS = 50;
	var group = null;
	var carouselBtn = null;
	var toast = null;
	var target = null;
	var targetRect = null;
	var activeCarouselCode = null;
	var showTimer = 0;
	var hideTimer = 0;
	var toastTimer = 0;
	var enabled$1 = true;
	var mounted$1 = false;
	var lastSample = 0;
	var busy = false;
	var clamp = (v, lo, hi) => Math.min(Math.max(v, lo), Math.max(lo, hi));
	function ensureUI() {
		if (group?.isConnected) return group;
		if (!document.body) return null;
		const container = document.createElement("div");
		container.className = "instagrous-download-group";
		container.dataset.visible = "false";
		const single = document.createElement("button");
		single.type = "button";
		single.className = "instagrous-download";
		single.setAttribute("aria-label", "Save this media");
		single.title = "Save media";
		single.innerHTML = "<svg width=\"15\" height=\"15\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M12 3v13\"/><path d=\"m7 11 5 5 5-5\"/><path d=\"M4 21h16\"/></svg>";
		single.addEventListener("pointerdown", (e) => {
			e.preventDefault();
			e.stopPropagation();
			run();
		});
		single.addEventListener("click", (e) => {
			e.preventDefault();
			e.stopPropagation();
		});
		const multi = document.createElement("button");
		multi.type = "button";
		multi.className = "instagrous-download-carousel";
		multi.setAttribute("aria-label", "Save all slides");
		multi.title = "Save all slides";
		multi.innerHTML = "<svg width=\"15\" height=\"15\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M7 4h12a2 2 0 0 1 2 2v10\"/><rect x=\"3\" y=\"8\" width=\"14\" height=\"13\" rx=\"2\"/><path d=\"M10 12v5\"/><path d=\"m8 15 2 2 2-2\"/></svg>";
		multi.addEventListener("pointerdown", (e) => {
			e.preventDefault();
			e.stopPropagation();
			const code = activeCarouselCode || (target ? findPostCode(target) : null);
			if (code) runCarousel(code);
		});
		multi.addEventListener("click", (e) => {
			e.preventDefault();
			e.stopPropagation();
		});
		container.append(single, multi);
		document.body.append(container);
		group = container;
		carouselBtn = multi;
		return container;
	}
	function hide() {
		if (group) group.dataset.visible = "false";
		activeCarouselCode = null;
	}
	function dismiss$1() {
		clearTimeout(showTimer);
		clearTimeout(hideTimer);
		hide();
	}
	function scheduleHide() {
		clearTimeout(showTimer);
		clearTimeout(hideTimer);
		hideTimer = window.setTimeout(dismiss$1, HIDE_DELAY);
	}
	var overControls = (x, y) => {
		if (!group || group.dataset.visible !== "true") return false;
		const r = group.getBoundingClientRect();
		return x >= r.left - 6 && x <= r.right + 6 && y >= r.top - 6 && y <= r.bottom + 6;
	};
	/**
	* Determines whether the hovered media element is inside a carousel.
	*
	* Strategy (in priority order):
	*  1. Read data-instagrous-carousel-code stamped by the MAIN world harvester.
	*  2. Walk up to the enclosing article and look for carousel indicators in the DOM
	*     (Next/Prev chevron buttons, dot indicators, any element with multiple child
	*     list items that hold images).
	*  3. Extract the post shortcode from a /p/ or /reel/ link in the article.
	*/
	function getCarouselInfo(element) {
		const stamped = element.closest("[data-instagrous-carousel-code]") || element.parentElement?.closest("[data-instagrous-carousel-code]");
		if (stamped) return {
			code: stamped.getAttribute("data-instagrous-carousel-code"),
			count: Number(stamped.getAttribute("data-instagrous-carousel-count") || 0)
		};
		const article = element.closest("article, [role=\"presentation\"], [role=\"dialog\"], main, section");
		if (!article) return null;
		if (article.hasAttribute("data-instagrous-carousel-code")) return {
			code: article.getAttribute("data-instagrous-carousel-code"),
			count: Number(article.getAttribute("data-instagrous-carousel-count") || 0)
		};
		const href = article.querySelector("a[href*=\"/p/\"], a[href*=\"/reel/\"]")?.getAttribute("href") || "";
		const match = /\/(?:p|reel)\/([a-zA-Z0-9_-]+)/.exec(href);
		const pageMatch = /\/(?:p|reel)\/([a-zA-Z0-9_-]+)/.exec(window.location.pathname);
		const postCode = match?.[1] || pageMatch?.[1];
		if (!postCode) return null;
		const hasChevrons = article.querySelector("button[aria-label*=\"Next\"], button[aria-label*=\"Previous\"], button[aria-label*=\"slide\"], button[aria-label*=\"Slide\"], [aria-label*=\"next\"], [aria-label*=\"previous\"], [aria-label*=\"Next Slide\"], [aria-label*=\"Previous Slide\"]") !== null || article.querySelector("button[aria-label] svg polyline, button[aria-label] svg path") !== null;
		const mediaContainer = article.querySelector("ul, [role=\"listbox\"], [role=\"tablist\"]");
		const multipleSlides = mediaContainer ? mediaContainer.querySelectorAll("li, [role=\"tab\"]").length > 1 : article.querySelectorAll("ul li img, ul li video, [role=\"tablist\"] [role=\"tab\"], ._acaz, div._aamz").length > 1;
		const dots = article.querySelector("[style*=\"transform\"]")?.querySelectorAll("[style*=\"opacity\"]");
		const hasDots = dots ? dots.length > 1 : article.querySelectorAll("div[style*=\"border-radius: 50%\"], div._acnb, div._acnc, span._acnb").length > 1;
		const hasTabsOrDots = article.querySelector("[role=\"tablist\"], ul._aamz, ._aam-, ._acaz, div._aamz") !== null;
		if (hasChevrons || multipleSlides || hasDots || hasTabsOrDots) return {
			code: postCode,
			count: 0
		};
		return null;
	}
	function reveal(element) {
		const container = ensureUI();
		if (!container || !carouselBtn) return;
		const rect = element.getBoundingClientRect();
		if (rect.width < 24 || rect.height < 24) {
			dismiss$1();
			return;
		}
		targetRect = rect;
		const carousel = getCarouselInfo(element);
		activeCarouselCode = carousel?.code ?? null;
		if (activeCarouselCode) {
			carouselBtn.style.display = "flex";
			const count = carousel?.count ?? 0;
			const label = count > 0 ? `Save all ${count} slides` : "Save all slides";
			carouselBtn.title = label;
			carouselBtn.setAttribute("aria-label", label);
		} else carouselBtn.style.display = "none";
		const groupWidth = activeCarouselCode ? 66 : BUTTON_SIZE;
		const left = clamp(rect.right - groupWidth - GAP, GAP, window.innerWidth - groupWidth - GAP);
		const top = clamp(rect.top + GAP, GAP, window.innerHeight - BUTTON_SIZE - GAP);
		container.style.left = `${Math.round(left)}px`;
		container.style.top = `${Math.round(top)}px`;
		container.dataset.visible = "true";
	}
	function arm(element) {
		clearTimeout(hideTimer);
		clearTimeout(showTimer);
		target = element;
		showTimer = window.setTimeout(() => {
			if (target !== element) return;
			reveal(element);
		}, REVEAL_DELAY);
	}
	function showToast(message, duration = 2600) {
		if (!document.body) return;
		if (!toast?.isConnected) {
			toast = document.createElement("div");
			toast.className = "instagrous-toast";
			toast.setAttribute("role", "status");
			toast.setAttribute("aria-live", "polite");
			document.body.append(toast);
		}
		toast.textContent = message;
		toast.dataset.visible = "true";
		clearTimeout(toastTimer);
		toastTimer = window.setTimeout(() => {
			if (toast) toast.dataset.visible = "false";
		}, duration);
	}
	function requestPageDownload(media) {
		return new Promise((resolve) => {
			let resolved = false;
			const onResult = (event) => {
				if (resolved) return;
				resolved = true;
				window.removeEventListener("instagrous-download-result", onResult);
				const detail = event.detail;
				resolve(detail || { status: "failed" });
			};
			window.addEventListener("instagrous-download-result", onResult);
			window.dispatchEvent(new CustomEvent("instagrous-execute-download", { detail: {
				url: media?.url,
				fallbackUrl: media?.fallbackUrl,
				filename: media?.filename,
				kind: media?.kind,
				username: media?.username,
				code: media?.code
			} }));
			setTimeout(() => {
				if (resolved) return;
				resolved = true;
				window.removeEventListener("instagrous-download-result", onResult);
				resolve({
					status: "failed",
					message: "timeout"
				});
			}, 12e3);
		});
	}
	function requestCarouselDownload(code) {
		return new Promise((resolve) => {
			let resolved = false;
			const onResult = (event) => {
				if (resolved) return;
				resolved = true;
				window.removeEventListener("instagrous-download-result", onResult);
				const detail = event.detail;
				resolve(detail || { status: "failed" });
			};
			window.addEventListener("instagrous-download-result", onResult);
			window.dispatchEvent(new CustomEvent("instagrous-execute-carousel-download", { detail: { code } }));
			setTimeout(() => {
				if (resolved) return;
				resolved = true;
				window.removeEventListener("instagrous-download-result", onResult);
				resolve({
					status: "failed",
					message: "timeout"
				});
			}, 3e4);
		});
	}
	async function run() {
		if (busy) return;
		const element = target;
		if (!element) {
			showToast("Move over the media first");
			return;
		}
		const media = describeTarget(element);
		if (!media) {
			showToast("That element has no file to save");
			return;
		}
		busy = true;
		try {
			if (media.kind === "avatar" || media.url?.includes("s150x150") || media.url?.includes("s240x240") || media.url?.includes("s320x320") || media.url?.includes("dst-jpg_s") || media.url?.includes("t51.2885-19") || media.url?.includes("-19/")) {
				if (!media.username && typeof window !== "undefined" && window.location) {
					const parts = window.location.pathname.split("/").filter(Boolean);
					if (parts[0] && ![
						"p",
						"reel",
						"reels",
						"stories",
						"explore",
						"direct",
						"accounts",
						"emails",
						"your_activity"
					].includes(parts[0])) media.username = parts[0];
				}
				showToast("Fetching full resolution HD profile picture...");
				try {
					const hdResp = await chrome.runtime.sendMessage({
						type: "fetch-hd-avatar",
						username: media.username,
						currentUrl: media.url
					});
					if (hdResp?.url && typeof hdResp.url === "string" && hdResp.url.startsWith("http")) {
						media.url = hdResp.url;
						media.kind = "avatar";
						media.filename = `instagrous-avatar-${media.username ? `${media.username}-` : ""}1080p-${Date.now()}.jpg`;
					}
				} catch (err) {
					console.warn("[instagrous] Failed to fetch HD avatar via background", err);
				}
			}
			const result = await requestPageDownload(media);
			if (result.status === "ok") {
				showToast("Saved to your downloads");
				dismiss$1();
				return;
			}
			if (result.message === "timeout" && media.url && !media.url.startsWith("blob:")) {
				const response = await chrome.runtime.sendMessage({
					type: "download",
					...media
				});
				if (response?.status === "ok") {
					showToast("Saved to your downloads");
					dismiss$1();
					return;
				}
				if (response?.status === "needs-permission") {
					showToast("Reload the extension in chrome://extensions to grant downloads");
					return;
				}
			}
			showToast(`Could not save${result.message ? ` — ${result.message.slice(0, 100)}` : ""}`, 5e3);
		} catch (error) {
			showToast(`INSTAGROUS is not responding${error instanceof Error ? ` — ${error.message}` : ""}`, 5e3);
		} finally {
			busy = false;
		}
	}
	async function runCarousel(code) {
		if (busy) return;
		busy = true;
		showToast("Saving all slides...");
		try {
			const result = await requestCarouselDownload(code);
			if (result.status === "ok") {
				showToast("Saved all slides to your downloads");
				dismiss$1();
			} else showToast(`Could not save all slides${result.message ? ` — ${result.message.slice(0, 100)}` : ""}`, 5e3);
		} catch (error) {
			showToast(`Failed to save carousel${error instanceof Error ? ` — ${error.message}` : ""}`, 5e3);
		} finally {
			busy = false;
		}
	}
	var isMedia = (el) => el instanceof HTMLImageElement || el instanceof HTMLVideoElement;
	/** Media element under the pointer, topmost first. */
	function mediaAt(x, y) {
		if (target && target.isConnected) {
			const rect = target.getBoundingClientRect();
			if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return target;
		}
		const elements = document.elementsFromPoint(x, y);
		for (const candidate of elements) {
			if (group && (candidate === group || group.contains(candidate))) continue;
			if (toast && (candidate === toast || toast.contains(candidate))) continue;
			if (isMedia(candidate)) {
				const rect = candidate.getBoundingClientRect();
				if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
					if (describeTarget(candidate)) return candidate;
				}
			}
		}
		for (const candidate of elements) {
			if (group && (candidate === group || group.contains(candidate))) continue;
			if (toast && (candidate === toast || toast.contains(candidate))) continue;
			if (candidate.matches("body, main, article, section, [role=\"main\"]")) continue;
			const children = candidate.querySelectorAll("video, img");
			for (const child of children) if (isMedia(child)) {
				const rect = child.getBoundingClientRect();
				if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
					if (describeTarget(child)) return child;
				}
			}
		}
		return null;
	}
	function onPointerMove(event) {
		if (!enabled$1) return;
		const now = performance.now();
		if (now - lastSample < SAMPLE_MS) return;
		lastSample = now;
		const { clientX: x, clientY: y } = event;
		if (overControls(x, y)) {
			clearTimeout(hideTimer);
			return;
		}
		const media = mediaAt(x, y);
		if (!media) {
			if (target) scheduleHide();
			return;
		}
		if (media === target) {
			clearTimeout(hideTimer);
			if (group?.dataset.visible === "true" && targetRect) {
				const fresh = media.getBoundingClientRect();
				if (Math.abs(fresh.top - targetRect.top) > 2 || Math.abs(fresh.left - targetRect.left) > 2) reveal(media);
			}
			return;
		}
		hide();
		arm(media);
	}
	function setDownloadsEnabled(on) {
		enabled$1 = on;
		if (!on) dismiss$1();
	}
	function mountDownloads() {
		if (mounted$1) return;
		mounted$1 = true;
		document.addEventListener("pointermove", onPointerMove, {
			capture: true,
			passive: true
		});
		document.addEventListener("pointerout", (event) => {
			if (event.relatedTarget === null && target) scheduleHide();
		}, {
			capture: true,
			passive: true
		});
		window.addEventListener("scroll", () => {
			if (group?.dataset.visible === "true") dismiss$1();
		}, {
			capture: true,
			passive: true
		});
		window.addEventListener("blur", dismiss$1);
	}
	// src/ui/settings.css?inline
	var settings_default = "/**\n * INSTAGROUS UI stylesheet.\n *\n * Rendered inside a shadow root, so `:host` is our section and\n * `.instagrous-page` is the column. That is why there is a `:host` here instead\n * of `:root`: the same markup is shown inside instagram.com, and a plain\n * `body {}` would restyle the site we are guests on.\n *\n * The palette is Instagram's own, not iOS: #0095f6 for the accent, #dbdbdb for\n * light borders, #737373 secondary text, #262626 cards on #000 in dark. Using\n * system blue on an Instagram page is what made the first version read as a\n * foreign panel sitting on top of the app rather than a part of it.\n *\n * Metrics follow Instagram's settings rows: 14px label, 13px detail, one pixel\n * dividers between rows, 12px card radius, and a 44x26 switch — smaller than the\n * iOS 52x32 the first version used, which overpowered 13px text next to it.\n */\n\n:host {\n  color-scheme: light;\n\n  /* Instagram web, light. */\n  --bg: #ffffff;\n  --surface: #ffffff;\n  --surface-sunken: #f5f5f5;\n  --line: #dbdbdb;\n  --divider: #efefef;\n  --fg: #262626;\n  --muted: #737373;\n  --accent: #0095f6;\n  --accent-hover: #1877f2;\n  --accent-quiet: rgba(0, 149, 246, 0.12);\n\n  --radius-card: 12px;\n  --radius-row: 8px;\n  --radius-pill: 999px;\n\n  --space-1: 4px;\n  --space-2: 8px;\n  --space-3: 12px;\n  --space-4: 16px;\n  --space-5: 24px;\n  --space-6: 32px;\n\n  --ease: cubic-bezier(0.16, 1, 0.3, 1);\n  --quick: 140ms;\n\n  --z-sticky: 10;\n\n  --font: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;\n\n  --header-bg: var(--bg);\n\n  display: block;\n  height: 100%;\n  background: var(--bg);\n}\n\n:host([data-theme='dark']) {\n  color-scheme: dark;\n\n  --bg: #000000;\n  --surface: #121212;\n  --surface-sunken: #262626;\n  --line: #363636;\n  --divider: #262626;\n  --fg: #f5f5f5;\n  --muted: #a8a8a8;\n  --accent-quiet: rgba(0, 149, 246, 0.18);\n}\n\n/* Glass is a header treatment only: one translucent bar over content that\n   scrolls beneath it. Blurring whole cards on a page we do not own is the\n   expensive, muddy version of the same idea. */\n:host([data-glass='on']) {\n  --header-bg: rgba(255, 255, 255, 0.82);\n}\n\n:host([data-glass='on'][data-theme='dark']) {\n  --header-bg: rgba(0, 0, 0, 0.72);\n}\n\n* {\n  box-sizing: border-box;\n}\n\n.instagrous-page {\n  display: flex;\n  flex-direction: column;\n  gap: var(--space-6);\n  width: 100%;\n  max-width: 720px;\n  min-height: 100%;\n  margin: 0 auto;\n  padding: var(--space-6) var(--space-5) 64px;\n  font-family: var(--font);\n  font-size: 14px;\n  line-height: 1.45;\n  color: var(--fg);\n  -webkit-font-smoothing: antialiased;\n  background: transparent;\n}\n\n/* ------------------------------------------------------------------- header */\n\n.top {\n  position: sticky;\n  top: 0;\n  z-index: var(--z-sticky);\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: var(--space-3);\n  margin: calc(var(--space-6) * -1) calc(var(--space-5) * -1) 0;\n  padding: var(--space-3) var(--space-5);\n  background: var(--header-bg);\n  -webkit-backdrop-filter: blur(14px) saturate(180%);\n  backdrop-filter: blur(14px) saturate(180%);\n  border-bottom: 1px solid var(--divider);\n}\n\n.brand {\n  display: flex;\n  align-items: center;\n  gap: var(--space-2);\n  min-width: 0;\n}\n\n.brand-mark {\n  display: block;\n  flex: none;\n  width: 28px;\n  height: 28px;\n  border-radius: var(--radius-row);\n}\n\n.brand-mark svg {\n  display: block;\n}\n\n.brand-name {\n  margin: 0;\n  font-size: 15px;\n  font-weight: 700;\n  letter-spacing: -0.01em;\n}\n\n.top-right {\n  display: flex;\n  align-items: center;\n  gap: var(--space-2);\n}\n\n.version {\n  flex: none;\n  color: var(--muted);\n  font-size: 12px;\n  font-variant-numeric: tabular-nums;\n}\n\n.close {\n  flex: none;\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  width: 32px;\n  height: 32px;\n  padding: 0;\n  border: none;\n  border-radius: var(--radius-pill);\n  background: transparent;\n  color: var(--fg);\n  cursor: pointer;\n  transition: background-color var(--quick) var(--ease);\n}\n\n.close:hover {\n  background: var(--surface-sunken);\n}\n\n.close:focus-visible {\n  outline: 2px solid var(--accent);\n  outline-offset: 2px;\n}\n\n/* ------------------------------------------------------------------ section */\n\n.section {\n  display: flex;\n  flex-direction: column;\n  gap: var(--space-3);\n}\n\n.section-head {\n  display: flex;\n  flex-direction: column;\n  gap: var(--space-1);\n  padding: 0 var(--space-1);\n}\n\n.section-title {\n  margin: 0;\n  font-size: 15px;\n  font-weight: 700;\n  letter-spacing: -0.01em;\n}\n\n.section-blurb {\n  margin: 0;\n  max-width: 62ch;\n  color: var(--muted);\n  font-size: 13px;\n  line-height: 1.4;\n}\n\n.section-body {\n  background: var(--surface);\n  border: 1px solid var(--divider);\n  border-radius: var(--radius-card);\n  padding: 0 var(--space-4);\n}\n\n.row {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: var(--space-4);\n  min-height: 56px;\n  padding: var(--space-3) 0;\n}\n\n.row + .row {\n  border-top: 1px solid var(--divider);\n}\n\n.row-copy {\n  display: flex;\n  flex: 1;\n  flex-direction: column;\n  gap: 2px;\n  min-width: 0;\n}\n\n.row-label {\n  font-size: 14px;\n  font-weight: 600;\n}\n\n.row-detail {\n  max-width: 54ch;\n  color: var(--muted);\n  font-size: 13px;\n  line-height: 1.35;\n}\n\n/* ------------------------------------------------------------------ switch */\n\n.switch {\n  position: relative;\n  flex: none;\n  width: 44px;\n  height: 26px;\n  padding: 0;\n  border: none;\n  border-radius: var(--radius-pill);\n  background: var(--surface-sunken);\n  box-shadow: inset 0 0 0 1px var(--line);\n  cursor: pointer;\n  transition:\n    background-color var(--quick) var(--ease),\n    box-shadow var(--quick) var(--ease);\n}\n\n.switch::after {\n  content: '';\n  position: absolute;\n  top: 4px;\n  left: 4px;\n  width: 18px;\n  height: 18px;\n  border-radius: 50%;\n  background: #ffffff;\n  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.28);\n  transition:\n    transform 200ms var(--ease),\n    width var(--quick) var(--ease);\n}\n\n.switch[aria-checked='true'] {\n  background: var(--accent);\n  box-shadow: none;\n}\n\n.switch[aria-checked='true']::after {\n  transform: translateX(18px);\n}\n\n.switch[aria-checked='true']:hover:not(:disabled) {\n  background: var(--accent-hover);\n}\n\n.switch:active:not(:disabled)::after {\n  width: 21px;\n}\n\n.switch:disabled {\n  opacity: 0.45;\n  cursor: not-allowed;\n}\n\n.switch:focus-visible {\n  outline: 2px solid var(--accent);\n  outline-offset: 2px;\n}\n\n/* --------------------------------------------------------------- segmented */\n\n.segmented {\n  display: inline-flex;\n  flex: none;\n  gap: 2px;\n  padding: 2px;\n  border-radius: var(--radius-row);\n  background: var(--surface-sunken);\n}\n\n.segment {\n  min-height: 26px;\n  padding: 0 10px;\n  border: none;\n  border-radius: 6px;\n  background: transparent;\n  color: var(--muted);\n  font-family: inherit;\n  font-size: 12px;\n  font-weight: 600;\n  cursor: pointer;\n  transition:\n    background-color var(--quick) var(--ease),\n    color var(--quick) var(--ease);\n}\n\n.segment:hover {\n  color: var(--fg);\n}\n\n.segment[aria-pressed='true'] {\n  background: var(--surface);\n  color: var(--fg);\n  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);\n}\n\n:host([data-theme='dark']) .segment[aria-pressed='true'] {\n  background: #4f4f4f;\n}\n\n.segment:focus-visible {\n  outline: 2px solid var(--accent);\n  outline-offset: 1px;\n}\n\n/* --------------------------------------------------------------- diagnostics */\n\n.stat {\n  flex: none;\n  color: var(--fg);\n  font-size: 13px;\n  font-weight: 600;\n  font-variant-numeric: tabular-nums;\n  text-align: right;\n}\n\n.stat.is-quiet {\n  color: var(--muted);\n  font-weight: 400;\n}\n\n/* ------------------------------------------------------------ action button */\n\n.row-actions {\n  display: flex;\n  flex: none;\n  align-items: center;\n  gap: var(--space-3);\n}\n\n.action {\n  flex: none;\n  min-height: 32px;\n  padding: 0 14px;\n  border: 1px solid var(--line);\n  border-radius: var(--radius-row);\n  background: transparent;\n  color: var(--fg);\n  font-family: inherit;\n  font-size: 13px;\n  font-weight: 600;\n  cursor: pointer;\n  transition:\n    background-color var(--quick) var(--ease),\n    border-color var(--quick) var(--ease);\n}\n\n.action:hover:not(:disabled) {\n  background: var(--surface-sunken);\n}\n\n.action:disabled {\n  opacity: 0.5;\n  cursor: default;\n}\n\n.action:focus-visible {\n  outline: 2px solid var(--accent);\n  outline-offset: 2px;\n}\n\n/* ------------------------------------------------------------------ caution */\n\n.caution {\n  margin: 0;\n  padding: var(--space-3) var(--space-4);\n  border: 1px solid var(--divider);\n  border-radius: var(--radius-card);\n  background: var(--surface-sunken);\n  color: var(--muted);\n  font-size: 12.5px;\n  line-height: 1.45;\n  max-width: 70ch;\n}\n\n@media (max-width: 560px) {\n  .instagrous-page {\n    padding: var(--space-5) var(--space-4) 48px;\n  }\n\n  .top {\n    margin: calc(var(--space-5) * -1) calc(var(--space-4) * -1) 0;\n    padding: var(--space-3) var(--space-4);\n  }\n}\n\n@media (prefers-reduced-motion: reduce) {\n  *,\n  *::before,\n  *::after {\n    animation-duration: 0.001ms !important;\n    transition-duration: 0.001ms !important;\n  }\n}\n";
	// src/shared/mark.ts
	/**
	* The INSTAGROUS mark: official Instagram Black & White icon with rounded edges
	* and transparent background.
	*
	* Inherits `currentColor` so it renders crisp black in light mode and pure white
	* in dark mode, with zero background opacity.
	*/
	function instagramSvg(size = 24, color = "currentColor") {
		return [
			`<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">`,
			"<rect x=\"2\" y=\"2\" width=\"20\" height=\"20\" rx=\"5.5\" ry=\"5.5\"/>",
			"<circle cx=\"12\" cy=\"12\" r=\"4.2\"/>",
			`<circle cx="17.6" cy="6.4" r="1.2" fill="${color}" stroke="none"/>`,
			"</svg>"
		].join("");
	}
	/** Keep backwards-compatibility with gearSvg callers */
	var gearSvg = instagramSvg;
	// src/ui/settings-view.ts
	/**
	* The settings UI, as a module rather than an extension page.
	*
	* It used to be `panel/main.ts`, which only worked inside Chrome's side panel:
	* a whole document with `#app` and a `<body>`. Rendering it inside instagram.com
	* instead needs it to take a root element and paint into it, because the page it
	* lives in already owns the document.
	*
	* Two consequences of that move are visible here:
	*  - theme and glass are written to the shadow host, not to `documentElement`;
	*  - the things an extension page can do and a content script cannot are asked
	*    for through `SettingsHost`. `chrome.permissions.request` is the big one: it
	*    needs an extension page and a user gesture, so `downloads` became a regular
	*    permission and there is no permission button any more.
	*/
	/** The mark, drawn inline so no web-accessible resource is needed. */
	function h(tag, className, text) {
		const node = document.createElement(tag);
		if (className) node.className = className;
		if (text !== void 0) node.textContent = text;
		return node;
	}
	function makeSwitch(label, onChange) {
		const button = h("button", "switch");
		button.type = "button";
		button.setAttribute("role", "switch");
		button.setAttribute("aria-label", label);
		button.addEventListener("click", () => {
			if (button.disabled) return;
			onChange(button.getAttribute("aria-checked") !== "true");
		});
		return {
			button,
			set(checked, disabled) {
				button.setAttribute("aria-checked", String(checked));
				button.disabled = disabled;
			}
		};
	}
	function row(label, detail, control) {
		const wrap = h("div", "row");
		const copy = h("div", "row-copy");
		copy.append(h("span", "row-label", label), h("span", "row-detail", detail));
		wrap.append(copy, control);
		return wrap;
	}
	function section(title, blurb) {
		const root = h("section", "section");
		const head = h("div", "section-head");
		head.append(h("h2", "section-title", title), h("p", "section-blurb", blurb));
		const body = h("div", "section-body");
		root.append(head, body);
		return {
			root,
			body
		};
	}
	function segmented(options, onChange) {
		const element = h("div", "segmented");
		element.setAttribute("role", "group");
		const buttons = options.map((option) => {
			const button = h("button", "segment", option.label);
			button.type = "button";
			button.setAttribute("aria-pressed", "false");
			button.addEventListener("click", () => onChange(option.value));
			element.append(button);
			return {
				value: option.value,
				button
			};
		});
		return {
			element,
			set(value) {
				for (const item of buttons) item.button.setAttribute("aria-pressed", String(item.value === value));
			}
		};
	}
	function describeAge(ms) {
		const seconds = Math.max(1, Math.round(ms / 1e3));
		if (seconds < 90) return `${seconds}s ago`;
		const minutes = Math.round(seconds / 60);
		if (minutes < 90) return `${minutes}m ago`;
		return `${Math.round(minutes / 60)}h ago`;
	}
	/**
	* Paints the whole settings page into `root` and returns a teardown that removes
	* the storage listener it installed.
	*/
	async function renderSettings(root, host) {
		const style = h("style");
		style.textContent = settings_default;
		root.append(style);
		const page = h("div", "instagrous-page");
		root.append(page);
		const surfaceRoot = root.getRootNode();
		const themeTarget = "host" in surfaceRoot && surfaceRoot.host instanceof HTMLElement ? surfaceRoot.host : document.documentElement;
		let settings = structuredClone(DEFAULT_SETTINGS);
		const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
		const applyAppearance = () => {
			const { theme, glass } = settings.appearance;
			const resolved = theme === "system" ? darkQuery.matches ? "dark" : "light" : theme;
			const forced = themeTarget.dataset.forceTheme;
			themeTarget.dataset.theme = theme === "system" && forced ? forced : resolved;
			themeTarget.dataset.glass = glass ? "on" : "off";
		};
		const header = h("header", "top");
		const brand = h("div", "brand");
		const mark = h("span", "brand-mark");
		mark.innerHTML = gearSvg(28);
		brand.append(mark, h("h1", "brand-name", "INSTAGROUS"));
		const topRight = h("div", "top-right");
		topRight.append(h("span", "version", `v${host.version}`));
		if (host.onClose) {
			const close = h("button", "close");
			close.type = "button";
			close.setAttribute("aria-label", "Close INSTAGROUS");
			close.innerHTML = "<svg viewBox=\"0 0 24 24\" width=\"16\" height=\"16\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.2\" stroke-linecap=\"round\" aria-hidden=\"true\"><path d=\"M6 6l12 12M18 6L6 18\"/></svg>";
			close.addEventListener("click", () => host.onClose?.());
			topRight.append(close);
		}
		header.append(brand, topRight);
		const ads = section("Ad blocking", "Hides paid posts and stops ad-network requests while Instagram is open.");
		const adsMaster = makeSwitch("Ad blocking", (next) => void commit({
			...settings,
			ads: {
				...settings.ads,
				enabled: next
			}
		}));
		const adsSponsored = makeSwitch("Sponsored posts", (next) => void commit({
			...settings,
			ads: {
				...settings.ads,
				sponsored: next
			}
		}));
		const adsNetwork = makeSwitch("Ad and tracker requests", (next) => void commit({
			...settings,
			ads: {
				...settings.ads,
				network: next
			}
		}));
		ads.body.append(row("Block ads", "The two switches below, at once.", adsMaster.button), row("Sponsored posts", "Posts Instagram labels as sponsored are hidden before you read them.", adsSponsored.button), row("Ad and tracker requests", "Known ad networks and trackers are blocked while Instagram is open.", adsNetwork.button));
		const ghost = section("Ghost mode", "Opening a story or a chat does not tell the other person that you did.");
		const ghostMaster = makeSwitch("Ghost mode", (next) => void commit({
			...settings,
			ghost: {
				...settings.ghost,
				enabled: next
			}
		}));
		const ghostStoriesSwitch = makeSwitch("Stories", (next) => void commit({
			...settings,
			ghost: {
				...settings.ghost,
				stories: next
			}
		}));
		const ghostMessagesSwitch = makeSwitch("Direct messages", (next) => void commit({
			...settings,
			ghost: {
				...settings.ghost,
				messages: next
			}
		}));
		const ghostTypingSwitch = makeSwitch("Typing indicator", (next) => void commit({
			...settings,
			ghost: {
				...settings.ghost,
				typing: next
			}
		}));
		ghost.body.append(row("Ghost mode", "The three switches below, at once.", ghostMaster.button), row("Stories", "A story you open is not reported as seen.", ghostStoriesSwitch.button), row("Direct messages", "Opening a chat does not send a read receipt.", ghostMessagesSwitch.button), row("Typing indicator", "Do not send 'typing...' indicator while drafting direct messages.", ghostTypingSwitch.button));
		const caution = h("p", "caution");
		caution.textContent = "Ghost mode works by dropping the requests Instagram uses to report that you read something. Instagram does not offer this switch and its terms do not allow it, so it may stop working without warning — and the risk to your account is yours.";
		caution.hidden = true;
		ghost.root.append(caution);
		const appearance = section("Appearance", "The surface on both sides of your Instagram.");
		const themeControl = segmented([
			{
				value: "system",
				label: "System"
			},
			{
				value: "light",
				label: "Light"
			},
			{
				value: "dark",
				label: "Dark"
			}
		], (theme) => void commit({
			...settings,
			appearance: {
				...settings.appearance,
				theme
			}
		}));
		const glassSwitch = makeSwitch("Glass surfaces", (next) => void commit({
			...settings,
			appearance: {
				...settings.appearance,
				glass: next
			}
		}));
		const auraSwitch = makeSwitch("Ambient aura", (next) => void commit({
			...settings,
			appearance: {
				...settings.appearance,
				ambientGlow: next
			}
		}));
		const tintSwitch = makeSwitch("Tint Instagram", (next) => void commit({
			...settings,
			appearance: {
				...settings.appearance,
				tintInstagram: next
			}
		}));
		appearance.body.append(row("Theme", "Follows your system unless you pin one.", themeControl.element), row("Glass surfaces", "Translucent panels with background blur.", glassSwitch.button), row("Ambient aura", "Media casts a subtle cinematic diffused glow in dark mode.", auraSwitch.button), row("Tint Instagram", "Rounded post media, glass dialogs, softer dividers. Visible as soon as it is on.", tintSwitch.button));
		const downloads = section("Downloads", "Hover a photo, reel or profile picture and save it. For your own eyes only.");
		const downloadsMaster = makeSwitch("Download buttons", (next) => void commit({
			...settings,
			downloads: {
				...settings.downloads,
				enabled: next
			}
		}));
		const shortcutsSwitch = makeSwitch("Keyboard controls", (next) => void commit({
			...settings,
			downloads: {
				...settings.downloads,
				shortcuts: next
			}
		}));
		downloads.body.append(row("Download buttons", "A save button appears when you hover media on Instagram. Carousels show a Save All button.", downloadsMaster.button), row("Keyboard controls", "Space to play/pause, Left/Right arrows to seek 5s, M to mute, F for fullscreen.", shortcutsSwitch.button));
		const session = section("Instagram session", "For your own tools. The value is written to a file; it is never shown on screen.");
		const sessionState = h("span", "stat is-quiet", "");
		const sessionButton = h("button", "action", "Export");
		sessionButton.type = "button";
		const sessionActions = h("div", "row-actions");
		sessionActions.append(sessionState, sessionButton);
		sessionButton.addEventListener("click", () => {
			(async () => {
				sessionButton.disabled = true;
				sessionState.textContent = "working";
				const response = await chrome.runtime.sendMessage({ type: "export-session" }).catch(() => null);
				sessionButton.disabled = false;
				sessionState.classList.toggle("is-quiet", response?.status !== "ok");
				sessionState.textContent = response?.status === "ok" ? "saved" : response?.status === "missing" ? "not signed in" : "failed";
			})();
		});
		session.body.append(row("sessionid cookie", "Writes your Instagram session token to a text file in your downloads. Anyone who has that file can sign in as you, so keep it on this machine.", sessionActions));
		const diagnostics = section("Diagnostics", "What it is actually doing, so you can check it.");
		const ghostStat = h("span", "stat", "—");
		const rulesetStat = h("span", "stat", "—");
		const pageStat = h("span", "stat", "—");
		const styleStat = h("span", "stat", "—");
		const hiddenStat = h("span", "stat", "—");
		diagnostics.body.append(row("Ghost suppressed", "Counted on the page you have open.", ghostStat), row("Ad ruleset", "Whether Chrome has the blocklist switched on.", rulesetStat), row("Page script", "Whether INSTAGROUS is running in the tab you have open.", pageStat), row("Stylesheet", "Whether its rules reached the page. “Missing” means reload Instagram.", styleStat), row("Ads hidden", "Sponsored posts removed on this page.", hiddenStat));
		async function refreshDiagnostics() {
			const hits = await readGhostHits();
			const total = hits.stories + hits.messages;
			ghostStat.textContent = total === 0 ? "nothing yet" : `${hits.stories} stories · ${hits.messages} messages`;
			ghostStat.classList.toggle("is-quiet", total === 0);
			const rulesetOn = await host.readRulesetOn().catch(() => false);
			rulesetStat.textContent = rulesetOn ? "on" : "off";
			rulesetStat.classList.toggle("is-quiet", !rulesetOn);
			const page = await readPageHealth();
			const age = page ? Date.now() - page.at : Number.POSITIVE_INFINITY;
			const live = age < 3e4;
			pageStat.textContent = !page ? "not connected" : live ? "connected" : `last seen ${describeAge(age)}`;
			pageStat.classList.toggle("is-quiet", !live);
			styleStat.textContent = !page ? "—" : page.stylesheet ? "loaded" : "missing";
			styleStat.classList.toggle("is-quiet", !page?.stylesheet);
			hiddenStat.textContent = !page ? "—" : page.hidden === 0 ? "nothing yet" : `${page.hidden} on this page`;
			hiddenStat.classList.toggle("is-quiet", !page || page.hidden === 0);
		}
		page.append(header, ads.root, ghost.root, appearance.root, downloads.root, session.root, diagnostics.root);
		function sync() {
			adsMaster.set(settings.ads.enabled, false);
			adsSponsored.set(settings.ads.sponsored, !settings.ads.enabled);
			adsNetwork.set(settings.ads.network, !settings.ads.enabled);
			ghostMaster.set(settings.ghost.enabled, false);
			ghostStoriesSwitch.set(settings.ghost.stories, !settings.ghost.enabled);
			ghostMessagesSwitch.set(settings.ghost.messages, !settings.ghost.enabled);
			ghostTypingSwitch.set(settings.ghost.typing, !settings.ghost.enabled);
			caution.hidden = !settings.ghost.enabled;
			downloadsMaster.set(settings.downloads.enabled, false);
			shortcutsSwitch.set(settings.downloads.shortcuts, false);
			themeControl.set(settings.appearance.theme);
			glassSwitch.set(settings.appearance.glass, false);
			auraSwitch.set(settings.appearance.ambientGlow, false);
			tintSwitch.set(settings.appearance.tintInstagram, false);
			applyAppearance();
		}
		async function commit(next) {
			settings = next;
			sync();
			await saveSettings(next);
		}
		settings = await loadSettings();
		sync();
		const onChanged = (changes, area) => {
			if (area === "local" && (changes["instagrous.ghostHits"] || changes["instagrous.page"])) {
				refreshDiagnostics();
				return;
			}
			if (area !== "sync" || !changes["instagrous.settings"]) return;
			loadSettings().then((next) => {
				settings = next;
				sync();
			});
		};
		chrome.storage.onChanged.addListener(onChanged);
		darkQuery.addEventListener("change", () => {
			if (settings.appearance.theme === "system") applyAppearance();
		});
		refreshDiagnostics();
		return () => {
			chrome.storage.onChanged.removeListener(onChanged);
			page.remove();
			style.remove();
		};
	}
	// src/shared/messages.ts
	var isTogglePage = (value) => typeof value === "object" && value !== null && value.type === "toggle-page";
	// src/content/page.ts
	/**
	* INSTAGROUS as a section of Instagram.
	*
	* Not a panel, not a modal: an item in the same list as Home, Reels, Messages,
	* Search, Notifications, Create and Profile, and a page that renders into the
	* content area when you click it. Nothing is built until that click, and
	* clicking any other item puts Instagram back exactly as it was.
	*
	* Two rules keep this from breaking the app it lives in:
	*  - our nav item is a sibling of Instagram's items, never a replacement, and
	*    it is re-checked on every sweep because their navigation is re-rendered on
	*    route changes;
	*  - Instagram's content is hidden with an attribute plus one CSS rule rather
	*    than by detaching or hiding their nodes, so restoring it costs nothing and
	*    cannot disturb their renderer.
	*
	* Their nav carries hashed class names (`x1iyjqo2 xh8yej3 xc26acl` today), so
	* the container is found structurally: the ancestor whose direct children each
	* hold a navigation link. That survives a class-name change.
	*/
	var NAV_CLASS = "instagrous-nav";
	var ITEM_CLASS = "instagrous-item";
	var ROOT_ID$1 = "instagrous-page";
	var OPEN_ATTR = "data-instagrous-open";
	/** The mark, exactly as it appears in the header and on the badge. */
	var MARK_ICON = gearSvg(24);
	/** Below this, Instagram has collapsed the rail to icons and hidden its labels. */
	var RAIL_THRESHOLD = 140;
	var navItem = null;
	var resizing = null;
	var observed = null;
	var host = null;
	var teardown = null;
	var open = false;
	var openPath = "";
	/** Instagram's own surface colour decides our theme, not the OS. */
	function instagramTheme() {
		const body = document.body;
		if (!body) return "light";
		const background = getComputedStyle(body).backgroundColor;
		const match = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(background);
		if (!match) return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
		const [r, g, b] = [
			Number(match[1]),
			Number(match[2]),
			Number(match[3])
		];
		return .2126 * r + .7152 * g + .0722 * b < 128 ? "dark" : "light";
	}
	/**
	* The list that holds the nav items: an ancestor of a known route link whose
	* direct children each contain a link. Depth is bounded because walking to
	* <body> would find a "container" that is the whole page.
	*/
	function navList() {
		const anchors = document.querySelectorAll("a[href=\"/\"], a[href=\"/reels/\"], a[href=\"/explore/\"], a[href=\"/direct/inbox/\"]");
		for (const anchor of anchors) {
			let node = anchor.parentElement;
			for (let depth = 0; depth < 6 && node; depth += 1) {
				if (node.tagName !== "BODY" && node.tagName !== "HTML") {
					const children = Array.from(node.children);
					if (children.length > 12) {
						node = node.parentElement;
						continue;
					}
					if (children.filter((child) => child.querySelector("a[href]")).length >= 4) return node;
				}
				node = node.parentElement;
			}
		}
		return null;
	}
	/** The wrapper around the profile item, which our item sits after. */
	function profileWrapper(list) {
		const anchor = list.querySelector("img[alt$=\"profile picture\"]")?.closest("a");
		if (!anchor) return null;
		return Array.from(list.children).find((child) => child.contains(anchor)) ?? null;
	}
	function syncActive() {
		const button = navItem?.querySelector(`.${NAV_CLASS}`);
		if (!button) return;
		button.classList.toggle("is-active", open);
		button.setAttribute("aria-current", open ? "page" : "false");
	}
	function buildNavItem() {
		const item = document.createElement("div");
		item.className = ITEM_CLASS;
		const button = document.createElement("button");
		button.type = "button";
		button.className = NAV_CLASS;
		button.setAttribute("aria-label", "INSTAGROUS");
		button.innerHTML = `<span class="${NAV_CLASS}-icon">${MARK_ICON}</span><span class="${NAV_CLASS}-label">INSTAGROUS</span>`;
		button.addEventListener("click", (event) => {
			event.preventDefault();
			event.stopPropagation();
			toggleSection();
		});
		item.append(button);
		return item;
	}
	/**
	* Instagram's rail collapses to icons and hides its labels. Ours has to follow,
	* or a text label spills out of a 72px rail and the row stops lining up with
	* its neighbours.
	*/
	function syncRailMode(list) {
		const collapsed = list.getBoundingClientRect().width < RAIL_THRESHOLD;
		navItem?.classList.toggle("is-rail", collapsed);
	}
	function watchWidth(list) {
		if (observed === list) return;
		if (!resizing) resizing = new ResizeObserver(() => syncRailMode(list));
		if (observed) resizing.unobserve(observed);
		observed = list;
		resizing.observe(list);
	}
	/** Re-runnable: Instagram rebuilds its navigation on every route change. */
	function paintNavEntry() {
		const list = navList();
		if (!list) return;
		if (!navItem) navItem = buildNavItem();
		if (navItem.parentElement !== list) {
			const profile = profileWrapper(list);
			if (profile && profile.parentElement === list) list.insertBefore(navItem, profile.nextSibling);
			else list.append(navItem);
		}
		watchWidth(list);
		syncRailMode(list);
		if (open && location.pathname !== openPath) closeSection();
		syncActive();
	}
	function mainArea() {
		return document.querySelector("main[role=\"main\"], main");
	}
	async function readRulesetOn() {
		return (await chrome.runtime.sendMessage({ type: "status" }).catch(() => null))?.rulesetOn === true;
	}
	async function mount() {
		const main = mainArea();
		const target = main ?? document.body;
		const element = document.createElement("div");
		element.id = ROOT_ID$1;
		element.dataset.theme = instagramTheme();
		element.dataset.forceTheme = instagramTheme();
		if (!main) {
			const rail = navItem?.closest("div[class]")?.getBoundingClientRect().width ?? 0;
			element.style.cssText = [
				"position:fixed",
				"top:0",
				"right:0",
				"bottom:0",
				`left:${Math.round(rail) + 8}px`,
				"z-index:2147483000",
				"overflow-y:auto",
				"overscroll-behavior:contain"
			].join(";");
		}
		target.append(element);
		host = element;
		main?.setAttribute(OPEN_ATTR, "1");
		const shadow = element.attachShadow({ mode: "open" });
		const surface = document.createElement("div");
		surface.style.cssText = "min-height:100%;overflow-y:auto";
		shadow.append(surface);
		const dispose = await renderSettings(surface, {
			version: chrome.runtime.getManifest().version,
			readRulesetOn,
			onClose: closeSection
		});
		if (!element.isConnected) {
			dispose();
			return;
		}
		teardown = dispose;
		syncActive();
	}
	function openSection() {
		if (open) return;
		open = true;
		openPath = location.pathname;
		syncActive();
		mount();
	}
	function closeSection() {
		if (!open) return;
		open = false;
		teardown?.();
		teardown = null;
		host?.remove();
		host = null;
		mainArea()?.removeAttribute(OPEN_ATTR);
		syncActive();
	}
	function toggleSection() {
		if (open) closeSection();
		else openSection();
	}
	function installPage() {
		paintNavEntry();
		chrome.runtime.onMessage.addListener((message, sender) => {
			if (sender.id !== chrome.runtime.id) return false;
			if (!isTogglePage(message)) return false;
			toggleSection();
			return false;
		});
		document.addEventListener("click", (event) => {
			if (!open) return;
			const target = event.target;
			if (!(target instanceof Element)) return;
			if (navItem && (target === navItem || navItem.contains(target))) return;
			if (target.closest("a[href]")) closeSection();
		}, true);
		document.addEventListener("keydown", (event) => {
			if (!open || event.key !== "Escape") return;
			event.preventDefault();
			event.stopPropagation();
			closeSection();
		}, true);
	}
	// src/shared/install.ts
	/**
	* The install-time greeting.
	*
	* The service worker sets this flag and opens instagram.com; the content script
	* consumes it and clears it. "Once" is therefore per install, not per page, and
	* it survives the browser being restarted before the tab ever loads.
	*/
	var WELCOME_KEY = "instagrous.welcome";
	/** True at most once per install: reads the flag and clears it atomically. */
	async function consumeWelcome() {
		if ((await chrome.storage.local.get("instagrous.welcome").catch(() => null))?.["instagrous.welcome"] !== true) return false;
		await chrome.storage.local.set({ [WELCOME_KEY]: false }).catch(() => void 0);
		return true;
	}
	// src/content/welcome.ts
	/**
	* The install-time greeting card.
	*
	* Shown once per install, on the instagram.com tab the service worker opens. The
	* service worker cannot render anything itself, so it sets a flag and the content
	* script consumes it — that is also what makes "once" mean once, even if the
	* browser is restarted before the tab ever loads.
	*
	* Typography is SF Pro where the machine has it, in the order Apple's own web
	* pages declare it. The layout is a sheet, not a landing page: one mark, one
	* heading, three facts separated by hairlines, one button. The first version had
	* blue tick circles and three bold marketing lines per row, which is exactly what
	* made it look assembled rather than designed.
	*/
	var ROOT_ID = "instagrous-welcome";
	var CARD_CSS = `
  :host { all: initial; }

  .scrim {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    background: rgba(0, 0, 0, 0.3);
    -webkit-backdrop-filter: blur(14px);
    backdrop-filter: blur(14px);
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', 'Segoe UI', Roboto, sans-serif;
    -webkit-font-smoothing: antialiased;
  }

  .card {
    width: min(400px, 100%);
    padding: 26px 26px 20px;
    border-radius: 20px;
    background: rgba(250, 250, 250, 0.94);
    -webkit-backdrop-filter: blur(40px) saturate(180%);
    backdrop-filter: blur(40px) saturate(180%);
    border: 1px solid rgba(255, 255, 255, 0.55);
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.28);
    color: #1d1d1f;
    animation: appear 240ms cubic-bezier(0.16, 1, 0.3, 1);
  }

  .mark {
    display: block;
    width: 30px;
    height: 30px;
    margin-bottom: 16px;
    color: #1d1d1f;
  }

  .mark svg { display: block; }

  h1 {
    margin: 0;
    font-size: 19px;
    font-weight: 600;
    letter-spacing: -0.021em;
    line-height: 1.25;
  }

  .lede {
    margin: 5px 0 18px;
    font-size: 13px;
    line-height: 1.45;
    color: #6e6e73;
  }

  ul {
    margin: 0 0 20px;
    padding: 0;
    list-style: none;
  }

  li {
    padding: 9px 0;
    font-size: 13px;
    line-height: 1.45;
    color: #6e6e73;
    border-top: 1px solid rgba(0, 0, 0, 0.07);
  }

  li:first-child { border-top: 0; padding-top: 0; }
  li b { font-weight: 600; color: #1d1d1f; }

  .button {
    width: 100%;
    height: 42px;
    border: 0;
    border-radius: 11px;
    background: #0071e3;
    color: #ffffff;
    font-family: inherit;
    font-size: 14px;
    font-weight: 590;
    letter-spacing: -0.01em;
    cursor: pointer;
    transition: background-color 120ms ease;
  }

  .button:hover { background: #0077ed; }
  .button:active { background: #0062c4; }
  .button:focus-visible { outline: 2px solid #0071e3; outline-offset: 3px; }

  .foot {
    margin: 12px 0 0;
    font-size: 11px;
    line-height: 1.4;
    color: #86868b;
    text-align: center;
  }

  @keyframes appear {
    from { opacity: 0; transform: translateY(6px); }
  }

  @media (prefers-color-scheme: dark) {
    .card {
      background: rgba(28, 28, 30, 0.9);
      border-color: rgba(255, 255, 255, 0.1);
      box-shadow: 0 24px 64px rgba(0, 0, 0, 0.55);
      color: #f5f5f7;
    }
    .mark { color: #f5f5f7; }
    .lede, li { color: #a1a1a6; }
    li { border-top-color: rgba(255, 255, 255, 0.09); }
    li b { color: #f5f5f7; }
    .button { background: #0a84ff; }
    .button:hover { background: #3d9dff; }
    .button:active { background: #0071e3; }
  }

  @media (prefers-reduced-motion: reduce) {
    .card { animation: none; }
  }
`;
	var ROWS = [
		["Ads", "Paid posts and ad networks are blocked before you reach them."],
		["Stories and chats", "Ghost mode drops the requests that report what you read."],
		["Media", "Hover a photo, reel or profile picture and save it."]
	];
	function build() {
		const host = document.createElement("div");
		host.id = ROOT_ID;
		host.style.cssText = "position:fixed;inset:0;z-index:2147483001;";
		const shadow = host.attachShadow({ mode: "open" });
		const style = document.createElement("style");
		style.textContent = CARD_CSS;
		const scrim = document.createElement("div");
		scrim.className = "scrim";
		const card = document.createElement("div");
		card.className = "card";
		card.setAttribute("role", "dialog");
		card.setAttribute("aria-modal", "true");
		card.setAttribute("aria-labelledby", "instagrous-welcome-title");
		const mark = document.createElement("div");
		mark.className = "mark";
		mark.innerHTML = gearSvg(30);
		const title = document.createElement("h1");
		title.id = "instagrous-welcome-title";
		title.textContent = "Yes, it is already on";
		const lede = document.createElement("p");
		lede.className = "lede";
		lede.textContent = "INSTAGROUS is installed. Three things changed, and nothing needs setting up.";
		const list = document.createElement("ul");
		for (const [head, detail] of ROWS) {
			const item = document.createElement("li");
			const strong = document.createElement("b");
			strong.textContent = head;
			item.append(strong, document.createTextNode(` — ${detail}`));
			list.append(item);
		}
		const close = document.createElement("button");
		close.type = "button";
		close.className = "button";
		close.textContent = "Continue";
		close.addEventListener("click", dismiss);
		const foot = document.createElement("p");
		foot.className = "foot";
		foot.textContent = "Everything stays in this browser. No account, no server, no analytics.";
		card.append(mark, title, lede, list, close, foot);
		scrim.append(card);
		shadow.append(style, scrim);
		return host;
	}
	function dismiss() {
		close();
	}
	var onKey = null;
	function close() {
		document.getElementById(ROOT_ID)?.remove();
		if (onKey) document.removeEventListener("keydown", onKey, true);
		onKey = null;
	}
	/** Shows the greeting when this install has not shown it yet. */
	async function maybeShowWelcome() {
		if (!await consumeWelcome()) return;
		if (document.getElementById(ROOT_ID)) return;
		document.body.append(build());
		onKey = (event) => {
			if (event.key !== "Escape") return;
			event.preventDefault();
			event.stopPropagation();
			close();
		};
		document.addEventListener("keydown", onKey, true);
	}
	// src/content/theme.ts
	/**
	* The optional Instagram theme enhancements:
	*  - Post media gets 12px corners
	*  - Glass dialogs (rounded, lifted, blurred backdrop)
	*  - Softened dividers and scrollbars
	*  - Optional Ambient Aura: subtle diffused glow around media in dark mode
	*/
	var STYLE_ID = "instagrous-theme";
	var BASE_CSS = `
  :root {
    --ig-separator: rgba(120, 120, 128, 0.22);
    --ig-highlight-background: rgba(120, 120, 128, 0.08);
  }

  /* Post media corners */
  article img,
  article video,
  [role='presentation'] img,
  [role='presentation'] video {
    border-radius: 12px !important;
  }

  /* Glass dialog surfaces */
  [role='dialog'] {
    border-radius: 22px !important;
    box-shadow: 0 30px 90px rgba(0, 0, 0, 0.45) !important;
    -webkit-backdrop-filter: blur(26px) saturate(180%) !important;
    backdrop-filter: blur(26px) saturate(180%) !important;
  }

  hr,
  [role='separator'] {
    opacity: 0.45;
  }

  ::-webkit-scrollbar {
    width: 10px;
    height: 10px;
  }

  ::-webkit-scrollbar-track {
    background: transparent;
  }

  ::-webkit-scrollbar-thumb {
    background: rgba(120, 120, 128, 0.45);
    background-clip: content-box;
    border: 3px solid transparent;
    border-radius: 8px;
  }

  ::-webkit-scrollbar-thumb:hover {
    background: rgba(120, 120, 128, 0.7);
    background-clip: content-box;
  }
`;
	var AURA_CSS = `
  /* Ambient Aura: subtle diffused glow around media in dark mode */
  article img,
  article video,
  [role='presentation'] img,
  [role='presentation'] video {
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.35), 0 0 45px rgba(0, 149, 246, 0.16) !important;
    transition: box-shadow 260ms ease, transform 260ms ease !important;
  }

  article:hover img,
  article:hover video {
    box-shadow: 0 14px 44px rgba(0, 0, 0, 0.5), 0 0 60px rgba(0, 149, 246, 0.24) !important;
  }
`;
	var currentTint = false;
	var currentAura = false;
	function syncStyles() {
		const head = document.head;
		if (!head) return;
		let existing = document.getElementById(STYLE_ID);
		if (!currentTint && !currentAura) {
			existing?.remove();
			return;
		}
		if (!existing) {
			existing = document.createElement("style");
			existing.id = STYLE_ID;
			head.append(existing);
		}
		let content = "";
		if (currentTint) content += BASE_CSS;
		if (currentAura) content += AURA_CSS;
		existing.textContent = content;
	}
	function setAppearance(tintOn, auraOn) {
		currentTint = tintOn;
		currentAura = auraOn;
		if (document.head) {
			syncStyles();
			return;
		}
		document.addEventListener("DOMContentLoaded", syncStyles, { once: true });
	}
	// src/content/video-controls.ts
	/**
	* INSTAGROUS — Video Keyboard Navigation & Scrubbing.
	*
	* Provides desktop keyboard controls for reels, stories, and feed videos:
	*  - Space: Toggle Play / Pause
	*  - Left Arrow (←): Seek backward 5 seconds
	*  - Right Arrow (→): Seek forward 5 seconds
	*  - M: Toggle Mute / Unmute
	*  - F: Toggle Fullscreen
	*
	* Displays a subtle, Apple-inspired HUD pill when seeking or pausing.
	* Safely ignores key events when user is typing in inputs, comments, or DMs.
	*/
	var enabled = true;
	var hoveredVideo = null;
	var hudElement = null;
	var hudTimer = 0;
	function isTyping(target) {
		if (!target || !(target instanceof HTMLElement)) return false;
		const tag = target.tagName.toLowerCase();
		if (tag === "input" || tag === "textarea" || tag === "select") return true;
		if (target.isContentEditable || target.getAttribute("role") === "textbox") return true;
		if (target.closest("input, textarea, [contenteditable=\"true\"], [role=\"textbox\"]")) return true;
		return false;
	}
	function getActiveVideo() {
		if (hoveredVideo && hoveredVideo.isConnected) return hoveredVideo;
		const videos = Array.from(document.querySelectorAll("video"));
		const playing = videos.find((v) => !v.paused && !v.ended && v.readyState > 2);
		if (playing) return playing;
		const viewportCenter = window.innerHeight / 2;
		let bestVideo = null;
		let minDistance = Number.POSITIVE_INFINITY;
		for (const video of videos) {
			const rect = video.getBoundingClientRect();
			if (rect.height < 40 || rect.width < 40) continue;
			const videoCenter = rect.top + rect.height / 2;
			const distance = Math.abs(videoCenter - viewportCenter);
			if (rect.bottom > 0 && rect.top < window.innerHeight && distance < minDistance) {
				minDistance = distance;
				bestVideo = video;
			}
		}
		return bestVideo;
	}
	var HUD_STYLE = `
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%) scale(0.95);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: 999px;
  background: rgba(18, 18, 20, 0.85);
  -webkit-backdrop-filter: blur(16px);
  backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
  color: #ffffff;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif;
  font-size: 13px;
  font-weight: 600;
  pointer-events: none;
  z-index: 2147483000;
  opacity: 0;
  transition: opacity 120ms ease, transform 120ms cubic-bezier(0.16, 1, 0.3, 1);
`;
	function showHud(video, svgHtml, text) {
		const parent = video.parentElement;
		if (!parent) return;
		if (!hudElement || !hudElement.isConnected) {
			hudElement = document.createElement("div");
			hudElement.style.cssText = HUD_STYLE;
		}
		if (getComputedStyle(parent).position === "static") parent.style.position = "relative";
		hudElement.innerHTML = `${svgHtml}${text ? `<span>${text}</span>` : ""}`;
		if (hudElement.parentElement !== parent) parent.append(hudElement);
		requestAnimationFrame(() => {
			if (!hudElement) return;
			hudElement.style.opacity = "1";
			hudElement.style.transform = "translate(-50%, -50%) scale(1)";
		});
		clearTimeout(hudTimer);
		hudTimer = window.setTimeout(() => {
			if (hudElement) {
				hudElement.style.opacity = "0";
				hudElement.style.transform = "translate(-50%, -50%) scale(0.95)";
			}
		}, 650);
	}
	var ICONS = {
		play: "<svg width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"currentColor\"><path d=\"M5 3l14 9-14 9V3z\"/></svg>",
		pause: "<svg width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"currentColor\"><path d=\"M6 19h4V5H6v14zm8-14v14h4V5h-4z\"/></svg>",
		seekBack: "<svg width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M11 17l-5-5 5-5M18 17l-5-5 5-5\"/></svg>",
		seekForward: "<svg width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M13 17l5-5-5-5M6 17l5-5-5-5\"/></svg>",
		volumeUp: "<svg width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><polygon points=\"11 5 6 9 2 9 2 15 6 15 11 19 11 5\"/><path d=\"M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07\"/></svg>",
		volumeMute: "<svg width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><polygon points=\"11 5 6 9 2 9 2 15 6 15 11 19 11 5\"/><line x1=\"23\" y1=\"9\" x2=\"17\" y2=\"15\"/><line x1=\"17\" y1=\"9\" x2=\"23\" y2=\"15\"/></svg>"
	};
	function onKeyDown(event) {
		if (!enabled) return;
		if (isTyping(event.target)) return;
		const code = event.code;
		if (code !== "Space" && code !== "ArrowLeft" && code !== "ArrowRight" && code !== "KeyM" && code !== "KeyF") return;
		const video = getActiveVideo();
		if (!video) return;
		if (code === "Space") {
			event.preventDefault();
			event.stopPropagation();
			if (video.paused) {
				video.play();
				showHud(video, ICONS.play);
			} else {
				video.pause();
				showHud(video, ICONS.pause);
			}
			return;
		}
		if (code === "ArrowLeft") {
			event.preventDefault();
			event.stopPropagation();
			video.currentTime = Math.max(0, video.currentTime - 5);
			showHud(video, ICONS.seekBack, "-5s");
			return;
		}
		if (code === "ArrowRight") {
			event.preventDefault();
			event.stopPropagation();
			const duration = Number.isFinite(video.duration) ? video.duration : video.currentTime + 30;
			video.currentTime = Math.min(duration, video.currentTime + 5);
			showHud(video, ICONS.seekForward, "+5s");
			return;
		}
		if (code === "KeyM") {
			event.preventDefault();
			event.stopPropagation();
			video.muted = !video.muted;
			showHud(video, video.muted ? ICONS.volumeMute : ICONS.volumeUp);
			return;
		}
		if (code === "KeyF") {
			event.preventDefault();
			event.stopPropagation();
			if (document.fullscreenElement) document.exitFullscreen();
			else video.requestFullscreen();
		}
	}
	var mounted = false;
	function mountVideoControls() {
		if (mounted) return;
		mounted = true;
		document.addEventListener("pointerover", (event) => {
			const target = event.target;
			if (target instanceof HTMLVideoElement) hoveredVideo = target;
			else if (target instanceof Element) {
				const found = target.querySelector("video");
				if (found) hoveredVideo = found;
			}
		}, {
			capture: true,
			passive: true
		});
		document.addEventListener("keydown", onKeyDown, { capture: true });
	}
	function setVideoControlsEnabled(on) {
		enabled = on;
	}
	// src/content/index.ts
	/**
	* INSTAGROUS — content script (isolated world).
	*
	* Jobs:
	*  1. Keep ghost flags on <html> in sync for the MAIN-world script;
	*  2. Tag sponsored posts so CSS hides them;
	*  3. Mount the hover download button;
	*  4. Apply appearance styling and optional ambient aura.
	*/
	var HIDDEN_ATTR = "data-instagrous-hidden";
	var SCANNED_ATTR = "data-instagrous-scanned";
	/**
	* Labels Instagram uses on paid posts, lowercased. Instagram localises this text,
	* so a single English string would silently stop working for most users.
	*/
	var SPONSORED_MARKERS = [
		"sponsored",
		"gesponsert",
		"patrocinado",
		"sponsorisé",
		"sponsorizzato",
		"sponsrad",
		"gesponsord",
		"sponsoreret",
		"广告",
		"광고",
		"реклама",
		"sponsrad inlägg"
	];
	var settings = null;
	var scheduled = 0;
	function setFlag(name, on) {
		const root = document.documentElement;
		if (!root) return;
		if (on) root.setAttribute(name, "1");
		else root.removeAttribute(name);
	}
	function applyGhostFlags(next) {
		setFlag("data-instagrous-ghost-stories", ghostsStories(next));
		setFlag("data-instagrous-ghost-messages", ghostsMessages(next));
		setFlag("data-instagrous-ghost-typing", ghostsTyping(next));
	}
	function isSponsored(article) {
		for (const node of article.querySelectorAll("span, a")) {
			const text = (node.textContent ?? "").trim().toLowerCase();
			if (!text || text.length > 32) continue;
			if (!SPONSORED_MARKERS.some((m) => text === m || text.startsWith(`${m} `))) continue;
			if (node.closest("h1, ul")) continue;
			return true;
		}
		return false;
	}
	function tag(article) {
		article.setAttribute(SCANNED_ATTR, "1");
		if (article.getAttribute(HIDDEN_ATTR) === "true") return;
		if (settings && blocksSponsored(settings) && isSponsored(article)) article.setAttribute(HIDDEN_ATTR, "true");
	}
	function scan() {
		if (!document.body || !settings || !blocksSponsored(settings)) return;
		for (const article of document.querySelectorAll(`article:not([${SCANNED_ATTR}])`)) tag(article);
	}
	/** Undo tagging so a settings change is applied to the posts already on screen. */
	function resetTags() {
		for (const article of document.querySelectorAll(`article[${SCANNED_ATTR}]`)) {
			article.removeAttribute(SCANNED_ATTR);
			article.removeAttribute(HIDDEN_ATTR);
		}
	}
	var lastHealth = "";
	function reportHealth() {
		const stylesheet = getComputedStyle(document.documentElement).getPropertyValue("--instagrous-stylesheet").trim() === "1";
		const hidden = document.querySelectorAll(`article[${HIDDEN_ATTR}]`).length;
		const state = `${stylesheet}:${hidden}`;
		if (state === lastHealth) return;
		lastHealth = state;
		chrome.storage.local.set({ [PAGE_KEY]: {
			stylesheet,
			hidden,
			at: Date.now()
		} });
	}
	/** One pass over the page: ads, then the badge, then the health report. */
	function sweep() {
		safe("sponsored scan", scan);
		safe("page entry", paintNavEntry);
		safe("page health", reportHealth);
	}
	function schedule() {
		if (document.hidden || scheduled) return;
		scheduled = window.setTimeout(() => {
			scheduled = 0;
			sweep();
		}, 120);
	}
	function start() {
		safe("instagrous page", installPage);
		mountDownloads();
		mountVideoControls();
		if (!document.body) {
			document.addEventListener("DOMContentLoaded", start, { once: true });
			return;
		}
		new MutationObserver(schedule).observe(document.body, {
			childList: true,
			subtree: true
		});
		sweep();
	}
	function safe(step, run) {
		try {
			run();
		} catch (error) {
			console.error(`[instagrous] ${step} failed`, error);
		}
	}
	async function reload() {
		let next;
		try {
			next = await loadSettings();
		} catch (error) {
			console.error("[instagrous] could not read settings, using defaults", error);
			next = migrate(DEFAULT_SETTINGS);
		}
		settings = next;
		safe("ghost flags", () => applyGhostFlags(next));
		safe("download button", () => setDownloadsEnabled(downloadButtonsOn(next)));
		safe("video controls", () => setVideoControlsEnabled(keyboardShortcutsOn(next)));
		safe("appearance styling", () => setAppearance(next.appearance.tintInstagram, next.appearance.ambientGlow));
		safe("sponsored reset", resetTags);
		safe("page sweep", sweep);
	}
	chrome.storage.onChanged.addListener((changes, area) => {
		if (area !== "sync" || !changes["instagrous.settings"]) return;
		reload();
	});
	function watchGhostHits() {
		const root = document.documentElement;
		if (!root) return;
		let last = "";
		new MutationObserver(() => {
			const raw = root.getAttribute(GHOST_HITS_ATTR);
			if (!raw || raw === last) return;
			last = raw;
			const hits = parseHitsAttribute(raw);
			if (hits.stories === 0 && hits.messages === 0) return;
			chrome.storage.local.set({ [GHOST_HITS_KEY]: hits });
		}).observe(root, {
			attributes: true,
			attributeFilter: [GHOST_HITS_ATTR]
		});
	}
	reload().finally(() => {
		safe("ghost diagnostics", watchGhostHits);
		safe("start", start);
		safe("welcome", () => void maybeShowWelcome());
	});
})();
