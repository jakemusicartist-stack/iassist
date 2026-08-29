# Iassist

Iassist is a customized, iOS-inspired Instagram Assistant Chrome Extension. This project enhances the native Instagram web experience by providing a beautiful mobile-like interface, complete with a clean blue aesthetic, integrated tools, and advanced customization options.

## Features

- **100% Free:** All premium and PRO features are completely unlocked out of the box. No billing, no subscriptions, just powerful tools.

- **iOS-Inspired Aesthetic:** A meticulously crafted blue UI theme (`#007AFF`) that brings a clean, premium mobile feel to the desktop.
- **Power-User Tools:** High-Res Profile Picture Viewer, Mass Downloader, Clickable Links, and Copy Captions.
- **Custom Verified Badge:** Dynamically adds a custom verification badge to the user's profile.
- **Zen Mode:** Floating toggle to hide "Suggested Posts", Reels tray, and clutter.
- **Video Player Controls & PIP:** Native video controls and Picture-in-Picture for Reels.
- **Custom Bio Fonts:** Easily convert bio text to stylized unicode fonts.
- **Background Downloads:** Easily download posts, reels, and stories in high definition directly from the extension.
- **Privacy Controls:** Includes an Enhanced Ghost Mode for viewing stories and DMs anonymously, plus an integrated Ad Blocker.

## Installation

To install this extension locally in Chrome:

1. Open Google Chrome and navigate to `chrome://extensions`.
2. Enable **Developer mode** in the top right corner.
3. Click on **Load unpacked** in the top left corner.
4. Select the `insisted` directory containing this repository.
5. Pin the extension to your toolbar and click it to open Iassist!

## Directory Structure

- `app/`: Contains the core JavaScript, CSS, and Tailwind styling (`tw.css`, `pp.js`, `instagram-plus.js`, etc.) that powers the extension's UI and logic.
- `img/`: Contains all SVG icons, logos, and badge assets used in the extension.
- `js/`: Contains background scripts and utility functions.
- `video/`: Assets used for video rendering and playback.
- `manifest.json`: The Chrome Extension manifest file defining permissions and entry points.

## Customizations Made

- Integrated a sleek, system-wide iOS blue (`#007AFF`) theme and glassmorphism.
- Injected custom features directly into the DOM (Zen Mode, PIP, HD Downloads).
- Implemented robust DOM injection logic to accurately apply the custom blue verification badge exclusively to the user's own profile page.