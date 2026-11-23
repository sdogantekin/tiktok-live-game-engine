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

## Sound

The broadcast page plays original synthesised music and effects (a halay in a Hicaz-flavoured scale with davul and zurna voices; nothing is sampled, so there are no recordings to license). The tempo follows the dancers' beat clock and the arrangement builds with the crowd's energy; effects mark joins, jumps, claps, gifts, the countdown, round start and the results.

- **One click to unlock.** Browsers keep audio silent until the page has had a click or key press. The broadcast page shows a small "Sesi açmak için dokun" hint until then; click once anywhere (or start Chrome with `--autoplay-policy=no-user-gesture-required` for an unattended capture machine).
- **Keep the page visible.** Browsers slow background tabs; if the broadcast window is hidden or minimised, the dancers and the music both stall. Keep it on screen (or on its own display).
- **Music on a public TikTok LIVE:** TikTok's Music Terms say recorded music you do not own may be used in a LIVE only with all rights and permissions, and TikTok Sounds are not allowed in a LIVE (see `docs/tiktok-live-feasibility.md`). Use the built-in music, or a file the game producer has cleared, for any public stream.
- **Music file or built-in music.** The game's default music is its supplied file (`halay.mp3`, not committed to the repository); if the file is missing or fails to load the built-in synthesised music plays instead.
- **Mute and volume** are in the operator panel (Sound). The server holds them, so every broadcast view agrees and a refresh keeps them. While muted the broadcast shows no unlock hint.
- **Capturing the sound into a stream** (how TikTok LIVE Studio or another capture tool hears this browser window) is a Product Phase 2 question; it is not solved here.
- **What is checked automatically:** the music and effects are rendered offline in Chrome and measured (audible, no clipping, peak under 0.99, loud but not wild at high energy, an effect storm still under the limit), and the scheduling logic is unit-tested. **Whether it sounds good is a human judgement** that no test can make: please listen.

## Reading a real TikTok LIVE (Product Phase 2)

Off by default, on purpose. Reading a stream uses unofficial access that conflicts with TikTok's Terms of Service; you accepted that risk (`docs/tiktok-live-feasibility.md`).

1. **Start the server with it enabled:** `TIKTOK_LIVE=on pnpm start` (or put `TIKTOK_LIVE=on` in `.env`). The server logs that it is enabled. Optionally add `EULER_API_KEY=...` to `.env` (the signing service's key, which raises its free rate limits; a secret, never commit it, never shared).
2. **In the operator page, TikTok LIVE panel:** type the creator's username (the name after the `@` in the profile address, not the display name; a pasted profile or live URL works), then **Connect TikTok**. The simulator is switched off first: one provider per run, so simulated players can never appear on a real stream, and the simulator cannot be switched back on until you press **Disconnect TikTok**.
3. **What it shows:** `connecting`, `connected` (with live comment and gift counts), `waiting` (the creator is not live, the connection dropped, or the signing service is down: it retries on its own and says why and when), `failed` (a username TikTok does not know: no retry), `stopped`.
4. **The kill switch is Disconnect TikTok:** it stops reading at once, cancels every retry and ignores anything still in flight.
5. **What it reads:** comments (they join teams and trigger actions exactly like simulated ones) and gifts (a finished streak counts once; gifts stay cosmetic). It reads only: it never posts, never logs in, and never uses a session cookie.
6. **Gift tiers are placeholders** (`apps/server/src/providers/tiktok/gift-map.ts`): `Rose` and `GG` by name, otherwise by value; the real mapping is a product decision.
7. **Not yet verified against a real stream:** latency, rate limits, reconnection, that real messages carry their ids, and getting the broadcast view into LIVE Studio. These are the Step 2.5 private-test checks.

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
