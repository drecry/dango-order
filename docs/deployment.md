# Publishing (Dango Order)

This repository owns Dango Order only, served at
https://drecry.com/dango-order/. The company site is drecry-site; each
game has its own repository. Do not change the URL, the game content or
the leaderboard database from here.

## Publish steps

Prepare Node.js 24, npm and Git, then run in order:

```sh
npm ci
npm run deploy
```

`deploy` runs the tests, the type check, the build and the public-output
check, and publishes only if all of them pass. Wrangler login is used
for Cloudflare. Never store secrets in Git.

After publishing, compare the commit in
`/dango-order/build-info.json` with the GitHub commit.

## Automatic publishing via GitHub

Pushes to `main` and PRs run automatic checks. Publishing is disabled
at first. Register a dedicated `CLOUDFLARE_API_TOKEN` (Secrets) and
`CLOUDFLARE_ACCOUNT_ID` (Variables) in this repository's Actions, and
set `CLOUDFLARE_DEPLOY_ENABLED=true` (Variables) to publish only after
the checks on `main` pass. The token needs Workers Scripts edit and
Workers Routes edit / Zone read permission for the target account and
zone. Check the permission and the save location before registering.
Do not reuse a personal Wrangler OAuth token.

The `drecry.com/dango-order/` route itself is switched at the company
site level (drecry-site), like the other games. Coordinate the route
switch with the site repository; the game repository only builds the
files under `/dango-order/`.
