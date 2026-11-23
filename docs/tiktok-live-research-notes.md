# TikTok LIVE access: preliminary research notes

**Status:** preliminary desk research of 2026-11-22. **Superseded by the Step 2.0 feasibility report, `docs/tiktok-live-feasibility.md` (2026-11-23).**
**Researched:** 2026-11-22, from web searches and page reads only. No connector code was written and no TikTok account or API was touched.
**Confidence key:** *confirmed* = read on the source page; *single source* = one page, not cross-checked; *inference* = my reasoning, not stated by a source; *not verified* = could not be checked.

## 1. How popular Turkish TikTok LIVE games work

Streams such as the halay/horon dances and the "virtual tawaf" (virtual Kaaba) streams are comment- and gift-driven games. I found nothing about a "Şehzade Mustafa funeral" stream.

**Viewer mechanics (confirmed, as reported by Turkish news):**
- Typing a keyword in the live chat joins or drives the game: `katıl` ("join") for the tawaf streams, `HORON` for the horon streams.
- Each participant becomes an animated character carrying their name. In the tawaf streams, characters circle a 3D Kaaba image, with up to about 80 at once.
- Likes change the dance speed (horon streams).
- Gifts assign roles or effects by coin tier. Reported examples: a rose adds you to the circle; the top gifter becomes the lead dancer; in the tawaf streams, low gifts show a "zemzem" effect and higher tiers trigger larger animations; a "top five" gifter ranking is shown.
- One article says commands may be matched to predefined actions, and "more advanced" streams may use AI to interpret comments. It does not name any such system.

**Technical setup (mostly inference):**
- None of the articles names the software, or says whether TikTok LIVE Studio or OBS is used.
- The tawaf simulation's source code is reportedly sold on internet forums as "Kabe Tavaf", from 750 TL (single source).
- *Inference:* the usual pattern is a PC app that renders the characters, reads the stream's comments and gifts, and is captured and broadcast by the streamer. The tool ecosystem below is consistent with this, but I did not confirm it for these streams.

**Money and criticism:** streamers earn from gifts bought with TikTok coins and later paid out. The tawaf streams drew public criticism for monetizing religious practice. The articles report no TikTok statement or enforcement action. That is not evidence the streams are permitted.

## 2. Official route

- TikTok's developer guidelines (last updated 2026-08-04) say apps that integrate with its APIs and SDKs "in LIVE" go through app review. They give **no review timeline and no approval guarantee**, and they do not describe what LIVE data such an app may read (*confirmed*). Violations can lead to revocation and a permanent ban.
- The "TikTok For Gaming / Interactive Game registration" page that `ARCHITECTURE.md` links to returned only the text "TikTok For Gaming". Whether it describes an Interactive Games partner program is **not verified** (the page may need JavaScript).
- Third-party sources state that TikTok has no public API for LIVE comments and gifts (*single source* each; some are vendors with a commercial interest).
- **Conclusion so far:** I could not confirm an official way to read LIVE comments and gifts. Step 2.0 must check TikTok's developer portal and Developer Terms directly, and consider asking TikTok.

## 3. Unofficial route and the tool ecosystem

- **TikTok-Live-Connector** (Node.js/TypeScript, GitHub `zerodytrash/TikTok-Live-Connector`): reads TikTok's internal Webcast push service for a creator's public stream. Exposes chat, gift, member join, like, follow, share, battle and many other events. No login is needed to read a public stream (*confirmed*).
  - Needs a **signed WebSocket URL**; signing is delegated to the third-party **Euler Stream** service. Free use has community rate limits; an API key raises them (*confirmed*).
  - States that it is unofficial, unaffiliated with ByteDance, "not production-ready", and recommends Euler Stream's managed API for production (*confirmed*).
  - TikTok can change the protocol without notice, which breaks it (*confirmed*).
  - License shows as **AGPL-3.0**, possibly a modified variant; check the LICENSE file before relying on it. Embedding AGPL code has obligations that matter for this project.
  - Gift-streak behavior: *not verified* (summary only). This matters because the event contract needs one gift action per completed gift.
