# Project context (Dango Order)

Read this first. Changes go with an ADR in `docs/decisions/` (same rule
as Dango Drop / Dango Swap).

> This project reuses the workflow, coding rules and security rules
> established in Dango Drop. Same tech stack and process — **only the
> game itself (falling-block puzzle -> dango shop orders) differs**.
> Portrait layout (540x960), dango character images, fonts and the DG
> economy are shared with Dango Drop.

---

## Overview

- **True purpose**: a family project (DREAM CRYSTAL) — experience the
  full flow of plan -> build -> publish -> improve together. The game is
  learning material and a shared experience, not just a product.
- **Name**: **Dango Order** (adopted 2026-11-06; the 5th DreCry game)
- **Form**: smartphone **web game** (works in a desktop browser too) ·
  worldwide release (all UI text in English)
- **Orientation**: **portrait phone (540x960, Scale.FIT + AUTO_CENTER)**
- **Genre**: timed order / serving game (tap the right dango in order)
- **Core loop**: a customer orders a skewer -> tap the dango on the pad
  bottom-up in the exact order -> serve before patience runs out ->
  serves in a row build a combo -> 60-second shift ends -> "Today's
  Dango Shop" reports the sales (DG)

### Economy (DG)

- **SCORE = total DG earned = shop sales. No separate coins.**
- One served order: `sum(prices) x 3, x2 if VIP (Golden order) +
  wait bonus (+2 DG per patience second left) + combo bonus
  (5 DG x combo)`. Proposed formula — not yet confirmed (see README.md).
- Prices (same menu as Dango Drop): Shiratama 1 / Anko 2 / Sakura 3 /
  Mitarashi 4 / Yomogi 5 / Matcha 10 / Golden 100 DG.
- Special rates: last dango of an order is Golden 12%, Matcha 16%.
- Matcha order served: +3 seconds on the clock. Golden order: VIP, 2x.
- Wrong tap: -1.5 s patience. Patience runs out: customer leaves,
  combo resets.
- Best DG / orders served / best combo persist in localStorage.
- **Most important rule: economy and feel settings live outside the
  code** — prices and DG rules in `src/config/dango-economy.json`,
  shift/patience/order numbers in `src/config/game-balance.json`. No
  hard-coding. Balance tweaks are JSON edits.

### Screens

Boot -> Preload -> Title -> Game -> Result ("Today's Dango Shop").
Title -> How to Play / Meet the Dango -> Title. Rules and introductions
are separate screens, never overlays on the game — the game screen
stays full-screen on the phone.

### Characters

Seven friends, real art from Dango Drop (`public/assets/dango/`):
Shiratama, Anko, Sakura, Mitarashi, Yomogi, Matcha ("The Shy One"),
Golden (rare). Matcha is a character, not one of the five everyday
flavors — same lore as the other games.

### Tech

TypeScript (strict) + Vite 6 + Phaser 3.80.1 + Vitest. Fonts: Mochiy
Pop One (headings) / Zen Maru Gothic (body). Sound: WebAudio synth
(no audio files). Deploy: Cloudflare Workers Static Assets via
Wrangler; GitHub Actions checks every push/PR, deploys only when
`CLOUDFLARE_DEPLOY_ENABLED=true` (same as Dango Drop).

### Build steps

- `npm run dev` / `npm run build` run `scripts/decode-assets.mjs`
  first (npm predev/prebuild): the character PNGs are stored as
  `*.png.b64` text files under `assets-src/` (larger ones split into
  `.png.b64.part-NN` chunks) because the GitHub connector used for the
  first upload cannot push binary files. See README.md. The game code
  only reads the decoded `.png` files under `public/`.
- `npm run build`: prepare-dist (clean dist) -> `tsc --noEmit` ->
  `vite build` -> verify-build (checks the public range, HTML
  references, writes `build-info.json`).
- `npm test`: Vitest. Pure rules live in `src/logic/` (no Phaser, no
  DOM) so they are testable in Node. Keep it that way: scenes render,
  logic decides.

### Pushing

- Do NOT use `push_files`: it fails at POST /git/trees with 403
  "Resource not accessible by integration" (same as Dango Tower, even
  after the GitHub App installation was fixed). Push with
  `create_or_update_file`, one file per call — the contents API works.
- `create_repository` also fails with the same 403: the repo must be
  created on GitHub by the account owner.

### Don'ts

- No Japanese in the UI. No secrets in git (`.env` files, tokens).
- Don't change dango-drop, dango-swap or dango-tower repos from here.
- Don't invent character art — use the Drive images (see README.md).
