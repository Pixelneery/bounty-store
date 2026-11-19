# BountyMine — Minecraft Ruby Store

A configurable ruby store with a Node/Express backend and a static
frontend. Supports **card (Stripe)** checkout, and delivers purchased rubies
automatically via Minecraft RCON.

```
mc-store/
├── config/
│   ├── store.json       ← store name, tagline, enabled payment methods
│   ├── products.json    ← ruby packages: edit this to add/remove/reprice
│   ├── ranks.json       ← ranks, in-game ruby prices, and perk popups
│   ├── crates.json      ← crate keys, prices, delivery command, and contents
│   ├── commands.json    ← configurable ruby grant command template
│   └── goal.json        ← money-goal target in cents
├── lib/
│   ├── db.js            ← Postgres pool, schema bootstrap
│   ├── catalog.js       ← server-side price lookup and validation
│   ├── orders.js        ← orders, goal crediting, command enqueue
│   ├── queue.js         ← pull-based delivery queue (pending/ack)
│   ├── goal.js          ← goal state helpers
│   └── leaderboard.js   ← top donators, computed in SQL
├── routes/
│   ├── admin.js         ← admin login + config CRUD
│   ├── mc.js            ← /api/mc/* endpoints for the Minecraft server
│   └── payments/        ← stripe.js
├── public/               ← storefront and /admin UI (served statically)
├── skript/              ← bountymine-sync.sk (polls this app)
├── app.js               ← Express app
├── server.js            ← entry point (initializes Postgres, listens)
├── reset-goal.js        ← heroku run node reset-goal.js
├── scripts/migrate-orders.js
├── Procfile
└── .env.example          ← copy to .env and fill in real keys
```

## 1. Configure the store (no code changes needed)

Edit `config/store.json` for branding and which payment tabs show up:

```json
{
  "storeName": "BountyMine",
  "tagline": "Rubies in minutes. Back in the game.",
  "paymentMethods": ["card"]
}
```

Edit `config/products.json` to change packages/prices — each entry is:

```json
{ "id": "pkg-2600", "name": "2600 Rubies", "rubies": 2600, "price": 25.00, "originalPrice": null, "badge": "Popular" }
```

Prices are in USD. Change `currency` and `currencySymbol` in `config/store.json`
to switch the whole store and Stripe checkout to another currency.

Ranks live in `config/ranks.json` and are shown on the Ranks page with their
in-game ruby cost. They are display-only and cannot be bought with real money.
Clicking a rank opens a popup listing its `perks`:

```json
{
  "id": "rank-scavenger",
  "name": "Scavenger",
  "ingamePrice": 500,
  "perks": ["Perk slot 1", "Perk slot 2", "Perk slot 3"]
}
```

Crate keys live in `config/crates.json`. Their `perks` array is shown in the
details popup when a crate card is clicked:

```json
{
  "id": "crate-supreme-key",
  "name": "Supreme Crate Key",
  "price": 3.00,
  "command": "crate key give {player} Supreme {qty}",
  "perks": ["Loot slot 1", "Loot slot 2", "Loot slot 3"]
}
```

Perks are plain strings, so you can add, remove, or reword them without touching
any code.

Ranks without a USD `price` stay display-only. To sell one for real money, add a
`price` and optionally a `command` (defaults to
`lp user {player} parent add {rank}`). `{rank}` resolves to the rank's optional
`group` field, or the id without its `rank-` prefix, so the default command maps
to LuckPerms group names (`rank-scavenger` → `scavenger`).

The money goal target lives in `config/goal.json`:

```json
{ "targetCents": 5000 }
```

`5000` means 50.00 in the store currency. When paid orders reach the target the
app queues `crate key giveall Supreme 3` once and keeps `reached = true` until
you run `reset-goal.js`.

These files are read fresh on every request, so changes go live immediately —
no restart required.

## 2. Admin panel (CRUD)

Open `/admin` on the running store. Log in with the credentials in `.env`:

```bash
ADMIN_LOGIN=admin
ADMIN_PASSWORD=change-me
```

The admin panel can:

- change package prices, ruby amounts, badges, and images
- add, edit, and delete ranks and their perks
- add, edit, and delete crate keys, including each key's in-game command
- edit the global ruby grant command

Sessions last 8 hours and are stored in memory, so restarting the server logs
everyone out. Use a strong `ADMIN_PASSWORD` and serve the site over HTTPS.

## 3. Set up Stripe

- dashboard.stripe.com → Developers → API keys, and a webhook pointed at
  `${BASE_URL}/api/payments/stripe/webhook` listening for
  `checkout.session.completed`.
- Checkout prices come from the server catalog, not from the browser. The
  endpoint accepts item ids, quantities, and usernames only; unknown items,
  invalid quantities, and invalid usernames are rejected.

Copy `.env.example` to `.env` and fill in the real values:

```bash
cp .env.example .env
nano .env
```

## 4. Connect order fulfillment to your Minecraft server

The web app never talks to RCON. On payment it writes delivery commands to the
`command_queue` table, and the Minecraft server pulls them over HTTPS:

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/api/mc/pending` | GET | pending commands, one `id` + command per line |
| `/api/mc/ack` | POST | accepts the ids that ran successfully |
| `/api/mc/goal` | GET | current cents, target cents, reached flag |
| `/api/mc/leaderboard` | GET | top buyers as `name` + total per line |

All four require `Authorization: Bearer $SYNC_TOKEN`. Commands are generated
from the catalog, never from browser input. Unacknowledged commands become
available again after two minutes.

The ruby grant command lives in `config/commands.json` and can also be edited
from the admin panel:

```json
{ "rubies": "rubies give {player} {amount}" }
```

Supported placeholders are `{player}`, `{amount}`, and `{rubies}` (all resolve
to the same total). Crate key commands are configured per key in
`config/crates.json` or the admin panel, with `{player}`, `{qty}`, `{name}`, and
`{id}`. Gift orders use the recipient's username.

## 5. Run locally

You need Postgres. Copy `.env.example` to `.env`, point `DATABASE_URL` at your
database, then:

```bash
npm install
npm run dev
# open http://localhost:3000
```

The schema is created automatically on boot. If you are importing an existing
`data/orders.json`, run `npm run migrate-orders`.

## 6. Deploy to Heroku

See [DEPLOY.md](DEPLOY.md) for the full walkthrough: app creation, Postgres
add-on, config vars, Stripe webhook, custom domain, and `reset-goal.js`.

## Notes & next steps

- Orders, the delivery queue, and the goal live in Postgres. The dyno filesystem
  is ephemeral, so admin-panel edits to `config/*.json` only last until the next
  restart; make permanent catalog changes in git and redeploy.
- Add basic rate limiting / abuse protection (e.g. `express-rate-limit`) on
  the checkout endpoints before going fully public.
- The Stripe webhook route needs the **raw** request body for signature
  verification — it is mounted with `express.raw()` in
  `routes/payments/stripe.js`. Do not put a global `express.json()` above it.
- Test the Stripe flow end-to-end in test mode before switching to live keys.
- The Minecraft sync endpoints are authenticated by `SYNC_TOKEN`; rotate it by
  updating the Heroku config var and the Skript `options:` block together.
