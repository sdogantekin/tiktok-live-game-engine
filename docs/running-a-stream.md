# Running a stream

How to run a game for real: get the broadcast view onto a stream, read a real TikTok LIVE, keep the stream safe, and what is **not** proven yet. For window setup details see [`capture-notes.md`](capture-notes.md); for the research behind the TikTok route see [`tiktok-live-feasibility.md`](tiktok-live-feasibility.md).

> **Honest status.** The game, the operator panel and the TikTok reader are built and tested, but the TikTok reader has only run against a fake connection, and nobody has yet put the broadcast view into a real LIVE. Treat your first stream as a private test, and read "What is not verified" at the end.

## The pieces

| Piece | What it is | Where it runs |
|---|---|---|
| **Game server** | The engine, the rules, the simulator, the TikTok reader. One process. | Your machine, loopback only (`127.0.0.1`) |
| **Broadcast view** | A 9:16 web page with the game. This is what the audience sees. | A browser window that a streaming tool captures |
| **Operator view** | The control panel. Never shown to the audience. | Another window or display |
| **Streaming tool** | Carries the broadcast window (and its sound) to TikTok. TikTok LIVE Studio or another tool such as OBS. | Your machine |

The server only listens on your own machine. Do not expose it to a network: the operator interface can control the game.

## 1. Before the day

- **A TikTok account that can go LIVE.** TikTok's rules for LIVE access (age, follower count, region, a LIVE Studio application) change and vary by country; the research found 18+ and about 1,000 followers for the standard route, which may take time to reach. Check what the "Apply for LIVE access" screen says for your account.
- **A streaming tool installed** and tested with a browser window (see "Getting the picture and sound in" below).
- **Hardware.** A machine that holds 60 FPS with the game and the streaming tool both running. The game alone measured about 60 FPS at 200 participants on the development machine (`perf-results.md`); the streaming tool's encoding is on top of that and has not been measured.
- **Rights to everything you play.** See "Music" below.
- **A game choice.** Which game, and (for Takı Takma Töreni) whether you have read TikTok's rules about gifts.

## 2. Start the server

```bash
pnpm install
pnpm start                          # builds the web app, then serves everything on http://127.0.0.1:3001
GAME=taki-takma pnpm start          # start with the other game
TIKTOK_LIVE=on pnpm start           # allow reading a real TikTok LIVE (off by default)
```

The terminal prints the operator link (with a one-time token) and the broadcast link. Use `pnpm start`, not `pnpm dev`, for anything you stream. A fixed token can be set with `OPERATOR_TOKEN` (at least 8 characters). Settings are in the README and `.env.example`. Never commit `.env`.

## 3. Getting the picture and sound in

The broadcast view is a plain web page, so any tool that can capture a browser window or a display can carry it.

1. Open the **broadcast** link in its own window. On macOS, an app-style window without browser chrome is easiest to capture:
   ```bash
   open -na "Google Chrome" --args --app=http://127.0.0.1:3001/broadcast/ --window-size=540,960
   ```
   (540x960 CSS pixels is 1080x1920 rendered pixels on a Retina display; the view draws the largest 9:16 box that fits.)
2. Open the **operator** link in a different window or display. It is never captured.
3. Click once in the broadcast window: browsers keep sound silent until the page has had a click. (An unattended capture machine can start Chrome with `--autoplay-policy=no-user-gesture-required`.)
4. Point the streaming tool at the broadcast window. Keep it visible and do not let the machine sleep (`caffeinate -d` on macOS); browsers slow down hidden or minimised windows, and the game and the music stall with them.
5. Keep browser zoom at 100%.

How to capture **the window's sound** into the stream depends on the tool and operating system and is **not solved here**.

## 4. Reading a real TikTok LIVE

Off by default, on purpose: reading a stream uses unofficial access that conflicts with TikTok's Terms of Service. The product owner accepted that risk for the connector (`tiktok-live-feasibility.md`, section 5). It can lead to your account or access being restricted. You decide for yourself whether to accept it.

