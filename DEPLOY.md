# Deploying to Heroku

The app runs as a single Basic web dyno with Heroku Postgres. Nothing is written
to the dyno's filesystem: orders, the delivery queue, the money goal, and the
leaderboard all live in Postgres.

## 1. Prerequisites

- A Heroku account with billing enabled.
- The [Heroku CLI](https://devcenter.heroku.com/articles/heroku-cli).
- This repository pushed to GitHub (or any Git remote Heroku can pull from).
- A Stripe account. Use **test mode** keys until the flow is verified.

```bash
heroku login
```

## 2. Create the app and the database

```bash
heroku create tacorealms-store
heroku ps:type web=basic
heroku addons:create heroku-postgresql:essential-0
```

`heroku addons:create` sets `DATABASE_URL` automatically. Confirm it:

```bash
heroku config:get DATABASE_URL
```

The app enables `ssl: { rejectUnauthorized: false }` whenever
`NODE_ENV=production`, which is what Heroku Postgres requires.

## 3. Set configuration variables

Generate a sync token first. Keep it somewhere safe; the Minecraft server needs
the same value.

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Then set every variable (replace the placeholders):

```bash
heroku config:set NODE_ENV=production
heroku config:set BASE_URL=https://store.example.com
heroku config:set STRIPE_SECRET_KEY=sk_test_xxx
heroku config:set SYNC_TOKEN=the-token-you-generated
heroku config:set DISCORD_GUILD_ID=your-discord-guild-id
heroku config:set ADMIN_LOGIN=admin
heroku config:set ADMIN_PASSWORD=a-long-random-password
```

Do not set `DATABASE_URL` manually; the add-on manages it. `STRIPE_WEBHOOK_SECRET`
is added in step 6, after the Stripe endpoint exists.

`BASE_URL` must be the final HTTPS origin (no trailing slash). It is used for the
Stripe success/cancel redirects.

## 4. Deploy

```bash
git push heroku main
```

If your branch is called `master`, use `git push heroku master`.

Heroku installs dependencies, runs the buildpack, and starts the `web` process
from the `Procfile` (`node server.js`). On boot the app creates the `orders`,
`command_queue`, and `goal_state` tables if they are missing.

Check the logs:

```bash
heroku logs --tail
```

## 5. Custom domain and DNS

```bash
heroku domains:add store.example.com
heroku domains
```

`heroku domains` prints a **DNS Target** such as
`sparkling-unicorn-1234.herokudns.com`. At your DNS provider create:

| Type  | Name  | Value                        |
| ----- | ----- | ---------------------------- |
| CNAME | store | the DNS Target from Heroku   |

Heroku provisions and renews the TLS certificate automatically once DNS resolves.
Then make sure `BASE_URL` matches the custom domain:

```bash
heroku config:set BASE_URL=https://store.example.com
```

## 6. Stripe webhook

In the Stripe Dashboard (test mode):

1. **Developers → Webhooks → Add endpoint**.
2. Endpoint URL: `https://store.example.com/api/payments/stripe/webhook`.
3. Events: `checkout.session.completed`.
4. Save the endpoint, then copy its **Signing secret** (`whsec_...`).

```bash
heroku config:set STRIPE_WEBHOOK_SECRET=whsec_xxx
```

The webhook is idempotent: Stripe retries and duplicate deliveries do not create
duplicate delivery commands or double-count the goal.

## 7. Minecraft server sync

Set `SYNC_TOKEN` to the same value in `skript/tacorealms-sync.sk` (the `options:`
block at the top) and set `base-url` to the public store URL. The script polls:

- `/api/mc/pending` every 10 seconds, runs each command from console, then
  acknowledges the ids via `POST /api/mc/ack`.
- `/api/mc/goal` and `/api/mc/leaderboard` every 60 seconds for placeholders.

All three endpoints require `Authorization: Bearer <SYNC_TOKEN>`.

## 8. Importing old orders (optional)

If `data/orders.json` exists in the repo, import it once:

```bash
heroku run node scripts/migrate-orders.js
```

The importer skips ids that already exist, so it is safe to re-run.

## 9. Resetting the money goal

When the goal is reached the app enqueues `crate key giveall Supreme 3` exactly
once and then keeps `reached = true`. Reset it with:

```bash
heroku run node reset-goal.js
```

This sets `current_cents = 0` and `reached = false`. The target is read from
`config/goal.json` (`targetCents`, default `5000` = 50.00 in store currency).

## Operations notes

- **The dyno filesystem is ephemeral.** The admin panel edits files under
  `config/`, so those edits last only until the next dyno restart and are not
  shared between dynos. For permanent catalog changes, edit the JSON files and
  redeploy. Orders and goal data are unaffected because they live in Postgres.
- **One dyno only.** The in-memory admin session store and file-based config
  assume a single web dyno. If you scale beyond one, move admin sessions to a
  shared store first.
- **Logs:** `heroku logs --tail`.
- **Restart:** `heroku restart` (also logs every admin session out).
- **Database access:** `heroku pg:psql`.