- **Paid managed feeds:** Euler Stream and TikTools sell WebSocket delivery of chat, gifts, likes and more (vendor marketing; *single source*). TikTools offers a 7-day sandbox and says it is not affiliated with TikTok.
- **TikFinity** and similar streamer tools connect to a LIVE stream by username and turn comments, gifts and follows into overlays, alerts and game triggers; they work with OBS or TikTok LIVE Studio (*single source*, vendor and press). They are not affiliated with TikTok.
- **Terms of service:** I did not read TikTok's Developer Terms or Terms of Service, so whether unofficial access is permitted is **unanswered**.

## 4. Other practical findings

- **Account eligibility (single source, not verified):** one guide says about 1,000 followers are needed to access LIVE features. Verify on TikTok's own pages. A new account may not be able to go LIVE straight away.
- **Platform enforcement on tools (single source):** one guide says that from 2025-07-07 TikTok could revoke LIVE access for Streamlabs users broadcasting less than 50% gaming content. This shows TikTok does act against streaming tools; it does not apply to us directly.
- **Getting our video onto TikTok is a separate problem:** reading events is half the work. We also have to broadcast the 9:16 view, probably via TikTok LIVE Studio or an RTMP stream key from OBS. Eligibility and any restrictions on this path are **not researched yet**.
- **Minimum age:** one article says gift purchases are for users 18 and over (*single source*).

## 5. What this means for the project

- **The architecture already fits either route.** A TikTok provider only has to emit normalized events through `ingest()` and report connection status; the game, views and simulator stay unchanged (`ARCHITECTURE.md` ADR-006).
- **The real decision is official vs. unofficial.** If no official route exists, the unofficial route is how this ecosystem operates, but it brings terms-of-service risk to the dedicated account, breakage risk, a third-party signing dependency, and an AGPL license question. This is a go/no-go decision for the product owner at Step 2.1.
- **Items for the Step 2.0 report:**
  1. TikTok Developer Terms and Terms of Service: is reading LIVE events through an unofficial connector allowed, and what are the consequences for the account?
  2. Does an official LIVE data route or partner program exist, and what are its eligibility rules?
  3. The dedicated account's LIVE eligibility, and how to broadcast our 9:16 view to TikTok.
  4. Event details that affect our contracts: stable event IDs, gift streak and combo semantics, latency, rate limits, reconnect behavior.
  5. The connector's license (AGPL) and what it requires of this repository.
  6. Mapping real gifts to the semantic gift keys the game modes use, keeping gifts cosmetic.
- **Content guardrail:** the criticized streams monetize religious acts with pressure to gift. Our design (free participation, cosmetic gifts, a wedding dance) is intentionally different and our requirements already forbid pressuring viewers to spend.

## Sources

- [CNBC-e: "TikTok'ta yeni akım: Halay ve horon çektirerek para kazanıyorlar"](https://www.cnbce.com/teknoloji/tiktokta-yeni-akim-halay-ve-horon-cektirerek-para-kazaniyorlar-h41380) (2026-11-09)
- [Yeniçağ: "TikTok'ta dini değerler üzerinden para tuzağı: jetonla sanal Kâbe tavafı"](https://www.yenicaggazetesi.com/tiktokta-dini-degerler-uzerinden-para-tuzagi-jetonla-sanal-kabe-tavafi-1091729h.htm) (2026-11-17)
- [Bengütürk: virtual tawaf](https://www.benguturk.com/gundem/tiktokta-yeni-vurgun-jeton-gonderene-kabede-sanal-tavaf-289438h) (search snippet only; the page returned 403 when fetched)
- [TikTok for Developers: developer guidelines](https://developers.tiktok.com/docs/en/our-guidelines-developer-guidelines)
- [TikTools: TikTok LIVE game guide](https://tik.tools/guides/tiktok-live-game) (vendor)
- [TikTok-Live-Connector (GitHub)](https://github.com/zerodytrash/TikTok-Live-Connector)
- [TikFinity](https://tikfinity.zerody.one) (vendor) and [Canberra Times on TikFinity](https://www.canberratimes.com.au/story/9389858/the-audience-is-the-controller-tikfinity-and-the-new-live-format/)