1. Start with `TIKTOK_LIVE=on`. Optionally add `EULER_API_KEY` to `.env` (a secret: it raises the signing service's rate limits; never commit or share it).
2. In the operator page, **TikTok LIVE** panel, type the creator's username (the name after the `@`; a pasted profile or live URL works) and click **Connect TikTok**. The simulator is switched off first: one provider at a time, so simulated players can never appear on a real stream. It stays off until you press **Disconnect TikTok**.
3. The panel shows `connecting`, `connected` (with comment and gift counts), `waiting` (the creator is not live, the connection dropped or the signing service is down: it retries by itself and says why), `failed` (a username TikTok does not know: no retry), or `stopped`.
4. **Disconnect TikTok is the kill switch.** It stops reading at once and ignores anything still in flight.
5. The reader only reads. It never posts, never logs in and never uses a session cookie.
6. Comments join sides and trigger actions exactly like simulated ones; a finished gift streak counts once.
7. **Gift tiers are placeholders** (`apps/server/src/providers/tiktok/gift-map.ts`): `Rose` and `GG` by name, everything else by value. The real mapping is a product decision you make.

For a first test, run against a **private** LIVE of your own and watch the latency, the reconnects and the rate limits before going public.

## 5. Operator checklist

**Before going live**
- [ ] Sound is on and at a sensible volume (operator **Sound** panel); the broadcast window has had its click
- [ ] The right game is selected (operator **Game** panel; switching needs the game stopped and resets players)
- [ ] **Comments on screen** is set the way you want (on by default)
- [ ] The simulator is stopped, or TikTok is connected (one provider only)
- [ ] The broadcast window is visible, at 100% zoom, with the machine awake
- [ ] You know where **Disconnect TikTok**, **Ignore** and the comments switch are

**During the show**
- Watch the **event feed** and **Players** list in the operator view, and the TikTok status.
- If someone misbehaves, **Ignore** them in the Players list: they disappear from the game and their comments are no longer shown.
- If comments get out of hand, switch **Comments on screen** off. The game keeps running.
- If the connection drops, the reader retries on its own and the broadcast shows a status line; the game keeps running.
- **Pause** freezes timers and scoring without ending the round.

**After**
- Press **Disconnect TikTok**, stop the game, and close the broadcast window.

## 6. Moderation and safety

- **The server treats everything viewers send as untrusted:** usernames and comments are length-limited and drawn only as text, commands match whole comments only, and every viewer has cooldowns and rate limits.
- **Comments on screen** are filtered: links, @mentions and phone numbers are refused, shouting and repeated characters are calmed, and a starter Turkish blocklist (spelling tricks like `s1kt1r` or spaced letters included) blocks strong profanity. **This is best effort, not a guarantee.** A list cannot know every spelling, language or context. You are the safety net: use the on/off switch and Ignore. A game can add its own blocked words in its config.
- **The operator token** stays in the URL fragment, so it is never sent in a request. Keep the operator window out of the capture, and do not share its link.
- **No viewer data is stored.** Everything is in memory and gone when the server stops.

## 7. Music and rights

- The built-in music and effects are **original and synthesised**; nothing is sampled, so there is nothing to license.
- Mahalle Halayı can play a music file (`halay.mp3`). It is **not in the repository** because it belongs to someone else, and its use has not been cleared. TikTok's Music Terms say recorded music you do not own may be used in a LIVE only with all rights and permissions, and TikTok Sounds are not allowed in a LIVE. **For a public stream, use the built-in music or a file you have cleared.** If the file is missing, the built-in music plays automatically.
- The game producer (you) owns the rights to any file you supply.

## 8. Gifts and scoring: read this before a public stream

- By default gifts are celebrations only. **Takı Takma Töreni opts in to gift scoring** (rose +3, GG +10, big_celebration +30, placeholders), so the side whose viewers send gifts can win. **At Yarışı lets gifts speed up the sender's own horse** (a short surge from a rose or GG, a jockey from a big celebration; all gift help is capped at +10%, below what likes alone can add), so gifts can influence who wins there too.
- TikTok's **LIVE Monetization Guidelines** and **Creator Code of Conduct** say what a streamer may promise or do in exchange for gifts. **They have not been read yet.** Read them, and decide whether gift-driven scoring is acceptable, before a public Takı stream. If in doubt, use Mahalle Halayı, or change Takı's `giftsMayScore` to `false` (one line in its config).
- Real gift values never become points by themselves: each game maps gift keys to what they do.
- Every viewer can play for free in every game; gifts are an extra. In At Yarışı free play is **likes**: a viewer who only joins with `1` and never taps will almost never win, so say on screen that likes make the horse faster (the overlay does).

### Likes and the race (At Yarışı)

- Viewers join with `1`. **Ten race; everyone else waits** and is shown as "Sırada N". After a race the horses go to the back of the queue, so everyone gets a turn. Viewers are shown by name and a silks colour (jockey and saddle) that is different for every horse in the race, never a profile picture. The top-left standings show each horse's gap to the leader in seconds, like a Formula 1 timing screen, and the winner's finishing time.
- **Likes** reach the game as like events from the TikTok reader. They are summed per viewer and counted at no more than 20 a second each, so a flood of taps cannot decide the race. **Real like events have not been tested on a real LIVE:** whether they arrive in a usable form and rate must be measured on a private test first. If they do not arrive, the race still runs, but nobody gets a speed-up from likes and gifts become the only way to help, which is **not** what the game is balanced for.
- The simulator can send likes (**Send likes** in the Simulator panel, and a steady stream in its scenarios), so you can rehearse a full race without an audience.
- The race is run by the server: **Pause** freezes it, and **End round** ends it where it is (horses are ranked by distance).

## 9. If something looks wrong

| Symptom | Likely cause |
|---|---|
| "Bağlanıyor…" banner stays | The server is not running, or the page was opened from a different port than the server's |
| "Yorum bağlantısı koptu" banner | The provider is disconnected (the simulator was stopped, or TikTok dropped); reconnect in the operator panel |
| TikTok panel says `waiting` | The creator is not live, the connection dropped or the signing service is unavailable; it retries and says why |
| TikTok panel says `failed` | TikTok does not know that username (use the name after the `@`) |
| No sound | The broadcast window has not had a click yet, or **Sound** is muted in the operator panel |
| Game stutters | The window is hidden, minimised or covered; or the machine is overloaded by the streaming tool |
| Scene drawn from plain shapes | Model files failed to load (look for 404s in the browser console) |
| Black or missing 3D scene, HUD fine | WebGL is unavailable: turn on hardware acceleration in the browser |
| Horses do not speed up from likes (real stream) | Likes may not be arriving: check the TikTok panel and test with a private LIVE; see "Likes and the race" |
| Nothing from a real stream arrives | Is `TIKTOK_LIVE=on` set, is the panel `connected`, and is the creator really live? |

## What is not verified

Be clear with yourself about these before relying on a stream:

- **The TikTok reader on a real LIVE:** latency, rate limits, reconnects, whether real messages carry stable ids, and (for At Yarışı) whether like events arrive in a usable form and rate. Only a fake connection has been tested.
- **Capture by a streaming tool:** whether TikTok LIVE Studio (or OBS) can show the broadcast window, and carry its sound on your operating system. Not tested.
- **Streaming-tool load:** the game was measured without a tool encoding video at the same time.
- **Browsers other than Chrome.**
- **TikTok's gift and LIVE rules** (section 8), and **Turkish regulation** of live streams and virtual gifts and **tax treatment** of gift income, which were not researched.
- **Whether the music sounds good.** It is checked for loudness and clipping, but nobody can test taste: listen to it.
