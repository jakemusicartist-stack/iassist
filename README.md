<div align="center">

  # Instagrous

  <p><em>Instagram. But on your terms.</em></p>

  <p>
    <img src="https://img.shields.io/badge/Manifest-V3-7B2FBE.svg?style=for-the-badge" />
    <img src="https://img.shields.io/badge/Privacy-100%25%20Local-FF3CAC.svg?style=for-the-badge" />
    <img src="https://img.shields.io/badge/Chrome-116%2B-orange.svg?style=for-the-badge" />
    <img src="https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge" />
  </p>

</div>

---

## What Is Instagrous?

**Instagrous** is a privacy-first Chrome extension that gives you full control over your Instagram experience. Ghost through Instagram without leaving a trace — hide your read receipts, stay invisible on stories, block ads, and download any content directly from your feed.

No accounts. No servers. Everything runs 100% locally on your machine.

---

## ✨ Features

### 👻 Ghost Mode — Stay Invisible
- **Hide Seen on DMs** — Read messages freely without triggering the "Seen" receipt. Instagram will never know you opened the message.
- **Ghost Stories** — View stories silently. Your name won't appear in the viewer list; you watch, they never know.

### ⬇️ Download Anything
- **One-click media download** — Download photos, videos, Reels, and Stories from any Instagram post directly to your device. No third-party sites, no quality loss.
- Works on posts, profiles, Reels, and DM media.

### 🚫 Ad & Sponsored Post Blocking
- Strips out sponsored posts, suggested accounts, and promotional injections from your feed.
- Powered by Chrome's native `declarativeNetRequest` — zero performance cost.

### 🔒 Total Privacy
- **Zero telemetry** — No data ever leaves your machine.
- **No account required** — Install and go. No sign-in, no tracking.
- **100% local logic** — Every feature runs in your browser.

---

## 🚀 Load in Chrome (Step-by-Step)

### Step 1 — Get the Extension Files
Clone or download this repository:
```bash
git clone https://github.com/jakemusicartist-stack/iassist.git
```
Or download the ZIP from GitHub and extract it. The folder containing `manifest.json` is what you need.

### Step 2 — Open Chrome Extensions
In the Chrome address bar, type:
```
chrome://extensions
```
Press **Enter**.

### Step 3 — Enable Developer Mode
In the **top-right corner** of the Extensions page, toggle the **Developer mode** switch to **ON**.

### Step 4 — Load Unpacked
Click **"Load unpacked"** in the top-left.  
In the folder picker, navigate to and select the folder containing `manifest.json` (the root of this repo / extracted folder).  
Click **Select Folder**.

### Step 5 — Done! 🎉
**Instagrous** appears in your extensions list. Pin it to your toolbar and head to [instagram.com](https://www.instagram.com).

---

## 📁 File Structure

```text
├── icons/              # Extension icons (16, 32, 48, 128px) — bright on dark & light
├── rules/              # Declarative ad-block filter rules (ads.json)
├── background.js       # Manifest V3 service worker
├── content.js          # Feed cleanup, download injector, ghost DM/story engine
├── content.css         # Distraction-free layout styles
├── ghost-main.js       # Stealth interception core
├── manifest.json       # Chrome Extension Manifest V3
├── push_to_github.bat  # 1-click commit & force-push script
└── README.md           # You are here
```

---

## 🛡️ Permissions

| Permission | Why It's Needed |
| :--- | :--- |
| `storage` | Saves your ghost mode and download preferences locally |
| `declarativeNetRequest` | Blocks ads and sponsored content natively in Chrome |
| `downloads` | Triggers file downloads when you click the download button |
| `cookies` | Maintains session boundaries without logging you out |

---

## 📄 License

MIT © Instagrous Contributors
