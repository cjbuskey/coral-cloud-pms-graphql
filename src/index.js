import express from "express";
import cors from "cors";
import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@as-integrations/express5";
import { typeDefs } from "./schema.js";
import { resolvers } from "./resolvers.js";
import { tokenHandler, bearerAuth } from "./oauth.js";

const PORT = Number(process.env.PORT ?? 4000);
const OAUTH_CLIENT_ID = process.env.OAUTH_CLIENT_ID;
const OAUTH_CLIENT_SECRET = process.env.OAUTH_CLIENT_SECRET;

if (!OAUTH_CLIENT_ID || !OAUTH_CLIENT_SECRET) {
  console.error("OAUTH_CLIENT_ID and OAUTH_CLIENT_SECRET environment variables are required");
  process.exit(1);
}

const apollo = new ApolloServer({
  typeDefs,
  resolvers,
  introspection: true,
});

await apollo.start();

const app = express();

app.get("/health", (_, res) => res.json({ status: "ok" }));

app.post(
  "/oauth/token",
  express.urlencoded({ extended: false }),
  express.json(),
  tokenHandler({ clientId: OAUTH_CLIENT_ID, clientSecret: OAUTH_CLIENT_SECRET })
);

app.use(
  "/graphql",
  bearerAuth,
  cors(),
  express.json({ limit: "1mb" }),
  expressMiddleware(apollo)
);

app.listen(PORT, () => {
  console.log(`Coral Cloud PMS GraphQL listening on :${PORT}`);
  console.log(`  POST /oauth/token   (client_credentials)`);
  console.log(`  POST /graphql        (Bearer auth)`);
});
