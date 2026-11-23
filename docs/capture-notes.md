# Showing the broadcast view for capture

The broadcast view is a plain web page. Any streaming tool that can capture a browser window (or a whole display) can carry it; nothing in the page depends on OBS or any other tool. Which tool will get the video onto TikTok is a Product Phase 2 research question (see `REQUIREMENTS.md` §9 and `docs/tiktok-live-research-notes.md`).

## Run it

```bash
pnpm install
pnpm start        # builds the web app, then the server serves everything on http://127.0.0.1:3001
```

The terminal prints the operator link (it contains a one-time token) and the broadcast link:

| View | URL | Where to show it |
|---|---|---|
| Broadcast | `http://127.0.0.1:3001/broadcast/` | The window the streaming tool captures |
| Operator | the printed `http://127.0.0.1:3001/operator/#token=…` link | A different window or display; never captured |

`pnpm dev` (Vite on 5173 plus the server on 3001) is for development; use `pnpm start` for anything you intend to stream.

## Window setup

- **Shape:** the view always draws the largest 9:16 box that fits the window and fills it, so any window size works; a portrait window wastes nothing.
- **Exact pixels:** to produce 1080×1920 pixels, use a window whose content area is **1080×1920 CSS pixels** on a normal display, or **540×960 CSS pixels** on a Retina display (device pixel ratio 2). All performance measurements used 1080×1920 and 720×1280 rendered pixels.
- **Without browser chrome (macOS):**
  ```bash
  open -na "Google Chrome" --args --app=http://127.0.0.1:3001/broadcast/ --window-size=540,960
  ```
  This opens the page in an app-style window with no tabs or address bar, which is easiest to capture. (Not verified with a capture tool.)
- **Full screen** also works: the view scales to the largest 9:16 box and the rest of the display is the page's dark background.
- **Keep it visible.** Browsers slow down windows that are minimized or fully covered, which would make the game stutter. Do not let the machine sleep (`caffeinate -d` on macOS).
- **Zoom 100%.** Browser zoom changes the pixel size of the 9:16 box.
- The mouse pointer is not part of the page; hide it in the capture tool if it shows.

## If something looks wrong

| Symptom | Likely cause |
|---|---|
| "Bağlanıyor…" banner stays | The server is not running, or the page was opened from a different port than the server's |
| Red "Yorum bağlantısı koptu" banner | The simulator was disconnected from the operator panel; reconnect it there |
| Courtyard drawn from plain shapes instead of models | The model files failed to load (check the browser console for 404s) |
| Black or missing 3D scene, HUD still works | WebGL is unavailable: turn on hardware acceleration in the browser settings |

## What has and has not been verified

- **Verified:** the page lays out and reads correctly at 9:16 in Chrome at 1080×1920 and 540×960 (automated legibility tests and screenshots), runs at 60 FPS there, and survives a 30-minute soak (`docs/perf-results.md`, `docs/mvp-acceptance.md`).
- **Not verified:** capture by an actual streaming tool (OBS, TikTok LIVE Studio, or another), the effect of a tool encoding video at the same time, and browsers other than Chrome.
