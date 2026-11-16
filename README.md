<div align="center">

  <img src="icons/icon-128.png" alt="Instagrous Icon" width="120" height="120" style="border-radius: 24px;" />

  # Instagrous

  <p><strong>Instagram without the noise. Private, ad-free, local browsing.</strong></p>

  <p>
    <img src="https://img.shields.io/badge/Manifest-V3-blue.svg" alt="Manifest V3" />
    <img src="https://img.shields.io/badge/Privacy-100%25%20Local-success.svg" alt="100% Local" />
    <img src="https://img.shields.io/badge/Chrome-116%2B-orange.svg" alt="Chrome 116+" />
    <img src="https://img.shields.io/badge/License-MIT-green.svg" alt="License MIT" />
  </p>

</div>

---

## ⚡ Overview

**Instagrous** is a privacy-first Chrome extension designed to clean up your Instagram web experience. It filters sponsored content, blocks tracking scripts, and gives you a streamlined, distraction-free feed with zero external servers.

- 🚫 **Ad & Sponsored Post Blocking**: Suppresses sponsored posts, suggestion carousels, and promotional injected content.
- 🔒 **Zero Telemetry / 100% Local**: No external telemetry, no remote analytics, and no third-party tracking. All logic runs directly on your machine.
- ⚡ **Lightweight & Fast**: Built on Chrome Manifest V3 using high-performance declarative rules and minimal resource overhead.

---

## 🚀 How to Load in Google Chrome (Step-by-Step)

Follow these quick steps to load the unpacked extension into Chrome:

### 1. Download or Clone the Repository
Clone or download this repository onto your computer:
```bash
git clone https://github.com/jakemusicartist-stack/iassist.git
```
*(Or keep the extracted folder containing `manifest.json`)*

### 2. Open the Extensions Page in Chrome
- Open Google Chrome.
- In the address bar, type `chrome://extensions` and press **Enter**.
- *(Alternative: Click Chrome Menu `⋮` -> **Extensions** -> **Manage Extensions**)*.

### 3. Enable Developer Mode
- In the top-right corner of the Extensions page, toggle the **Developer mode** switch to **ON**.

### 4. Load the Unpacked Extension
- Click the **"Load unpacked"** button in the top-left corner.
- In the folder picker window, select this folder (the folder containing `manifest.json`).
- Click **Select Folder**.

### 5. Done! 🎉
- **Instagrous** will appear in your extension list.
- Pin the extension icon to your Chrome toolbar for easy access.
- Navigate to [instagram.com](https://www.instagram.com) to enjoy a clean, private browsing experience!

---

## 📁 Repository Structure

```text
├── icons/              # Extension icons (16px, 32px, 48px, 128px)
├── rules/              # Declarative net request filter rules
├── background.js       # Manifest V3 service worker
├── content.js          # Injected UI & layout cleanup scripts
├── content.css         # Styling rules for distraction-free layout
├── ghost-main.js       # Stealth & script sanitization engine
├── manifest.json       # Chrome extension manifest (V3)
├── push_to_github.bat  # 1-click batch script to commit & push to GitHub
└── README.md           # Documentation
```

---

## 🛡️ Permissions

| Permission | Purpose |
| :--- | :--- |
| `storage` | Saves your local display and filtering preferences |
| `declarativeNetRequest` | High-efficiency local ad and tracking script blocking |
| `downloads` | Allows saving media directly to your local downloads when requested |
| `cookies` | Manages local session boundaries securely |

---

## 📄 License

This project is licensed under the MIT License.
