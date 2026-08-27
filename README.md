# INSISTOR - Instagram Assistant

INSISTOR is a customized, iOS-inspired Instagram Assistant Chrome Extension. This project enhances the native Instagram web experience by providing a beautiful mobile-like interface, complete with a clean blue aesthetic, integrated tools, and advanced customization options.

## Features

- **iOS-Inspired Aesthetic:** A meticulously crafted blue UI theme (`#007AFF`) that brings a clean, premium mobile feel to the desktop.
- **Custom Verified Badge:** Dynamically adds a custom verification badge to the user's profile.
- **Enhanced Sidebar:** A streamlined tools menu featuring quick access to Insights, Downloads, and Hashtag Assist, with clutter removed for a focused experience.
- **Background Downloads:** Easily download posts, reels, and stories in high definition directly from the extension.
- **Privacy Controls:** Includes a Ghost Mode for viewing stories and DMs anonymously, plus an integrated Ad Blocker.

## Installation

To install this extension locally in Chrome:

1. Open Google Chrome and navigate to `chrome://extensions`.
2. Enable **Developer mode** in the top right corner.
3. Click on **Load unpacked** in the top left corner.
4. Select the `insisted` directory containing this repository.
5. Pin the extension to your toolbar and click it to open INSISTOR!

## Directory Structure

- `app/`: Contains the core JavaScript, CSS, and Tailwind styling (`tw.css`, `pp.js`, etc.) that powers the extension's UI and logic.
- `img/`: Contains all SVG icons, logos, and badge assets used in the extension.
- `js/`: Contains background scripts and utility functions.
- `video/`: Assets used for video rendering and playback.
- `manifest.json`: The Chrome Extension manifest file defining permissions and entry points.

## Customizations Made

- Integrated a sleek, system-wide iOS blue (`#007AFF`) theme, replacing the default pink/red styling.
- Injected custom SVG rendering for missing sidebar tool icons.
- Cleaned up the codebase by removing obsolete locales, debug folders, and temporary files.
- Stripped out promotional "PRO" login prompts and unnecessary sidebar items (Pinned Posts, DM Templates) to create a distraction-free experience.
- Implemented robust DOM injection logic to accurately apply the custom blue verification badge exclusively to the user's own profile page.
