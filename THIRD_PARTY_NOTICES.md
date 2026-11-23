# Third-party notices

This file records licence conditions of dependencies that need more than a mention. It is not legal advice.

## tiktok-live-connector 2.5.0 and tiktok-live-proto 0.2.4 (TikTok LIVE reading, Product Phase 2)

- **Licence:** `AGPL-3.0-only`, with an "Additional Permissions & Exceptions" section (read verbatim from the published packages on 2026-11-23).
- **Section 18** permits linking, importing or integrating the library into a downstream project without putting that project under the AGPL, and names "TikTok LIVE games" among the permitted uses.
- **Section 19** withdraws that permission if the library is used to power "a commercial, closed-source, or hosted Software-as-a-Service (SaaS) platform, including... a WebSocket relay service, data-scraping API, or managed hosting solution offered to third parties over a network". Section 20 says misuse leaves only the plain AGPL (including its network-use clause).
- **How this project uses it:** one game engine run by its owner for the owner's own stream, with the library loaded only when the operator turns TikTok reading on (`TIKTOK_LIVE=on`). Nothing is offered to third parties as a service. **If this project is ever hosted as a service for other streamers, or distributed as a packaged product, this must be re-checked first** (a lawyer should read the licence text).
- **Beta dependency:** the library depends on `tiktok-live-api-sdk` 0.4.0-beta1 (the signing service's SDK).
- **Not affiliated with TikTok.** The library is unofficial; see `docs/tiktok-live-feasibility.md` for the Terms-of-Service risk the product owner accepted.

No code, files or assets from any other TikTok game project are used here.
