# Performance results (Step 1.7)

Measured on 2026-11-22/23. These are measurements, not guarantees: they describe this machine, this build, and the scenarios below.

## Summary against the targets

| Target (`REQUIREMENTS.md` §8) | Result | Verdict |
|---|---|---|
| Stable ≥ 30 FPS at the broadcast resolution | **60 FPS** (the display's refresh rate) at 1080×1920 and 720×1280 with 200 participants and live traffic; 0–0.3% of frames slower than 30 FPS | Met, with large headroom |
| Event-to-visible latency p95 < 500 ms under the 200-participant simulation | **p95 ≈ 82–86 ms**, p99 ≈ 85–95 ms (steady chat, gift effects, and 200-participant bursts) | Met |
| Backend handles 100–200 simulated participants | 200 participants at ~25 events/s and 200-event bursts: no errors, no drops, queue never deeper than 16 | Met |
| Do not solve scale with one detailed character per viewer | At most 24 animated characters plus an instanced crowd; ~95 draw calls, ~52 k triangles | Followed |

Nothing needed tuning: the planned configuration (24 avatars, crowd of 30 per team, 50 ms presentation batches) is well within budget. Details and the rationale for keeping the defaults are at the end.

## Environment and method

- **Machine:** Apple M3, 16 GB, 2560×1664 Retina display, macOS; Chrome 157 (headed, real GPU); Node 22.14. Power state and other running apps were not controlled or recorded.
- **Build:** the **production** web build served by `vite preview`, with the real server (`pnpm perf:browser`). Not the dev server, not headless.
- **Browser runs:** 200 participants joined and an active round, steady chat traffic of ~25 events/s with ~2% gifts (the simulator's `steady` scenario, restarted before each run). Each configuration: 4 s warm-up, then a **20 s window**. Windows were measured from `window.__perf` (`?perf=1`): frame times, long tasks, animation-mixer cost, JS heap, and renderer counters.
- **Server runs:** `pnpm perf:load` runs the simulator scenarios against a real server with 3 real Socket.IO broadcast clients. The load generator, server and clients share one Node process, so generator overhead is included (this makes server numbers slightly pessimistic).
- **Latency definition:** from the moment the server ingests an input to two animation frames after the browser has been handed the resulting cues (i.e. after the frame that shows them). The server stamps each presentation batch with the ingest time of the *oldest* input in it, so the figure is conservative. Server and browser share one machine clock.

Raw data: `docs/perf/*.json`.

## Server (headless, 200 participants)

| Scenario | Events in | Errors | Max queue | Ingest→processed p50 / p95 / p99 / max (ms) | Process CPU | Memory (RSS max) | Per client |
|---|---|---|---|---|---|---|---|
| S1 steady: 200 viewers, ~25 ev/s, 60 s | 1,552 | 0 | 4 | 0.27 / 0.59 / 1.5 / 12 | 4.6% of one core | 120 MB | 4.7 KB/s |
| S2 burst: 200 `halay` in 2 s, ×5 | 1,200 | 0 | 16 | 0.26 / 1.3 / 56 / 56 | 2.1% | 73 MB | 3.8 KB/s |
| S3 chaos: duplicates, junk, 100 k-char comments, rapid repeats, invisible characters | 1,082 | 0 | 5 | 0.32 / 1.6 / 3.4 / 20 | 3.2% | 114 MB | 1.9 KB/s |
| S4 gift storm: 20 gifts in 5 s (3 big celebrations) | 120 | 0 | 4 | 0.21 / 0.39 / 0.63 / 2.3 | 2.6% | 70 MB | 3.6 KB/s |
| S5 reconnect: 3 clients drop and return mid-round | 265 | 0 | 4 | 0.25 / 0.36 / 0.53 / 1.0 | 2.9% | 68 MB | 2.8 KB/s |

- **S3 outcome:** of 1,082 hostile inputs, 90 were rejected as invalid, 37 as duplicates, 596 rate-limited, 42 ignored as non-commands; 319 processed; none crashed or stalled anything.
- **S5 outcome:** each reconnecting client received a correct fresh snapshot within 3–5 ms.
- **Snapshot size** for 200 participants: 23 KB (sent once per (re)connect). Steady-state traffic is a few KB/s per client.
- **Heartbeat work** (p95 / p99 / max, ms), S1: engine tick 0.014 / 0.03 / 0.4; presentation flush 0.78 / 1.5 / 4.3; state publish 0.9 / 1.5 / 3.7. In S2 the worst single outliers were 85 ms (flush) and 57 ms (publish), which looks like one-off garbage collection or JIT warm-up during the first burst; they are the "max" values, not typical.
- **Event-loop delay** (excess over the 10 ms sampling resolution): mean ~1 ms, p99 under 8 ms; rare spikes up to ~150 ms (S2) coincide with the outliers above.
- **Memory:** no growth within these runs (the 30-minute soak is Step 1.8).

**Batch interval 50 ms vs 100 ms** (S1, 60 s): 753 vs 524 messages, 4.7 vs 4.6 KB/s per client. A longer interval saves messages but not bytes, and adds about 25 ms of average delay to what viewers see. **Kept at 50 ms.**

## Browser (headed Chrome, production build, 1080×1920 unless noted)

The display refreshes at 60 Hz, so "60 FPS" means every frame fit its budget; it cannot show more headroom than that. The 1%-low value of ~53.5 FPS (frame time 18.6 ms) is identical in every configuration, including the lightest one: it is vsync/timer jitter, not load.

Columns: average FPS · 1%-low FPS · frame ms p50/p95/p99/max · share of frames slower than 33 ms · long tasks · mixer ms per frame · JS heap MB · latency ms p50/p95/p99/max · draw calls · triangles.

| Run | Avatars | Crowd/team | FPS | 1% low | Frame ms | Slow | Long tasks | Mixer | Heap | Latency ms | Calls | Tris |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Default, 1080×1920** | 24 | 30 | 60.0 | 54.9 | 16.7/17.7/18.2/32 | 0.0% | 0 | 0.19 | 24 | 61/82/85/111 | 97 | 52 k |
| **Default, 720×1280** | 24 | 30 | 60.0 | 55.6 | 16.7/17.7/18.0/33 | 0.0% | 0 | 0.23 | 24 | 63/82/84/84 | 95 | 52 k |
| Gifts: 3× big_celebration, gg, roses | 24 | 30 | 60.0 | 53.5 | 16.7/18.1/18.7/28 | 0.0% | 0 | 0.22 | 22 | 67/84/88/96 | 95 | 52 k |
| Burst: 200 `halay` in 1.5 s ×3 | 24 | 30 | 60.0 | 53.8 | 16.7/18.3/18.6/22 | 0.0% | 0 | 0.30 | 21 | 72/84/86/86 | 95 | 52 k |
| Sweep | 12 | 0 | 60.0 | 53.5 | 16.7/18.1/18.7/35 | 0.1% | 0 | 0.14 | 17 | 59/82/86/87 | 63 | 25 k |
| Sweep | 12 | 30 | 60.0 | 53.5 | 16.7/18.3/18.7/21 | 0.0% | 0 | 0.14 | 23 | 62/83/95/188 | 73 | 40 k |
| Sweep | 12 | 60 | 59.9 | 53.5 | 16.7/18.4/18.7/53 | 0.1% | 0 | 0.13 | 21 | 61/81/87/113 | 71 | 55 k |
| Sweep | 24 | 0 | 60.0 | 53.8 | 16.7/18.1/18.6/33 | 0.0% | 0 | 0.21 | 27 | 66/82/86/87 | 87 | 37 k |
| Sweep | 24 | 60 | 59.8 | 53.5 | 16.7/18.2/18.7/48 | 0.2% | 0 | 0.24 | 25 | 64/82/88/107 | 95 | 67 k |
| Sweep | 36 | 0 | 60.0 | 53.8 | 16.7/18.3/18.6/23 | 0.0% | 0 | 0.32 | 22 | 62/85/87/87 | 111 | 49 k |
| Sweep | 36 | 30 | 59.6 | 53.5 | 16.7/18.3/18.7/74 | 0.3% | 0 | 0.28 | 25 | 61/83/88/100 | 121 | 64 k |
| Sweep | 36 | 60 | 60.0 | 53.8 | 16.7/18.3/18.6/27 | 0.0% | 0 | 0.25 | 22 | 63/84/88/107 | 119 | 79 k |
| Sweep | 48 | 0 | 59.9 | 53.8 | 16.7/18.2/18.6/43 | 0.2% | 0 | 0.34 | 31 | 65/84/86/88 | 137 | 62 k |
| Sweep | 48 | 30 | 60.0 | 53.8 | 16.7/18.1/18.6/20 | 0.0% | 0 | 0.32 | 20 | 64/85/86/89 | 147 | 77 k |
| Sweep | 48 | 60 | 60.0 | 53.8 | 16.7/18.2/18.6/20 | 0.0% | 0 | 0.32 | 29 | 64/84/88/97 | 147 | 92 k |

**Stress (well beyond the planned load, to find the knee):**

| Avatars | Crowd/team | FPS | Frame ms p50/p95/p99/max | Slow | Mixer ms | Latency p95 | Calls | Tris |
|---|---|---|---|---|---|---|---|---|
| 96 | 60 | 59.9 | 16.7/18.1/18.6/60 | 0.2% | 0.60 | 85 ms | 239 | 136 k |
| 144 | 120 | 59.9 | 16.7/18.2/18.6/43 | 0.3% | 0.69 | 86 ms | 335 | 172 k |
| 200 | 200 | 60.0 | 16.7/18.1/18.6/20 | 0.0% | 0.90 | 85 ms | 433 | 210 k |

Even with **200 individually animated, skinned characters and a 400-figure crowd** (4× the planned draw calls and 4× the triangles), the frame rate held at 60 FPS. There was no knee within what I could test, so the real limit on this machine is higher than this.

## Findings

1. **Performance is not the constraint.** The default scene costs about 95 draw calls and 52 k triangles, animation-mixer time is ~0.2 ms per frame, JS heap stays around 25 MB, there were no long tasks in any run, and the draw-call budget set in Step 1.6 (provisionally < 150) is respected at the planned configuration.
2. **Latency is dominated by design choices, not load:** about half comes from the 50 ms batching and the two-frame measurement, the rest from the socket hop. It did not rise under bursts or gift storms.
3. **The server is idle by comparison:** a few percent of one core, sub-millisecond processing, and a few KB/s per viewer client.

## Tuning decisions

No configuration was changed.

- **Visible avatars (24):** keep. The headroom would allow 100+, but the limit is the composition: 12 per halay line already pack the screen, and the name-tag rows are only ~3 stage units apart. More avatars would need a new formation, not a performance fix. The cap is a single constant (`AVATAR_CAP`).
- **Crowd (30 per team):** keep. 60 per team costs nothing measurable, but the extra figures fall outside the visible frame.
- **Presentation batch interval (50 ms):** keep (see above).
- **Draw-call budget (< 150):** keep as the budget for the default; the planned scene uses 95.

## Limitations and what is not measured

- **60 Hz ceiling:** results saturate at the display refresh rate, so they prove "fits the frame", not "how much faster it could go". The stress run shows the headroom is large, but I did not find the failure point.
- **GPU time was not measured directly.** FPS and frame time stand in for it.
- **No capture tool was running** (no OBS or TikTok LIVE Studio). A streaming tool encoding video at the same time will take GPU and CPU; this must be re-measured with the tool that is actually used (Step 1.8 capture check; Product Phase 2 decides the tool).
- **One machine, one browser, one tab** (Apple M3). Other hardware, power modes, thermal throttling over long sessions, and other browsers were not tested.
- **Short windows:** 20 s per browser run and 30–60 s per server run. The 30-minute soak (memory growth, leaks) belongs to Step 1.8.
- **Simulated traffic only:** real TikTok traffic patterns (and real gift streaks) are a Product Phase 2 question.
- **Server and load generator share a process,** and the 3 test clients are in the same process.
- **Latency ends at a frame boundary** (two animation frames after delivery); the true photon time (display latency) is not included, and a streaming pipeline adds its own delay before viewers see anything.
- **Event-loop figures** include the 10 ms timer resolution of the measuring histogram; the table above reports the excess.

## How to reproduce

```bash
pnpm perf:load -- --scenarios s1,s2,s3,s4,s5 --seconds 60 --json docs/perf/my-run.json   # headless server scenarios
pnpm perf:browser                                                                         # headed Chrome, production build (needs a visible window; close heavy apps first)
PERF_OUT=docs/perf/stress.json pnpm perf:browser -g "stress"                              # only the stress sweep
```

Sweeps use URL overrides in perf mode only: `/broadcast/?perf=1&cap=36&crowd=60`. `?perf=1` also shows a live overlay; `window.__perf.windowStats()` returns the numbers used here.
