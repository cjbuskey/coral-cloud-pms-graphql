import express from "express";
import cors from "cors";
import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@as-integrations/express5";
import { typeDefs } from "./schema.js";
import { resolvers } from "./resolvers.js";
import { tokenHandler, authMiddleware } from "./oauth.js";

const PORT = Number(process.env.PORT ?? 4000);
const OAUTH_CLIENT_ID = process.env.OAUTH_CLIENT_ID;
const OAUTH_CLIENT_SECRET = process.env.OAUTH_CLIENT_SECRET;
const BASIC_AUTH_USER = process.env.BASIC_AUTH_USER;
const BASIC_AUTH_PASSWORD = process.env.BASIC_AUTH_PASSWORD;

if (!OAUTH_CLIENT_ID || !OAUTH_CLIENT_SECRET) {
  console.error("OAUTH_CLIENT_ID and OAUTH_CLIENT_SECRET environment variables are required");
  process.exit(1);
}

if (!BASIC_AUTH_USER || !BASIC_AUTH_PASSWORD) {
  console.error("BASIC_AUTH_USER and BASIC_AUTH_PASSWORD environment variables are required");
  process.exit(1);
}

const apollo = new ApolloServer({
  typeDefs,
  resolvers,
  introspection: true,
});

await apollo.start();

const app = express();

app.use((req, res, next) => {
  const started = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - started;
    console.log(
      `${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms ua="${req.headers["user-agent"] ?? "-"}"`
    );
  });
  next();
});

app.get("/health", (_, res) => res.json({ status: "ok" }));

app.post(
  "/oauth/token",
  express.urlencoded({ extended: false }),
  express.json(),
  tokenHandler({ clientId: OAUTH_CLIENT_ID, clientSecret: OAUTH_CLIENT_SECRET })
);

const graphqlHandlers = [
  authMiddleware({ basicUser: BASIC_AUTH_USER, basicPassword: BASIC_AUTH_PASSWORD }),
  cors(),
  express.json({ limit: "1mb" }),
  expressMiddleware(apollo),
];

app.use("/graphql", ...graphqlHandlers);
app.use("/", ...graphqlHandlers);

app.listen(PORT, () => {
  console.log(`Coral Cloud PMS GraphQL listening on :${PORT}`);
  console.log(`  POST /oauth/token       (client_credentials)`);
  console.log(`  POST / and /graphql     (Bearer or Basic auth)`);
});
