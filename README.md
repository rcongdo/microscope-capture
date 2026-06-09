# Microscope Capture

A lightweight browser app for capturing still images from a USB microscope. No installation, no server, no dependencies — just open the page and go.

**[Live Demo](https://rcongdo.github.io/microscope-capture)**

---

## Features

- Live preview from any connected USB microscope or camera
- Camera selector dropdown (handles multiple cameras automatically)
- Capture a still image as PNG with one click
- Custom filename with automatic timestamp fallback
- **Camera info panel** — click ⓘ to see all settings reported by your camera (resolution, frame rate, exposure, focus, color temperature, and more)
- Works entirely in the browser — no data leaves your device

## Browser Compatibility

| Browser | Status |
|---------|--------|
| Safari (Mac) | ✅ |
| Chrome (Mac / Windows) | ✅ |
| Edge (Windows) | ✅ |
| Firefox | ⚠️ Works for preview; Save As behavior varies |

> **Note:** Chrome and Edge may save directly to your Downloads folder rather than showing a Save As dialog. This is browser-controlled behavior.

## Usage

1. Open the [live demo](https://rcongdo.github.io/microscope-capture) or download and open `index.html` locally
2. Allow camera access when prompted
3. Select your USB microscope from the camera dropdown in the top bar
4. Enter a filename (or leave blank to use a timestamp)
5. Click **Capture** — your browser will save the PNG
6. Click **ⓘ** in the top bar to view all camera settings reported by your device

## Running Locally

No build step required. Clone and open:

```bash
git clone https://github.com/rcongdo/microscope-capture.git
cd microscope-capture
open index.html   # macOS
# or: start index.html  (Windows)
```

## Troubleshooting

**No camera detected** — Make sure the USB microscope is plugged in before opening the page, then reload.

**Camera access denied** — Check your browser's camera permissions for the page and reload.

**Black preview in Safari** — Ensure Safari has camera access: Safari → Settings → Websites → Camera.

## Files

```
index.html   — page structure (three-zone layout: top bar / video / bottom bar)
style.css    — dark-theme layout and styles
app.js       — camera, capture, and info panel logic
```
