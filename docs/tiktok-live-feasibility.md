# Step 2.0: TikTok LIVE feasibility report

**Status:** delivered 2026-11-23 for your go / no-go decision (Step 2.1). Research and documentation only: no connector code was written, no TikTok account or API was touched, and no credentials were requested.
**Builds on:** `docs/tiktok-live-research-notes.md` (preliminary notes of 2026-11-22), which this report supersedes where they differ.
**Method:** TikTok's own pages (developer portal, legal terms, LIVE Studio help, support pages), the open-source connector's README and docs, and vendor pages. Many TikTok pages render their text with JavaScript and came back as empty shells; where that happened the finding is marked.
**Not legal advice.** Where a licence or a term matters, a lawyer should read the source text.

**Confidence key:** **[primary]** read on TikTok's own page; **[docs]** read in the connector project's documentation; **[vendor]** a vendor's own claim (marketing); **[snippet]** quoted by a search result of an official page whose body did not render; **[unknown]** could not be established.

## 1. Answer in short

1. **There is no official way to read TikTok LIVE comments and gifts.** TikTok for Developers has no LIVE events API, SDK or partner program [primary]. The only route that exists is the unofficial one the whole ecosystem uses (reading TikTok's internal LIVE push service through a connector library).
2. **The unofficial route works technically but conflicts with TikTok's Terms of Service on their face**, can break whenever TikTok changes its protocol, and depends on a third-party signing service. This is the central risk, and it is yours to accept or reject.
3. **Public LIVE has a hard music rule that affects our current setup:** a third-party music file such as `halay.mp3` must not be used on a public stream unless the producer holds the rights (section 5).
4. **Getting our 9:16 browser view into a LIVE is not yet proven.** TikTok LIVE Studio runs on macOS, but whether it can capture a browser window (and its audio on macOS) is not documented on the pages I could read. This needs a hands-on test with your dedicated account, before any code (section 4).
5. **My recommendation: a conditional go**, in stages and with controls (section 8). "Do not proceed" and "a different product" remain legitimate choices (section 7).

## 2. Official routes

| Route | What I found | Verdict |
|---|---|---|
| **TikTok for Developers: LIVE data** | The portal lists Login Kit, Share Kit, Content Posting API, Embed Videos, Data Portability API (EEA/UK), Research API, Display API, Green Screen Kit, Commercial Content API, Mini Games and Mini Dramas. **No LIVE events product.** The developer guidelines say apps integrating "in Live" are reviewed, but this is the app-status label (the FAQ defines "Live" as "your current revision of the app was approved"), not TikTok LIVE streaming. [primary: portal, App Review FAQ, Developer Guidelines, all updated 2026-08-04] | **No official route.** |
| **Asking TikTok** | The guidelines say review has no timeline and no guarantee, and that TikTok may reject any application for any reason. [primary] | A written inquiry costs nothing, but expect no answer. |
| **TikTok Mini Games** | An official, different product: lightweight games played inside the TikTok app, built with Cocos or Unity, monetised by in-app ads and purchases through TikTok's payment system. **Turkey is a launched market.** No page mentions LIVE comments, gifts or LIVE viewers. [primary, updated 2026-10-05] | Not a LIVE route. A genuinely different product direction. Review criteria not read. |
| **TikTok LIVE Studio** (TikTok's own streaming tool) | Available on macOS and Windows (macOS: Apple silicon M1 minimum, 8 GB; Intel needs an i7/i9 iMac or Mac mini from 2019, 16 GB; recommended M2 Pro or better). Per-application audio capture exists in the audio mixer. Access requirements "may vary depending on your country/region". [primary: FAQ updated 2026-08-19, install guide 2026-03-04] | Usable as the way to broadcast, if it can capture our page (section 4). |

## 3. Unofficial route (reading LIVE events)

### The connector (TikTok-Live-Connector, Node.js)
- **Events available** [docs]: chat, gift, member (join), like, follow, share, roomUser (viewer count), subscription notices, stream end, and others.
- **No login needed to read a public stream** [README], which also means the connector is not tied to the dedicated account.
- **Signing:** the connection needs a signed token from the third-party **Euler Stream** service; free use has "community rate limits", an API key raises them [README]. No numeric limit is documented.
- **Stability:** its own docs say it is an unofficial reverse-engineering project, "not production-ready", and that TikTok can change the protocol without notice [docs].
- **Licence (resolved for version 2.5.0, read verbatim from the published package, 2026-11-23):** `AGPL-3.0-only` (its protocol package `tiktok-live-proto` is the same) **plus an additional permission**: section 18 lets you "link, import, or integrate" it into downstream projects "without subjecting the downstream project to the AGPL-3.0", and names "TikTok LIVE games", overlays and bots as examples. Section 19 withdraws that permission if it is used "to power a commercial, closed-source, or hosted Software-as-a-Service (SaaS) platform, including... a WebSocket relay service, data-scraping API, or managed hosting solution offered to third parties over a network"; section 20 says misuse revokes the permission and leaves the plain AGPL (with its network-use clause). **Our use**, a game engine run by its owner for the owner's own stream, matches the section 18 example; hosting it as a service for other streamers would not. (The `main` branch is MIT, but the published 2.5.0 package is the AGPL text above.) Not legal advice. The package also pulls in a beta signing SDK (`tiktok-live-api-sdk` 0.4.0-beta1).

### Event semantics that matter for our contracts [docs]
- **Gifts:** a gift is *streakable* when `gift.type === 1`. TikTok sends several updates while a streak grows; `repeatCount` is the **cumulative** total, not a delta, and `repeatEnd === 1` marks the final update. Counting every update overcounts. Non-streakable gifts arrive once. Our `gift` action should therefore be created **once per finished streak**, with `count = repeatCount`.
- **Event IDs:** the connector's docs mention none and warn that a gift ID "does not identify a unique transaction", **but the protocol schema it ships (`tiktok-live-proto` 0.2.4) gives every chat and gift message a `common.msgId` and `common.createTime`** [read in the package's type definitions, 2026-11-23]. The provider therefore uses `msgId` as the event id and falls back to a derived key (sender, stream group, count, time) when it is missing. Whether real messages always carry it is [unknown] until a real stream is read.
- **Likes** arrive as batches with a `count` and a running `total`; they are not unique viewers. They fit our crowd-energy meter well.
- **Reconnect:** the client does **not** reconnect by itself; our provider must, with a delay and a single connection loop. `streamEnd` and `disconnected` events exist but a disconnect does not prove the stream ended. [docs]
- **Latency and rate limits:** no numbers anywhere. **[unknown]**: measure in a private test.

### Managed feeds and other tools
- **Euler Stream** [vendor, plus its terms page updated 2026-09-02]: free "Community" plan ($0: 1.5K requests/day, 100 rooms/day, 25 concurrent WebSockets), then $50 to $250 a month, enterprise on request. Terms: limits "subject to change... without notice", service provided "as is", no SLA, termination at any time, one account per organisation, and a clause against building a product that competes with a real-time event feed. A free account covers one stream. Whether any route needs a TikTok session cookie is **[unknown]** (not required in the pages read; the connector warns that enabling cookies sends credentials to the signing service, so we would not enable it).
- **TikFinity** [vendor]: a Windows-only desktop app with a documented WebSocket endpoint for stream events, "not affiliated with TikTok". The event format and macOS support could not be read. Of limited use on a Mac.

## 4. Getting our broadcast view onto TikTok

- **LIVE Studio on macOS** [primary]: supported on Apple silicon (M1 or later). Its help pages do not name window capture, game capture, a browser/web-page source or an RTMP key, so **whether it can show our browser page is [unknown]**. The FAQ says fullscreen games should be switched to windowed mode, which suggests window capture exists. Audio can be captured per application ("select the application you want to capture audio from"); whether that works for a browser on macOS is [unknown].
- **OBS with a stream key** is the usual alternative on other platforms. No fetched page documents a stream key for LIVE Studio, and we decided earlier to skip OBS unless TikTok's route needs it. [unknown]
- **Access** [snippet of TikTok's support page; the page body did not render]: you must be 18 or older and have 1,000 followers (may vary by region), with your account in good standing; TikTok may ask for ID and selfies. LIVE Studio access has its own requirements shown during the apply step, and a trial rule asks for two LIVE sessions of at least 25 minutes in the first week [primary: LIVE Studio FAQ]. One unofficial source says non-gaming US creators need 10,000 followers [unverified].
- **Consequence:** a brand-new dedicated account probably cannot go LIVE immediately. Reaching the follower threshold may be the longest lead time in the whole phase.

## 5. Policies and risks

- **Terms of Service** [primary: US and rest-of-world texts]: users may not "use automated scripts to collect information from or otherwise interact with the Services" or "bypass any measures we may use to prevent or restrict access" or reverse engineer; TikTok "reserves the right to disable your user account at any time". My reading: the unofficial connector is automated access of the kind these clauses describe. Enforcement against stream readers is not documented in anything I read, but the contractual risk is real, and a ban would fall on the account or the operator's access. **Decision for you.**
- **Music** [primary: Music Terms, US effective January 2026; the EEA text, effective July 2025, is identical in section 7]: "You cannot use Sounds or Commercial Sounds in a live stream", and to use or perform recorded music in a LIVE that you do not own you must have all rights and permissions. Violations can lead to muting or removal, with an appeal. Social-media claims of a wider blanket ban are unverified. **For us: `halay.mp3` is not safe to play on a public LIVE** unless the game producer holds the rights; the built-in synthesised music is original and fine. Before Step 2.5 either clear the file, replace it, or run the game without `track`.
- **Gifts** [primary: Virtual Items Policy, EEA/UK/CH text, 2026-02-16]: gifts are not refundable, have no cash value, and buying needs 18+. The policy does **not** say what a streamer may promise or do in exchange for gifts; it points to the LIVE Monetization Guidelines and the Creator Code of Conduct, which I **did not read**. Our "a gift triggers a visual event, never a score" design looks compatible, but the gift-triggered events (for example flower petals) must be checked against those two documents first.
- **LIVE community rules** [unknown]: the LIVE-specific page returned a 404 and the main Community Guidelines summary does not mention LIVE games, contests, gambling or religious content. The earlier criticism of religious-practice streams remains a content risk; a wedding dance is different but should be reviewed against the real LIVE rules.
- **Not researched:** Turkish regulation of live streaming and virtual gifts, tax treatment of gift income, and any contractual terms of a TikTok LIVE agency or creator network.

## 6. Options

| Option | Effort | Main risk |
|---|---|---|
| **A. Unofficial connector as a swappable provider** (via Euler Stream's free plan, or the library once its licence is confirmed) | Low to medium: one provider behind `ingest()` | ToS conflict; breakage on protocol change; third-party dependency; licence |
| **B. TikFinity as the bridge** | Medium; Windows desktop app | Not usable on macOS as far as I can tell; undocumented format |
| **C. Official partnership / inquiry** | Low to write, unknown to answer | Probably no reply; no known programme |
| **D. A TikTok Mini Game instead of a LIVE game** | High: a different product (Cocos/Unity, review, in-app purchases) | Not the product in `REQUIREMENTS.md`; no LIVE interaction |
| **E. Do not proceed** | None | The project's stated purpose is not delivered |

## 7. What stays true whatever you decide
The engine already separates providers cleanly: a TikTok provider only emits normalised events through `ingest()` and reports connection status, so choosing A later or switching to something else costs nothing in the game, the views or the simulator. The simulator stays the permanent, independent source, and one provider is active per run.

## 8b. Build status
Step 2.2 (our own provider, behind `ingest()`) and Step 2.3 (operator panel, kill switch, provider status on the HUD) are built and tested with a fake connection; **the real connection has not been exercised**, because that needs the dedicated account and a live private stream (Step 2.5). How to run it is in `docs/capture-notes.md`. The connector is installed at exact version `2.5.0`; third-party notices are in `THIRD_PARTY_NOTICES.md`.

## 8a. Decision (2026-11-23)
The product owner chose **option A** and accepted the Terms-of-Service risk described in section 5. Conditions that stay in force: the provider is read-only, uses no TikTok session cookies, commits no credentials, can be switched off at once from the operator panel, and never runs together with the simulator. A similar open-source project was read **only to understand the approach**; none of its code, files or assets are used here.

## 8. Recommendation

**Conditional go, in stages, with the exit left open:**
1. **No-code prerequisites (yours):** create the dedicated account; check whether it can go LIVE and what the LIVE Studio "Apply for LIVE access" screen says for your country; install LIVE Studio on the Mac and test whether it can show a browser page (our `/broadcast/` view on `pnpm start`) and its audio. Tell me what you see. If LIVE Studio cannot show the page, that decides the route before any engineering.
2. **Decision gate (2.1), on your explicit go:** accept or reject the ToS risk of option A. If you accept it, treat the connector as a **disposable provider**: read-only, one account (never committed), a visible kill switch, no use of session cookies, and a first run against a **private** LIVE to measure latency, rate limits and reconnects.
3. **Read before building** (a short follow-up, still research): LIVE Monetization Guidelines, Creator Code of Conduct, the LIVE community rules, the exact licence text of the connector version we would use, and Euler Stream's WebSocket reference (message identifiers, session-cookie requirement).
4. **Music:** for any public LIVE use the built-in music or a file the producer has cleared.

If the ToS risk to your TikTok account is not acceptable, the honest alternatives are an inquiry to TikTok (C) while keeping the simulator-only product, or a Mini Game (D); I would not recommend building on a route you consider unacceptable.

## Sources
- TikTok for Developers: [portal](https://developers.tiktok.com/), [App Review FAQ](https://developers.tiktok.com/doc/getting-started-faq), [Developer Guidelines](https://developers.tiktok.com/docs/en/our-guidelines-developer-guidelines), [Mini Games overview](https://developers.tiktok.com/doc/mini-games-overview)
- TikTok legal: [Terms of Service (global)](https://www.tiktok.com/legal/page/global/terms-of-service/en), [Terms of Service (rest of world)](https://www.tiktok.com/legal/page/row/terms-of-service/en), [Music Terms (US)](https://www.tiktok.com/legal/page/global/music-terms-us/en), [Music Terms (EEA)](https://www.tiktok.com/legal/page/global/music-terms-eea/en), [Virtual Items Policy](https://www.tiktok.com/legal/virtual-items), [Community Guidelines](https://www.tiktok.com/community-guidelines/en)
- TikTok LIVE Studio: [FAQ](https://www.tiktok.com/live/studio/help/article/FAQ/FAQ), [install guide](https://www.tiktok.com/live/studio/help/article/Before-you-go-LIVE/Install-and-start-LIVE-Studio?lang=en); [About TikTok LIVE (support)](https://www.tiktok.com/support/faq_detail?id=7543604790438451768&category=web_account) (body did not render)
- Connector: [TikTok-Live-Connector](https://github.com/zerodytrash/TikTok-Live-Connector), [its docs: gifts and goals](https://ttlc.docs.isaackogan.com/events/gifts-and-goals/), [gift guide](https://ttlc.docs.isaackogan.com/guides/gifts/), [connection](https://ttlc.docs.isaackogan.com/getting-started/connection/); [TikTokLive (Python)](https://github.com/isaackogan/TikTokLive)
- Vendors: [Euler Stream](https://www.eulerstream.com/) ([pricing](https://www.eulerstream.com/pricing), [terms](https://www.eulerstream.com/terms)), [TikFinity](https://tikfinity.zerody.one/)

## Not read (open items for the follow-up)
LIVE Monetization Guidelines; Creator Code of Conduct; LIVE-specific Community Guidelines; "Apply for LIVE access"; Euler Stream WebSocket reference and the connector's protobuf schema; the verbatim ts-rewrite licence sections 18 to 21; Mini Games release and review rules; TikFinity's API format; numeric rate limits and latency (to be measured, not read).
