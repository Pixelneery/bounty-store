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
│   ├── crates.json      ← crate keys, prices, RCON command, and contents
│   └── commands.json    ← configurable ruby grant command template
├── data/orders.json     ← lightweight order log (auto-created)
├── lib/
│   ├── orders.js        ← order storage
│   └── fulfill.js       ← grants rubies in-game via RCON after payment
├── routes/
│   ├── admin.js         ← admin login + CRUD API
│   └── payments/        ← stripe.js
├── public/               ← storefront and /admin UI (served statically)
├── server.js
└── .env.example          ← copy to .env and fill in real keys
```

## 1. Configure the store (no code changes needed)

Edit `config/store.json` for branding and which payment tabs show up:

```json
{
  "storeName": "BountyMine",
  "tagline": "Bounties posted. Rubies ready.",
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
  `https://your-domain.com/api/payments/stripe/webhook` listening for
  `checkout.session.completed`.

Copy `.env.example` to `.env` and fill in the real values:

```bash
cp .env.example .env
nano .env
```

## 4. Connect order fulfillment to your Minecraft server

`lib/fulfill.js` opens an RCON connection to your server and runs a console
command to grant rubies after a payment confirms. The ruby command lives in
`config/commands.json` and can also be edited from the admin panel:

```json
{ "rubies": "rubies give {player} {amount}" }
```

Supported placeholders are `{player}`, `{amount}`, and `{rubies}` (all resolve
to the same total). Crate key commands are configured per key in
`config/crates.json` or the admin panel, with `{player}`, `{qty}`, `{name}`, and
`{id}`.

Set `RCON_HOST`, `RCON_PORT`, `RCON_PASSWORD` in `.env` to match your
`server.properties` RCON settings (`enable-rcon=true`).

## 5. Run locally

```bash
npm install
npm run dev
# open http://localhost:3000
```

## 6. Deploy to your Linux server

```bash
# on the server
git clone <your-repo-url> mc-store   # or scp the folder over
cd mc-store
npm install --omit=dev
cp .env.example .env && nano .env    # fill in real keys + PUBLIC_BASE_URL

# keep it running with pm2
npm install -g pm2
pm2 start server.js --name bountymine
pm2 save
pm2 startup   # follow the printed instructions to start on boot
```

Put Nginx in front of it as a reverse proxy with HTTPS (Let's Encrypt via
certbot), forwarding to `http://127.0.0.1:3000`. A minimal server block:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

Then run `certbot --nginx -d your-domain.com` to get HTTPS. Stripe webhooks
require HTTPS, so this step isn't optional.

## Notes & next steps

- Orders are currently logged to `data/orders.json`. Fine for a small store;
  swap `lib/orders.js` for a real database (Postgres/SQLite) once volume grows.
- Add basic rate limiting / abuse protection (e.g. `express-rate-limit`) on
  the checkout endpoints before going fully public.
- The Stripe webhook route needs the **raw** request body for signature
  verification — this is already wired correctly in `server.js`, just don't
  add a global `express.json()` middleware above it.
- Test the Stripe flow end-to-end in test mode before flipping `.env` to
  live keys.
