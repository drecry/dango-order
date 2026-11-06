# Dango Order

**Serve it. Sell it. Smile!**

A cozy dango shop game from DREAM CRYSTAL. Customers arrive with a
skewer order — tap the dango on the pad, bottom-up in the exact order
shown, to build the skewer and serve it before the customer's patience
runs out. A 60-second shift: how much can you sell?

- Play: https://drecry.com/dango-order/ (once deployed — see below)
- Sister games: [Dango Drop](https://drecry.com/dango-drop/) ·
  [Dango Swap](https://drecry.com/dango-swap/) ·
  [Dango Tower](https://drecry.com/dango-tower/)

## How to play

1. **Read the order** — a customer wants a skewer of dango, in order
   from the bottom up.
2. **Tap the pad** — tap the matching dango to build the skewer. A
   wrong dango tries the customer's patience!
3. **Serve fast** — serve before the patience bar runs out for a wait
   bonus. Serves in a row build a combo.
4. **Every order is sold** — each served skewer is sold at the shop.
   DG is your score.

Later in the shift, 4-skewer orders appear. A Matcha order adds +3
seconds to the clock. A Golden order is a VIP customer worth 2x sales.

## How DG is earned

Money earned **is** the score (same as Dango Drop — no separate coins).

```
DG for one served order
  = sum of menu prices x 3       (sold as a shop item)
  x 2 if the order is VIP        (a Golden dango makes it VIP)
  + wait bonus                   (+2 DG per patience second left)
  + combo bonus                  (5 DG x combo, consecutive serves)
```

| Dango     | Price |
|-----------|------:|
| Shiratama |  1 DG |
| Anko      |  2 DG |
| Sakura    |  3 DG |
| Mitarashi |  4 DG |
| Yomogi    |  5 DG |
| Matcha    | 10 DG |
| Golden    | 100 DG |

Special rates: the last dango of an order is Golden (VIP) 12% of the
time and Matcha 16% of the time. Best DG, best orders served and best
combo are saved on the device (localStorage).

All numbers live in `src/config/dango-economy.json` and
`src/config/game-balance.json` — balance tweaks are JSON edits, never
code changes.

## Screens

- **Title** — Play, How to Play, Meet the Dango, best results, sound.
- **How to Play** — rules and the DG formula (its own screen, so the
  game itself can use the whole phone screen).
- **Meet the Dango** — the seven friends, their prices and personalities.
- **Game** — full-screen play area, slim HUD only (DG, time, served,
  combo, sound, pause).
- **Result ("Today's Dango Shop")** — DG earned, orders served, best
  combo, best results, NEW RECORD badge.

All user-facing text is English (worldwide release). Portrait phone
game (540x960), works in a desktop browser too.

## Run locally

```sh
npm ci
npm run dev      # http://localhost:5173/
npm test         # Vitest unit tests for the rules engine
npm run build    # typecheck + build + verify the public output
npm run preview  # serve the production build
```

Design shortcuts: `?scene=howto`, `?scene=meet`, `?scene=game`,
`?scene=result` open a scene directly.

## Deploy

See `docs/deployment.md`. In short: `npm run deploy` (test + build +
`wrangler deploy`). GitHub Actions checks every push/PR to `main` and
deploys only when the `CLOUDFLARE_DEPLOY_ENABLED` variable is `true`
and the Cloudflare credentials are registered — same setup as Dango Drop.

## Tech

TypeScript + Vite + Phaser 3, same stack as Dango Drop, Dango Swap and
Dango Tower. Fonts: Mochiy Pop One (headings) / Zen Maru Gothic (body).
Sound is synthesized with WebAudio — no audio files.

## Character images

The seven dango use the real character art from Dango Drop
(`public/assets/dango/*.png`, same files as Dango Drop, Dango Swap and
Dango Tower).

> **Why are the images stored as `.png.b64`?**
> The GitHub connector used for the first upload cannot push binary
> files, so the exact image bytes are stored as base64 text under
> `assets-src/` (`assets-src/assets/dango/*.png.b64`,
> `assets-src/ogp.png.b64` — larger images are split into numbered
> `.png.b64.part-NN` chunks because the connector also caps a single
> upload) and decoded back into real PNGs under `public/` by
> `scripts/decode-assets.mjs`, which runs automatically before
> `npm run dev` and `npm run build`. The decoded PNGs are git-ignored
> build artifacts. A future direct `git push` can replace each
> `.png.b64` (and its parts) with the real `.png` file under `public/`
> and delete the decode script — the game code only ever reads the
> `.png` files.

## Confirmed decisions (2026-11-06, confirmed by the user)

- Deployment target: publish at `drecry.com/dango-order/` and enable the
  Cloudflare deploy the same way as Dango Drop and Dango Tower.
- Title-screen designer credit: "Designed by ELLY" on the title screen,
  same as Dango Tower.
- DG formula: sum of prices x 3, VIP x2, wait bonus +2 DG per patience
  second left, combo bonus 5 DG x combo.
