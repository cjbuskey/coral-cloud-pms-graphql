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

## Auth

OAuth 2.0 **Client Credentials** grant. The Data 360 GraphQL Connector requires OAuth — basic/custom-header auth is not accepted at runtime even when the underlying Named Credential supports it.

- **`POST /oauth/token`** — accepts `grant_type=client_credentials` with client id/secret either in the body or as HTTP Basic Authorization. Returns a 1-hour bearer token.
- **`POST /graphql`** — requires `Authorization: Bearer <token>`.

Tokens are opaque (random 32-byte base64url) and held in memory. They survive process lifetime only; Render redeploys invalidate them, but the connector re-fetches automatically.

## Local dev

```bash
npm install
cp .env.example .env   # set OAUTH_CLIENT_ID and OAUTH_CLIENT_SECRET
npm run dev
```

Smoke test:

```bash
TOKEN=$(curl -s -X POST \
  -d 'grant_type=client_credentials' \
  -d "client_id=$OAUTH_CLIENT_ID" \
  -d "client_secret=$OAUTH_CLIENT_SECRET" \
  http://localhost:4000/oauth/token | python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])')

curl -H "Authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"query":"{ guest(guestId: \"20004993\") { firstName lastName loyaltyTier lifetimeSpend preferences } }"}' \
  http://localhost:4000/graphql
```

Expected: Anastasia Volkov, DIAMOND, $248,500 lifetime, temperature-sensitive sleeper.

## Deploy to Render

1. Push this folder to a Git repo (GitHub/GitLab).
2. Render → New → **Blueprint** → point at the repo. `render.yaml` auto-creates a Docker web service on the free plan.
3. Render generates `OAUTH_CLIENT_ID` and `OAUTH_CLIENT_SECRET` automatically; copy them from the service's Environment tab.
4. Note the public URL: `https://coral-cloud-pms-graphql.onrender.com` (or similar).

Free tier sleeps after ~15min idle and cold-starts on the next request. Fine for demos; if the connector batch run hits it cold, the first call may time out — warm it with a `curl /health` before the demo, or upgrade to Starter ($7/mo) for the demo week.

## Wire the Data 360 GraphQL Connector

Per the [beta docs](https://developer.salesforce.com/docs/data/data-cloud-int/guide/c360-a-graphql-connector.html):

### 1. External Credential (OAuth 2.0 Client Credentials)

Setup → Named Credentials → External Credentials tab → New:

- **Authentication Protocol:** OAuth 2.0
- **Authentication Flow Type:** Client Credentials with Client Secret Flow
- **Token Endpoint URL:** `https://<your-render-url>/oauth/token`
- Save, then add a Principal with:
  - **Identity Type:** Named Principal
  - **Client ID:** the `OAUTH_CLIENT_ID` value from Render
  - **Client Secret:** the `OAUTH_CLIENT_SECRET` value from Render
- Add the External Credential to a permission set (External Credential Principal Access) and assign that permission set to your user.

### 2. Named Credential

Named Credentials tab → New:

- **URL:** `https://<your-render-url>`
- **External Credential:** the one above
- **Generate Authorization Header:** ON
- **Allow Formulas in HTTP Header:** ON

### 3. GraphQL Connection

Data Cloud Setup → Connections → New → GraphQL:

- Authentication Method: **Named Credential**
- Named Credential: the one above
- URL: `https://<your-render-url>`
- **Test Connection** → expect green
- Save

### 4. Data Streams

For each entity (`guests`, `reservations`, `rooms`):

- Method: **Zero Copy / Query Federation**
- Primary key: `guestId` / `reservationId` / `roomNumber` respectively
- Category: profile (guests), engagement (reservations), other (rooms)

Skip the singular variants (`guest`, `reservation`, `room`) — those are arg-required lookups, not list queries the connector can ingest.

Map the resulting DLOs into DMOs and join against the existing Snowflake `room_service_request` DMO via `guest_id` / `reservation_id` / `room_number`.

## Demo punchline

Before this connector: "RSR-100001 is a high-priority AC complaint from guest 20004993 in room 385."

After this connector + DMO join: "RSR-100001 is a high-priority AC complaint from **Anastasia Volkov, Diamond tier, 17 lifetime stays, $248K lifetime spend, currently in-house in a $2,400/night Oceanfront Villa, checking out tomorrow** — and her profile flags her as a temperature-sensitive sleeper. The reservation note already asked us to pre-cool the room."

Same agent, same Slack-triggered case creation flow. Two sources, federated via Data 360, no data moved.
