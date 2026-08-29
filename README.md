<div align="center">
  <img src="img/icon-128.png" alt="Iassist Logo" width="128" />
  <h1>Iassist</h1>
  <p><strong>A customized, iOS-inspired Instagram Assistant Chrome Extension</strong></p>

  [![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](#)
  [![License](https://img.shields.io/badge/license-MIT-green.svg)](#)
  [![Free](https://img.shields.io/badge/pricing-100%25%20Free-success.svg)](#)
</div>

<br>

Iassist enhances the native Instagram web experience by providing a beautiful mobile-like interface, complete with a clean blue aesthetic, integrated tools, and advanced customization options. It transforms the Instagram desktop view into a premium, power-user environment.

---

## ✨ Features

- 🔓 **100% Free**
  All premium and PRO features are completely unlocked out of the box. No billing, no subscriptions, just powerful tools.

- 🎨 **iOS-Inspired Aesthetic**
  A meticulously crafted blue UI theme (#007AFF) that brings a clean, premium Apple-like feel to the desktop.

- ⚡ **Power-User Tools**
  Mass Downloader, Clickable Links, Copy Captions, and a High-Res Profile Picture Viewer built right in.

- 🛡️ **Privacy Controls**
  Includes an Enhanced Ghost Mode for viewing stories and DMs anonymously, plus an integrated Ad Blocker.

- 🧘 **Zen Mode**
  Floating toggle to hide "Suggested Posts", the Reels tray, and other algorithm-driven clutter.

- 🎥 **Video Player Controls & PIP**
  Native video controls and Picture-in-Picture mode for Reels and videos.

- 🔤 **Custom Bio Fonts**
  Easily convert bio text to stylized unicode fonts with a built-in generator.

- 📥 **Background Downloads**
  Download posts, reels, and stories in high definition directly from the extension UI.

- 💎 **Custom Verified Badge**
  Dynamically adds a custom verification badge exclusively to your profile.

---

## 🚀 Installation

Install this extension locally in Chrome in just a few clicks:

1. Open Google Chrome and navigate to chrome://extensions.
2. Enable **Developer mode** in the top right corner.
3. Click on **Load unpacked** in the top left corner.
4. Select the folder containing this repository.
5. Pin the extension to your toolbar and click the **Iassist** icon to launch your new Instagram experience!

---

## 📁 Directory Structure

| Directory | Description |
| --------- | ----------- |
| pp/    | Core JavaScript, CSS, and Tailwind styling (	w.css, pp.js) powering the extension. |
| img/    | SVG icons, logos, and UI badge assets. |
| js/     | Background scripts and utility functions. |
| ideo/  | Assets used for video rendering and playback. |
| manifest.json | The Chrome Extension manifest file defining permissions. |

---

## 🛠️ Under the Hood

- Integrated a sleek, system-wide **iOS blue (#007AFF)** theme and glassmorphism styling.
- Replaced all legacy assets with minimalist **macOS inspired icons**.
- Injected custom features directly into the DOM (Zen Mode, PIP, HD Downloads).
- Implemented robust logic to accurately apply the custom verification badge on the user's own profile page.
- Fully bypassed legacy paywalls to open-source all premium logic.
