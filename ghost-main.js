(function() {
	// src/shared/diagnostics.ts
	var GHOST_HITS_ATTR = "data-instagrous-ghost-hits";
	// src/content/ghost-main.ts
	/**
	* INSTAGROUS — ghost mode & in-page media bridge (MAIN world).
	*
	* Runs in the page's own JavaScript world (world: "MAIN") at document_start.
	*
	* Jobs:
	*  1. Drop seen/read & typing indicator GraphQL mutations when ghost switches are active.
	*  2. Resolve authentic, full-resolution HD profile avatars via web_profile_info
	*     and React Fiber (eliminating 150x150 downscaled images).
	*  3. Capture complete .mp4 stream URLs before MSE/blob conversion hides them.
	*  4. Harvest all slides for carousel posts for one-click batch saving ("Save All").
	*  5. Execute clean in-page blob downloads with native referer & credentials,
	*     preventing "Check internet connection" CDN rejections and duplicate downloads.
	*/
	var SEEN_OPERATIONS = ["PolarisStoriesV3SeenMutation", "StoriesV3SeenMutation"];
	var READ_OPERATIONS = ["useIGDMarkThreadAsReadMutation", "IGDMarkThreadAsRead"];
	var TYPING_OPERATIONS = [
		"useIGDUpdateTypingIndicatorMutation",
		"IGDUpdateTypingIndicatorMutation",
		"IGDUpdateTypingIndicator",
		"update_typing_indicator"
	];
	var STORY_FLAG = "data-instagrous-ghost-stories";
	var MESSAGE_FLAG = "data-instagrous-ghost-messages";
	var TYPING_FLAG = "data-instagrous-ghost-typing";
	var hits = {
		stories: 0,
		messages: 0,
		typing: 0
	};
	var flagOn = (name) => document.documentElement?.getAttribute(name) === "1";
	function publishHits() {
		try {
			document.documentElement?.setAttribute(GHOST_HITS_ATTR, `${hits.stories}:${hits.messages}`);
		} catch {}
	}
	function count(kind) {
		hits[kind] += 1;
		publishHits();
	}
	function mentions(value, needles) {
		if (typeof value === "string") return needles.some((n) => value.includes(n));
		if (value instanceof URLSearchParams) return mentions(value.toString(), needles);
		if (value instanceof FormData) {
			for (const entry of value.values()) if (typeof entry === "string" && needles.some((n) => entry.includes(n))) return true;
		}
		return false;
	}
	function suppressKind(url, body, headers) {
		if (flagOn(TYPING_FLAG) && (url.includes("/typing/") || url.includes("/typing_indicator/"))) return "typing";
		if (!url || !url.includes("graphql")) return null;
		let friendly = "";
		if (headers) try {
			friendly = new Headers(headers).get("x-fb-friendly-name") ?? "";
		} catch {
			friendly = "";
		}
		const hits_ = (needles) => needles.some((n) => friendly.includes(n)) || mentions(body, needles);
		if (flagOn(STORY_FLAG) && hits_(SEEN_OPERATIONS)) return "stories";
		if (flagOn(MESSAGE_FLAG) && hits_(READ_OPERATIONS)) return "messages";
		if (flagOn(TYPING_FLAG) && hits_(TYPING_OPERATIONS)) return "typing";
		return null;
	}
	var quietResponse = () => new Response("{\"status\":\"ok\",\"data\":{}}", {
		status: 200,
		headers: { "content-type": "application/json" }
	});
	var mediaRegistry = /* @__PURE__ */ new Map();
	var carouselRegistry = /* @__PURE__ */ new Map();
	var avatarCache = /* @__PURE__ */ new Map();
	function cleanVideoUrl(rawUrl) {
		try {
			const parsed = new URL(rawUrl);
			parsed.searchParams.delete("bytestart");
			parsed.searchParams.delete("byteend");
			return parsed.toString();
		} catch {
			return rawUrl;
		}
	}
	function isGenuineHdAvatar(url) {
		if (!url || typeof url !== "string" || !url.startsWith("http")) return false;
		if (url.includes("s150x150") || url.includes("s240x240") || url.includes("s320x320") || url.includes("dst-jpg_s150") || url.includes("dst-jpg_s240") || url.includes("dst-jpg_s320")) return false;
		return url.includes("1080x1080") || !url.includes("_s") && !url.includes("/s");
	}
	function extractBestHdAvatar(user) {
		if (!user) return null;
		const info = user.hd_profile_pic_url_info;
		if (info?.url && typeof info.url === "string") {
			if (isGenuineHdAvatar(info.url) || info.width && info.width >= 1e3) return info.url;
		}
		const versions = user.hd_profile_pic_versions;
		if (Array.isArray(versions) && versions.length > 0) {
			const sorted = [...versions].sort((a, b) => (b?.width || 0) - (a?.width || 0));
			for (const v of sorted) if (v?.url && (isGenuineHdAvatar(v.url) || v.width && v.width >= 1e3)) return v.url;
		}
		const hd = user.profile_pic_url_hd;
		if (hd && isGenuineHdAvatar(hd)) return hd;
		return null;
	}
	function getCsrfToken() {
		if (typeof document === "undefined") return "";
		return document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/)?.[1] || "";
	}
	function extractHdAvatarFromDOM(targetUsername) {
		if (typeof document === "undefined") return null;
		const scripts = document.querySelectorAll("script");
		const cleanUser = targetUsername?.trim().toLowerCase();
		for (const script of scripts) {
			const text = script.textContent;
			if (!text || !text.includes("hd_profile_pic") && !text.includes("1080x1080")) continue;
			if (cleanUser && !text.toLowerCase().includes(`"${cleanUser}"`) && scripts.length > 5) continue;
			const infoRegex = /"hd_profile_pic_url_info"\s*:\s*\{[^}]*?"url"\s*:\s*"([^"]+)"/g;
			let m;
			while ((m = infoRegex.exec(text)) !== null) {
				const rawUrl = m[1].replace(/\\u0026/g, "&").replace(/\\/g, "");
				if (rawUrl.startsWith("http") && isGenuineHdAvatar(rawUrl)) return rawUrl;
			}
			const versionsRegex = /"hd_profile_pic_versions"\s*:\s*\[([\s\S]*?)\]/g;
			let vm;
			while ((vm = versionsRegex.exec(text)) !== null) try {
				const sorted = JSON.parse(`[${vm[1]}]`).sort((a, b) => (b.width || 0) - (a.width || 0));
				for (const item of sorted) if (item?.url) {
					const cleanUrl = item.url.replace(/\\u0026/g, "&").replace(/\\/g, "");
					if (isGenuineHdAvatar(cleanUrl) || item.width && item.width >= 1e3) return cleanUrl;
				}
			} catch {}
			const cdn1080 = /https:\/\/[^"'\s\\]+?(?:t51\.[0-9]+-19|-19\/)[^"'\s\\]+?1080x1080[^"'\s\\]+/g;
			let cm;
			while ((cm = cdn1080.exec(text)) !== null) {
				const u = cm[0].replace(/\\u0026/g, "&").replace(/\\/g, "");
				if (u.startsWith("http")) return u;
			}
		}
		return null;
	}
	function harvestMedia(obj) {
		if (!obj || typeof obj !== "object") return;
		if (Array.isArray(obj)) {
			for (const item of obj) harvestMedia(item);
			return;
		}
		const record = obj;
		const code = record.code || record.shortcode;
		const id = record.id || record.pk;
		let bestVideo;
		let bestPhoto;
		const rawCarousel = record.carousel_media || record.edge_sidecar_to_children?.edges?.map((e) => e.node).filter(Boolean);
		if (Array.isArray(rawCarousel) && rawCarousel.length > 0) {
			const slides = [];
			for (const slide of rawCarousel) {
				if (!slide || typeof slide !== "object") continue;
				if (Array.isArray(slide.video_versions) && slide.video_versions.length > 0) {
					const vUrl = slide.video_versions[0]?.url;
					if (typeof vUrl === "string") {
						slides.push({
							url: cleanVideoUrl(vUrl),
							kind: "video"
						});
						continue;
					}
				}
				if (typeof slide.video_url === "string" && slide.video_url.startsWith("http")) {
					slides.push({
						url: cleanVideoUrl(slide.video_url),
						kind: "video"
					});
					continue;
				}
				const pUrl = (slide.image_versions2?.candidates || slide.candidates)?.[0]?.url || slide.display_url || Array.isArray(slide.display_resources) && slide.display_resources[slide.display_resources.length - 1]?.src;
				if (typeof pUrl === "string" && pUrl.startsWith("http")) slides.push({
					url: pUrl,
					kind: "photo"
				});
			}
			if (slides.length > 0) {
				if (code) carouselRegistry.set(code, slides);
				if (id) carouselRegistry.set(String(id), slides);
			}
		}
		if (Array.isArray(record.video_versions) && record.video_versions.length > 0) {
			const candidate = [...record.video_versions].sort((a, b) => (b?.width || 0) - (a?.width || 0))[0]?.url;
			if (typeof candidate === "string" && candidate.startsWith("http")) bestVideo = cleanVideoUrl(candidate);
		}
		if (!bestVideo && typeof record.video_url === "string" && record.video_url.startsWith("http")) bestVideo = cleanVideoUrl(record.video_url);
		const candidates = record.image_versions2?.candidates || record.candidates;
		if (Array.isArray(candidates) && candidates.length > 0) {
			const candidate = [...candidates].sort((a, b) => (b?.width || 0) - (a?.width || 0))[0]?.url;
			if (typeof candidate === "string" && candidate.startsWith("http")) bestPhoto = candidate;
		}
		if (!bestPhoto && typeof record.display_url === "string" && record.display_url.startsWith("http")) bestPhoto = record.display_url;
		const user = record.user || record.owner || record.profileUser;
		if (user && typeof user.username === "string") {
			const bestHd = extractBestHdAvatar(user);
			if (bestHd) avatarCache.set(user.username.toLowerCase(), bestHd);
		}
		if ((bestVideo || bestPhoto) && (code || id)) {
			const entry = {
				video: bestVideo,
				photo: bestPhoto
			};
			if (code) mediaRegistry.set(code, entry);
			if (id) mediaRegistry.set(String(id), entry);
		}
		for (const key of Object.keys(record)) {
			const child = record[key];
			if (typeof child === "object" && child !== null) harvestMedia(child);
		}
	}
	function inspectResponse(url, json) {
		if (!url || typeof json !== "object" || json === null) return;
		try {
			harvestMedia(json);
		} catch {}
	}
	/**
	* Resolves authentic HD 1080x1080 profile picture URL using Instagram's official
	* web profile info endpoint or React Fiber tree.
	*/
	async function resolveHdAvatar(username) {
		const clean = username.trim().toLowerCase();
		if (!clean) return null;
		if (avatarCache.has(clean)) {
			const cached = avatarCache.get(clean);
			if (isGenuineHdAvatar(cached)) return cached;
			avatarCache.delete(clean);
		}
		const fromDom = extractHdAvatarFromDOM(clean);
		if (fromDom) {
			avatarCache.set(clean, fromDom);
			return fromDom;
		}
		const candidates = [
			document.querySelector("main"),
			document.querySelector("header"),
			document.querySelector("img[src*=\"-19/\"]"),
			document.querySelector("img[alt*=\"profile\" i]"),
			document.body
		];
		for (const el of candidates) {
			if (!el) continue;
			let curr = el;
			while (curr) {
				const fiberKey = Object.keys(curr).find((k) => k.startsWith("__reactFiber$") || k.startsWith("__reactInternalInstance$"));
				if (fiberKey) {
					let fiber = curr[fiberKey];
					let depth = 0;
					while (fiber && depth < 25) {
						const props = fiber.memoizedProps;
						if (props) {
							const best = extractBestHdAvatar(props.user || props.profileUser || props.userData || props.profile || props.owner);
							if (best) {
								avatarCache.set(clean, best);
								return best;
							}
						}
						fiber = fiber.return;
						depth += 1;
					}
				}
				curr = curr.parentElement;
			}
		}
		const appId = document.body?.innerHTML?.match(/"X-IG-App-ID":"(\d+)"/)?.[1] || "936619743392459";
		const csrfToken = getCsrfToken();
		const apiHeaders = {
			"x-ig-app-id": appId,
			"x-requested-with": "XMLHttpRequest",
			"x-asbd-id": "129477",
			"accept": "*/*"
		};
		if (csrfToken) apiHeaders["x-csrftoken"] = csrfToken;
		try {
			const response = await fetch(`/api/v1/users/web_profile_info/?username=${encodeURIComponent(clean)}`, {
				headers: apiHeaders,
				credentials: "include"
			});
			if (response.ok) {
				const user = (await response.json())?.data?.user;
				const best = extractBestHdAvatar(user);
				if (best) {
					avatarCache.set(clean, best);
					return best;
				}
				const userId = user?.id || user?.pk;
				if (userId) try {
					const mobileResp = await fetch(`/api/v1/users/${userId}/info/`, {
						headers: apiHeaders,
						credentials: "include"
					});
					if (mobileResp.ok) {
						const mBest = extractBestHdAvatar((await mobileResp.json())?.user);
						if (mBest) {
							avatarCache.set(clean, mBest);
							return mBest;
						}
					}
				} catch {}
			}
		} catch {}
		return null;
	}
	/**
	* Searches React Fiber tree on an element to extract video URLs or high-res images.
	*/
	function resolveFromFiber(element) {
		let current = element;
		while (current) {
			const fiberKey = Object.keys(current).find((k) => k.startsWith("__reactFiber$") || k.startsWith("__reactInternalInstance$"));
			if (fiberKey) {
				let fiber = current[fiberKey];
				let depth = 0;
				while (fiber && depth < 25) {
					const props = fiber.memoizedProps;
					if (props) {
						harvestMedia(props);
						const bestAvatar = extractBestHdAvatar(props.user || props.profileUser || props.userData || props.profile || props.owner);
						if (bestAvatar) return {
							url: bestAvatar,
							kind: "avatar"
						};
						const item = props.item;
						const post = props.post;
						const code = props.code || item?.code || post?.code;
						const media = props.media || props.clip || props.videoData;
						if (Array.isArray(media?.video_versions) && media?.video_versions[0]?.url) return {
							url: cleanVideoUrl(media.video_versions[0].url),
							kind: "video",
							code
						};
						if (typeof media?.video_url === "string" && media.video_url.startsWith("http")) return {
							url: cleanVideoUrl(media.video_url),
							kind: "video",
							code
						};
						if (typeof media?.videoUrl === "string" && media.videoUrl.startsWith("http")) return {
							url: cleanVideoUrl(media.videoUrl),
							kind: "video",
							code
						};
						if (typeof props.video_url === "string" && props.video_url.startsWith("http")) return {
							url: cleanVideoUrl(props.video_url),
							kind: "video",
							code
						};
						if (typeof props.videoUrl === "string" && props.videoUrl.startsWith("http")) return {
							url: cleanVideoUrl(props.videoUrl),
							kind: "video",
							code
						};
						if (Array.isArray(props.video_versions) && props.video_versions[0]?.url) return {
							url: cleanVideoUrl(props.video_versions[0].url),
							kind: "video",
							code
						};
						if (Array.isArray(item?.video_versions) && item?.video_versions[0]?.url) return {
							url: cleanVideoUrl(item.video_versions[0].url),
							kind: "video",
							code
						};
						if (Array.isArray(post?.video_versions) && post?.video_versions[0]?.url) return {
							url: cleanVideoUrl(post.video_versions[0].url),
							kind: "video",
							code
						};
						if (code && mediaRegistry.has(code)) {
							const registered = mediaRegistry.get(code);
							if (registered?.video) return {
								url: registered.video,
								kind: "video",
								code
							};
							if (registered?.photo) return {
								url: registered.photo,
								kind: "photo",
								code
							};
						}
					}
					fiber = fiber.return;
					depth += 1;
				}
			}
			current = current.parentElement;
		}
		return null;
	}
	/**
	* Extracts the post shortcode from an element's enclosing article or
	* from the current page URL.
	*/
	function resolvePostCode(el) {
		const href = (el.closest("article, [role=\"presentation\"], [role=\"dialog\"]")?.querySelector("a[href*=\"/p/\"], a[href*=\"/reel/\"]"))?.getAttribute("href") || "";
		const m = /\/(?:p|reel)\/([a-zA-Z0-9_-]+)/.exec(href);
		if (m?.[1]) return m[1];
		return /\/(?:p|reel)\/([a-zA-Z0-9_-]+)/.exec(window.location.pathname)?.[1];
	}
	/**
	* Stamps carousel and media attributes on both the media element and its
	* enclosing article/presentation container so the isolated-world content script
	* can detect them via closest().
	*/
	function stampAttributes(mediaEl, code, article) {
		if (code && carouselRegistry.has(code)) {
			const slides = carouselRegistry.get(code);
			const attrs = [["data-instagrous-carousel-code", code], ["data-instagrous-carousel-count", String(slides.length)]];
			for (const [k, v] of attrs) {
				mediaEl.setAttribute(k, v);
				article?.setAttribute(k, v);
			}
		}
		if (code && mediaRegistry.has(code)) {
			const reg = mediaRegistry.get(code);
			if (reg?.video) {
				mediaEl.setAttribute("data-instagrous-media-url", reg.video);
				mediaEl.setAttribute("data-instagrous-media-kind", "video");
				return;
			}
			if (reg?.photo) {
				mediaEl.setAttribute("data-instagrous-media-url", reg.photo);
				mediaEl.setAttribute("data-instagrous-media-kind", "photo");
				return;
			}
		}
		const resolved = resolveFromFiber(mediaEl);
		if (resolved) {
			mediaEl.setAttribute("data-instagrous-media-url", resolved.url);
			mediaEl.setAttribute("data-instagrous-media-kind", resolved.kind);
			const rCode = resolved.code || code;
			if (rCode && carouselRegistry.has(rCode)) {
				const slides = carouselRegistry.get(rCode);
				mediaEl.setAttribute("data-instagrous-carousel-code", rCode);
				mediaEl.setAttribute("data-instagrous-carousel-count", String(slides.length));
				article?.setAttribute("data-instagrous-carousel-code", rCode);
				article?.setAttribute("data-instagrous-carousel-count", String(slides.length));
			}
		}
		const src = (mediaEl.getAttribute("src") || "").toLowerCase();
		const pathParts = window.location.pathname.split("/").filter(Boolean);
		const isProfilePage = Boolean(pathParts[0]) && ![
			"p",
			"reel",
			"reels",
			"stories",
			"explore",
			"direct",
			"accounts",
			"emails",
			"your_activity"
		].includes(pathParts[0]);
		if (src.includes("-19/") || src.includes("/t51.2885-19/") || isProfilePage && !mediaEl.closest("article, [role=\"tabpanel\"], div._ac7v, div._aabd")) {
			mediaEl.setAttribute("data-instagrous-media-kind", "avatar");
			if (isProfilePage && pathParts[0]) mediaEl.setAttribute("data-instagrous-username", pathParts[0]);
		}
	}
	var lastFiberCheck = 0;
	document.addEventListener("pointerover", (event) => {
		const target = event.target;
		if (!(target instanceof Element)) return;
		const now = performance.now();
		if (now - lastFiberCheck < 40) return;
		lastFiberCheck = now;
		const mediaEl = (target.matches("video, img") ? target : target.querySelector("video, img")) || target.parentElement?.querySelector("video, img") || target.closest("article, [role=\"presentation\"], [role=\"dialog\"], li, div._aagu, div._aamz")?.querySelector("video, img");
		if (!mediaEl) return;
		const article = target.closest("article, [role=\"presentation\"], [role=\"dialog\"], main, section");
		stampAttributes(mediaEl, resolvePostCode(mediaEl) || resolvePostCode(target), article);
	}, {
		capture: true,
		passive: true
	});
	function shortcodeToMediaId(code) {
		const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
		let id = 0n;
		for (let i = 0; i < code.length; i += 1) {
			const val = BigInt(alphabet.indexOf(code[i]));
			if (val === -1n) continue;
			id = id * 64n + val;
		}
		return id.toString();
	}
	async function fetchMediaInfo(codeOrId) {
		const mediaId = /^\d+$/.test(codeOrId) ? codeOrId : shortcodeToMediaId(codeOrId);
		const appId = document.body?.innerHTML?.match(/"X-IG-App-ID":"(\d+)"/)?.[1] || "936619743392459";
		try {
			const resp = await fetch(`/api/v1/media/${mediaId}/info/`, {
				method: "GET",
				headers: {
					"Accept": "*/*",
					"X-IG-App-ID": appId,
					"X-Requested-With": "XMLHttpRequest"
				},
				credentials: "include"
			});
			if (resp.ok) {
				const item = (await resp.json())?.items?.[0];
				if (item) {
					harvestMedia(item);
					return item;
				}
			}
		} catch (e) {
			console.warn("[instagrous] media info query failed", e);
		}
		if (!/^\d+$/.test(codeOrId)) {
			try {
				const resp = await fetch(`/p/${encodeURIComponent(codeOrId)}/?__a=1&__d=dis`, {
					headers: {
						"X-IG-App-ID": appId,
						"X-Requested-With": "XMLHttpRequest"
					},
					credentials: "include"
				});
				if (resp.ok) {
					const data = await resp.json();
					const item = data?.items?.[0] || data?.graphql?.shortcode_media;
					if (item) {
						harvestMedia(item);
						return item;
					}
				}
			} catch {}
			try {
				const resp = await fetch(`/reel/${encodeURIComponent(codeOrId)}/?__a=1&__d=dis`, {
					headers: {
						"X-IG-App-ID": appId,
						"X-Requested-With": "XMLHttpRequest"
					},
					credentials: "include"
				});
				if (resp.ok) {
					const data = await resp.json();
					const item = data?.items?.[0] || data?.graphql?.shortcode_media;
					if (item) {
						harvestMedia(item);
						return item;
					}
				}
			} catch {}
		}
		return null;
	}
	async function fetchMediaResourceBlob(url) {
		const isCdn = url.includes("cdninstagram.com") || url.includes("fbcdn.net");
		const response = await fetch(url, {
			method: "GET",
			mode: "cors",
			credentials: isCdn ? "omit" : "include",
			headers: { "Accept": "*/*" }
		});
		if (!response.ok) throw new Error(`HTTP ${response.status}`);
		return await response.blob();
	}
	function upgradeAvatarDimensions(url) {
		const candidates = [];
		if (url.includes("dst-jpg_s")) {
			candidates.push(url.replace(/dst-jpg_s\d+x\d+/g, "dst-jpg_s1080x1080"));
			candidates.push(url.replace(/dst-jpg_s\d+x\d+/g, "dst-jpg_s640x640"));
			candidates.push(url.replace(/dst-jpg_s\d+x\d+/g, "dst-jpg_s320x320"));
		}
		if (/\/s\d+x\d+\//.test(url)) {
			candidates.push(url.replace(/\/s\d+x\d+\//g, "/s1080x1080/"));
			candidates.push(url.replace(/\/s\d+x\d+\//g, "/s640x640/"));
			candidates.push(url.replace(/\/s\d+x\d+\//g, "/s320x320/"));
		}
		if (/_s\d+x\d+/.test(url)) {
			candidates.push(url.replace(/_s\d+x\d+/g, "_s1080x1080"));
			candidates.push(url.replace(/_s\d+x\d+/g, "_s640x640"));
			candidates.push(url.replace(/_s\d+x\d+/g, "_s320x320"));
		}
		if (url.includes("s150x150")) {
			candidates.push(url.replace(/s150x150/g, "s1080x1080"));
			candidates.push(url.replace(/s150x150/g, "s640x640"));
		}
		if (url.includes("s240x240")) {
			candidates.push(url.replace(/s240x240/g, "s1080x1080"));
			candidates.push(url.replace(/s240x240/g, "s640x640"));
		}
		if (url.includes("s320x320")) {
			candidates.push(url.replace(/s320x320/g, "s1080x1080"));
			candidates.push(url.replace(/s320x320/g, "s640x640"));
		}
		return [...new Set(candidates)];
	}
	async function performCleanDownload(payload) {
		let targetUrl = payload.url;
		const isAvatar = payload.kind === "avatar" || targetUrl.includes("/t51.2885-19/") || targetUrl.includes("-19/") || targetUrl.includes("_s150x150_") || targetUrl.includes("_s240x240_") || targetUrl.includes("_s320x320_") || targetUrl.includes("s150x150") || targetUrl.includes("s240x240") || targetUrl.includes("s320x320") || targetUrl.includes("dst-jpg_s");
		let username = payload.username;
		if (!username && isAvatar) {
			const parts = window.location.pathname.split("/").filter(Boolean);
			if (parts[0] && ![
				"p",
				"reel",
				"reels",
				"stories",
				"explore",
				"direct"
			].includes(parts[0])) username = parts[0];
		}
		if (isAvatar && username) {
			const hdUrl = await resolveHdAvatar(username);
			if (hdUrl) {
				targetUrl = hdUrl;
				payload.filename = `instagrous-avatar-${username}-1080p-${Date.now()}.jpg`;
			}
		}
		if (isAvatar && !targetUrl.includes("1080x1080") && (targetUrl.includes("s150x150") || targetUrl.includes("s240x240") || targetUrl.includes("s320x320") || targetUrl.includes("dst-jpg_s"))) {
			const upgrades = upgradeAvatarDimensions(targetUrl);
			for (const upgraded of upgrades) try {
				const testBlob = await fetchMediaResourceBlob(upgraded);
				if (testBlob && testBlob.size > 2500) {
					targetUrl = upgraded;
					break;
				}
			} catch {}
		}
		if (payload.kind === "video" || targetUrl.startsWith("blob:")) {
			if (targetUrl.startsWith("http")) targetUrl = cleanVideoUrl(targetUrl);
			if (targetUrl.startsWith("blob:")) {
				let resolved = false;
				const code = payload.code || resolvePostCode(document.activeElement || document.querySelector("video") || document.body);
				if (code && mediaRegistry.get(code)?.video) {
					targetUrl = mediaRegistry.get(code).video;
					resolved = true;
				}
				if (!resolved && code) {
					const item = await fetchMediaInfo(code);
					if (item) {
						const vUrl = Array.isArray(item.video_versions) && item.video_versions[0]?.url;
						if (vUrl) {
							targetUrl = cleanVideoUrl(vUrl);
							resolved = true;
						}
					}
				}
				if (!resolved) {
					for (const [, entry] of mediaRegistry) if (entry.video) {
						targetUrl = entry.video;
						resolved = true;
						break;
					}
				}
				if (!resolved) {
					const videos = document.querySelectorAll("video");
					for (const video of videos) {
						const fiberResult = resolveFromFiber(video);
						if (fiberResult && fiberResult.kind === "video" && !fiberResult.url.startsWith("blob:")) {
							targetUrl = fiberResult.url;
							resolved = true;
							break;
						}
					}
				}
				if (!resolved) {
					notifyStatus("failed", "Could not resolve video stream URL");
					return;
				}
			}
		}
		try {
			saveBlobLocally(await fetchMediaResourceBlob(targetUrl), payload.filename);
			notifyStatus("ok");
		} catch (error) {
			if (payload.fallbackUrl && payload.fallbackUrl !== targetUrl && !payload.fallbackUrl.startsWith("blob:")) try {
				saveBlobLocally(await fetchMediaResourceBlob(payload.fallbackUrl), payload.filename);
				notifyStatus("ok");
				return;
			} catch {}
			notifyStatus("failed", error instanceof Error ? error.message : String(error));
		}
	}
	async function performCarouselDownload(payload) {
		let slides = carouselRegistry.get(payload.code);
		if (!slides || slides.length === 0) {
			const item = await fetchMediaInfo(payload.code);
			if (item) {
				if (Array.isArray(item.carousel_media) && item.carousel_media.length > 0) {
					harvestMedia(item);
					slides = carouselRegistry.get(payload.code);
				} else if (Array.isArray(item.video_versions) && item.video_versions[0]?.url) slides = [{
					url: cleanVideoUrl(item.video_versions[0].url),
					kind: "video"
				}];
				else if (Array.isArray(item.image_versions2?.candidates) && item.image_versions2.candidates[0]?.url) slides = [{
					url: item.image_versions2.candidates[0].url,
					kind: "photo"
				}];
			}
		}
		if (!slides || slides.length === 0) try {
			const resp = await fetch(`/p/${encodeURIComponent(payload.code)}/?__a=1&__d=dis`, {
				headers: {
					"x-ig-app-id": "936619743392459",
					"x-requested-with": "XMLHttpRequest"
				},
				credentials: "include"
			});
			if (resp.ok) {
				harvestMedia(await resp.json());
				slides = carouselRegistry.get(payload.code);
			}
		} catch {}
		if (!slides || slides.length === 0) {
			const article = document.querySelector(`article a[href*="/p/${payload.code}"], article a[href*="/reel/${payload.code}"]`)?.closest("article") || document.querySelector("article, [role=\"presentation\"]");
			if (article) {
				const collected = [];
				for (const img of article.querySelectorAll("img")) if (img.naturalWidth > 120) {
					const src = img.currentSrc || img.src;
					if (src && !collected.some((c) => c.url === src)) collected.push({
						url: src,
						kind: "photo"
					});
				}
				for (const vid of article.querySelectorAll("video")) {
					const res = resolveFromFiber(vid);
					if (res?.url && !res.url.startsWith("blob:")) collected.push({
						url: res.url,
						kind: "video"
					});
				}
				if (collected.length > 0) {
					slides = collected;
					carouselRegistry.set(payload.code, slides);
				}
			}
		}
		if (!slides || slides.length === 0) {
			notifyStatus("failed", "No slides found");
			return;
		}
		let saved = 0;
		for (let index = 0; index < slides.length; index += 1) {
			const slide = slides[index];
			const ext = slide.kind === "video" ? "mp4" : "jpg";
			const filename = `instagrous-${payload.code}-slide-${index + 1}.${ext}`;
			try {
				saveBlobLocally(await fetchMediaResourceBlob(slide.url), filename);
				saved += 1;
			} catch (e) {
				console.warn(`[instagrous] slide ${index + 1} download error`, e);
			}
			await new Promise((r) => setTimeout(r, 300));
		}
		if (saved > 0) notifyStatus("ok");
		else notifyStatus("failed", "All slide downloads failed");
	}
	function saveBlobLocally(blob, filename) {
		const objectUrl = URL.createObjectURL(blob);
		const anchor = document.createElement("a");
		anchor.href = objectUrl;
		anchor.download = filename;
		anchor.style.display = "none";
		document.body.append(anchor);
		anchor.click();
		setTimeout(() => {
			anchor.remove();
			URL.revokeObjectURL(objectUrl);
		}, 45e3);
	}
	function notifyStatus(status, message) {
		window.dispatchEvent(new CustomEvent("instagrous-download-result", { detail: {
			status,
			message
		} }));
	}
	window.addEventListener("instagrous-execute-download", ((event) => {
		if (event.detail) performCleanDownload(event.detail);
	}));
	window.addEventListener("instagrous-execute-carousel-download", ((event) => {
		if (event.detail) performCarouselDownload(event.detail);
	}));
	var nativeFetch = window.fetch;
	if (typeof nativeFetch === "function") window.fetch = function instagrousFetch(input, init) {
		try {
			const kind = suppressKind(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, init?.body, init?.headers);
			if (kind) {
				count(kind);
				return Promise.resolve(quietResponse());
			}
		} catch {}
		const promise = nativeFetch.call(window, input, init);
		try {
			const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
			if (url && (url.includes("graphql") || url.includes("/api/v1/"))) promise.then((res) => {
				res.clone().json().then((data) => inspectResponse(url, data)).catch(() => void 0);
			}).catch(() => void 0);
		} catch {}
		return promise;
	};
	var requestUrls = /* @__PURE__ */ new WeakMap();
	var nativeOpen = XMLHttpRequest.prototype.open;
	var nativeSend = XMLHttpRequest.prototype.send;
	XMLHttpRequest.prototype.open = function instagrousOpen(...args) {
		requestUrls.set(this, String(args[1]));
		nativeOpen.apply(this, args);
	};
	function settleQuietly(xhr) {
		const text = "{\"status\":\"ok\",\"data\":{}}";
		const define = (key, value) => {
			Object.defineProperty(xhr, key, {
				value,
				configurable: true
			});
		};
		let parsed = text;
		if (xhr.responseType === "json") try {
			parsed = JSON.parse(text);
		} catch {
			parsed = {};
		}
		define("readyState", 4);
		define("status", 200);
		define("statusText", "OK");
		define("responseURL", requestUrls.get(xhr) ?? "");
		define("responseText", text);
		define("response", parsed);
		try {
			xhr.dispatchEvent(new Event("readystatechange"));
			xhr.dispatchEvent(new ProgressEvent("load"));
			xhr.dispatchEvent(new ProgressEvent("loadend"));
		} catch {}
	}
	XMLHttpRequest.prototype.send = function instagrousSend(...args) {
		const url = requestUrls.get(this) ?? "";
		try {
			const kind = suppressKind(url, args[0]);
			if (kind) {
				count(kind);
				settleQuietly(this);
				return;
			}
		} catch {}
		if (url && (url.includes("graphql") || url.includes("/api/v1/"))) this.addEventListener("load", () => {
			try {
				if (this.responseType === "json") inspectResponse(url, this.response);
				else if (!this.responseType || this.responseType === "text") inspectResponse(url, JSON.parse(this.responseText));
			} catch {}
		});
		nativeSend.apply(this, args);
	};
	publishHits();
})();
