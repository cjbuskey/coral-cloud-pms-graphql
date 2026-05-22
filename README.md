# Coral Cloud PMS — GraphQL Source

Apollo Server that simulates a Property Management System (PMS) for Coral Cloud Resorts. Built to be the source behind the **Data 360 GraphQL Connector** in the Cisco demo.

## Why this exists

The existing demo federates room service requests (`RSR-*`) from Snowflake into Data 360 via zero-copy. Those rows reference `guest_id`, `reservation_id`, and `room_number` but carry **no context** about any of them. This server fills that gap — it exposes guest profiles, reservations, and room metadata as a second federated source. With both sources joined inside Data 360, the Agentforce agent can reason across operations *and* customer context (loyalty tier, lifetime value, prior preferences, in-house vs. checked-out status).

## Schema

Three top-level entity queries — each becomes a DLO/DMO when ingested:

- `guests` / `guest(guestId)` — profile, loyalty tier, lifetime stays, preferences, VIP flag
- `reservations` / `reservation(reservationId)` — current/historical stays with totals and status
- `rooms` / `room(roomNumber)` — room metadata (type, view, accessibility)

All IDs are pinned to the 10 RSR rows in Snowflake so federation joins succeed end-to-end.

## Local dev

```bash
npm install
cp .env.example .env   # set BASIC_AUTH_PASSWORD
npm run dev
```

Smoke test:

```bash
curl -u datacloud:$BASIC_AUTH_PASSWORD \
  -H 'content-type: application/json' \
  -d '{"query":"{ guest(guestId: \"20004993\") { firstName lastName loyaltyTier lifetimeSpend preferences } }"}' \
  http://localhost:4000/graphql
```

Expected: Anastasia Volkov, DIAMOND, $248,500 lifetime, temperature-sensitive sleeper.

## Deploy to Render

1. Push this folder to a Git repo (GitHub/GitLab).
2. Render → New → **Blueprint** → point at the repo. `render.yaml` auto-creates a Docker web service on the free plan.
3. Render generates `BASIC_AUTH_PASSWORD` automatically; copy it from the service's Environment tab.
4. Note the public URL: `https://coral-cloud-pms-graphql.onrender.com` (or similar).

Free tier sleeps after ~15min idle and cold-starts on the next request. Fine for demos; if the connector batch run hits it cold, the first call may time out — warm it with a `curl /health` before the demo.

## Wire the Data 360 GraphQL Connector

Per the [beta docs](https://developer.salesforce.com/docs/data/data-cloud-int/guide/c360-a-graphql-connector.html):

1. **External Credential** — Basic auth, username `datacloud`, password = the value from Render.
2. **Named Credential** — point at `https://<your-render-url>` and bind the External Credential. (Easier than entering basic auth directly in the connection.)
3. **Set Up GraphQL Connection** — pick the Named Credential, save.
4. **Create Data Stream(s)** — for each entity (`guests`, `reservations`, `rooms`):
   - Method: **Zero Copy / Query Federation** (matches the "no data movement" narrative)
   - Primary key: `guestId` / `reservationId` / `roomNumber` respectively
   - Category: profile (guests), engagement (reservations), other (rooms)
5. Map the resulting DLOs into DMOs and join against the existing Snowflake `room_service_request` DMO via `guest_id` / `reservation_id` / `room_number`.

## Demo punchline

Before this connector: "RSR-100001 is a high-priority AC complaint from guest 20004993 in room 385."

After this connector + DMO join: "RSR-100001 is a high-priority AC complaint from **Anastasia Volkov, Diamond tier, 17 lifetime stays, $248K lifetime spend, currently in-house in a $2,400/night Oceanfront Villa, checking out tomorrow** — and her profile flags her as a temperature-sensitive sleeper. The reservation note already asked us to pre-cool the room."

Same agent, same Slack-triggered case creation flow. Two sources, federated via Data 360, no data moved.
