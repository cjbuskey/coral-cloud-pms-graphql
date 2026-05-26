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

## Endpoints

GraphQL is served at both `/graphql` and `/` (the connector POSTs to the URL root). Each accepts `Authorization: Bearer <token>` or `Authorization: Basic <base64>`.

- `POST /` — GraphQL endpoint (this is what the Data 360 connector hits)
- `POST /graphql` — same endpoint, alternate path for tooling that expects it
- `POST /oauth/token` — OAuth 2.0 Client Credentials grant; returns a 1-hour bearer
- `GET /health` — unauthenticated health check (returns `{"status":"ok"}`)

## Auth

The server accepts two auth methods on the GraphQL endpoint:

1. **HTTP Basic** — `Authorization: Basic base64(user:password)`. Uses `BASIC_AUTH_USER` / `BASIC_AUTH_PASSWORD`. **This is what the Data 360 GraphQL Connector actually uses** — its beta release does not support Named Credential / OAuth Client Credentials at runtime (it returns `Protocol type [OAUTH_CLIENT_CREDS_CLIENT_SECRET] is not supported`).
2. **OAuth 2.0 Bearer (Client Credentials grant)** — `Authorization: Bearer <token>`. Token is issued by `POST /oauth/token` from `OAUTH_CLIENT_ID` / `OAUTH_CLIENT_SECRET`. Useful for Apex callouts via Named Credential, integration tests, and any future tooling that prefers OAuth.

Tokens are opaque (random 32-byte base64url) and held in memory. Restart invalidates them; clients re-fetch automatically.

## Environment variables

All four are required. None should ever be committed.

| Variable | Source | Purpose |
|---|---|---|
| `OAUTH_CLIENT_ID` | Render auto-generated | OAuth client ID |
| `OAUTH_CLIENT_SECRET` | Render auto-generated | OAuth client secret |
| `BASIC_AUTH_USER` | `datacloud` (default) | Basic auth username for the connector |
| `BASIC_AUTH_PASSWORD` | Render auto-generated | Basic auth password for the connector |
| `PORT` | Render-injected (10000) | Listen port |

## Local dev

```bash
npm install
cp .env.example .env       # fill in real values; .env is gitignored
npm run dev
```

Smoke test (Basic auth — what the connector uses):

```bash
curl -u "$BASIC_AUTH_USER:$BASIC_AUTH_PASSWORD" \
  -H 'content-type: application/json' \
  -d '{"query":"{ guest(guestId: \"20004993\") { firstName lastName loyaltyTier lifetimeSpend preferences } }"}' \
  http://localhost:4000/
```

Smoke test (OAuth bearer):

```bash
TOKEN=$(curl -s -X POST \
  --data-urlencode "grant_type=client_credentials" \
  --data-urlencode "client_id=$OAUTH_CLIENT_ID" \
  --data-urlencode "client_secret=$OAUTH_CLIENT_SECRET" \
  http://localhost:4000/oauth/token | python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])')

curl -H "Authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"query":"{ guest(guestId: \"20004993\") { firstName loyaltyTier } }"}' \
  http://localhost:4000/graphql
```

Either should return Anastasia Volkov, DIAMOND, $248,500 lifetime, temperature-sensitive sleeper.

## Deploy to Render

1. Push this folder to a Git repo.
2. Render → New → **Blueprint** → point at the repo. `render.yaml` creates a Docker web service on the free plan and seeds env vars (auto-generated for OAuth + basic auth secrets, `datacloud` as the basic auth username).
3. After the first deploy, copy the generated `OAUTH_CLIENT_ID`, `OAUTH_CLIENT_SECRET`, and `BASIC_AUTH_PASSWORD` from the service's **Environment** tab — you'll paste them into Salesforce next.
4. Note the public URL: `https://coral-cloud-pms-graphql.onrender.com` (or similar).

Free tier sleeps after ~15 min idle and cold-starts on the next request. Fine for development; for a live demo, either warm with `curl /health` 60s before, or upgrade to Starter ($7/mo) for the demo week and downgrade after.

## Wire the Data 360 GraphQL Connector

Per the [beta docs](https://developer.salesforce.com/docs/data/data-cloud-int/guide/c360-a-graphql-connector.html). The connector is CData under the hood — it POSTs to the URL root, supports Basic and (in this beta) does **not** support Client Credentials OAuth.

### Connection

Data Cloud Setup → Connections → New → **GraphQL**:

- **Connection Name:** `Coral Cloud PMS`
- **Authentication Method:** **Basic Authentication**
- **Username:** `datacloud` (or whatever `BASIC_AUTH_USER` is set to)
- **Password:** the `BASIC_AUTH_PASSWORD` from Render
- **URL:** `https://<your-render-url>` (no path — connector hits the root)
- **Test Connection** → expect green
- Save

### Data Streams

For each entity (`guests`, `reservations`, `rooms`):

- Method: **Zero Copy / Query Federation**
- Primary key: `guestId` / `reservationId` / `roomNumber` respectively
- Category: profile (guests), engagement (reservations), other (rooms)

Skip the singular variants (`guest`, `reservation`, `room`) — those are arg-required lookups, not list queries the connector can ingest.

Map the resulting DLOs into DMOs and join against the existing Snowflake `room_service_request` DMO via `guest_id` / `reservation_id` / `room_number`.

### Optional: External / Named Credential for Apex callouts

The OAuth Client Credentials path on the server is still useful for `callout:` from Apex even though the connector itself can't use it. If you need Apex to call the PMS:

1. **External Credential** — Authentication Protocol: OAuth 2.0; Flow Type: Client Credentials with Client Secret Flow; Identity Provider URL: `https://<your-render-url>/oauth/token`; check **Pass client credentials in request body**. Add a Named Principal with the `OAUTH_CLIENT_ID` / `OAUTH_CLIENT_SECRET` from Render. Grant access via permission set (External Credential Principal Access).
2. **Named Credential** — URL: `https://<your-render-url>`; bind the External Credential; **Generate Authorization Header: ON**.
3. Apex test:
   ```apex
   HttpRequest req = new HttpRequest();
   req.setEndpoint('callout:Coral_Cloud_PMS/graphql');
   req.setMethod('POST');
   req.setHeader('Content-Type', 'application/json');
   req.setBody('{"query":"{guest(guestId:\\"20004993\\"){firstName loyaltyTier}}"}');
   System.debug(new Http().send(req).getBody());
   ```

## Secrets hygiene

- `.env` and `.env.*` are gitignored; only `.env.example` is tracked, with placeholder values
- All Render env vars are either auto-generated (`generateValue: true`) or non-secret (`BASIC_AUTH_USER=datacloud`)
- No real client IDs, secrets, or passwords appear anywhere in the tree or git history
- If a secret leaks, rotate via Render's **Environment** tab — generate a new value, save, redeploy. Update the connector's Basic password in Salesforce to match.

## Demo punchline

Before this connector: "RSR-100001 is a high-priority AC complaint from guest 20004993 in room 385."

After this connector + DMO join: "RSR-100001 is a high-priority AC complaint from **Anastasia Volkov, Diamond tier, 17 lifetime stays, $248K lifetime spend, currently in-house in a $2,400/night Oceanfront Villa, checking out tomorrow** — and her profile flags her as a temperature-sensitive sleeper. The reservation note already asked us to pre-cool the room."

Same agent, same Slack-triggered case creation flow. Two sources, federated via Data 360, no data moved.
