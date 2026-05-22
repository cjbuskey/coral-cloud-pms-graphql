import express from "express";
import cors from "cors";
import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@as-integrations/express5";
import { typeDefs } from "./schema.js";
import { resolvers } from "./resolvers.js";

const PORT = Number(process.env.PORT ?? 4000);
const BASIC_AUTH_USER = process.env.BASIC_AUTH_USER ?? "datacloud";
const BASIC_AUTH_PASSWORD = process.env.BASIC_AUTH_PASSWORD;

if (!BASIC_AUTH_PASSWORD) {
  console.error("BASIC_AUTH_PASSWORD environment variable is required");
  process.exit(1);
}

function basicAuth(req, res, next) {
  if (req.path === "/health") return next();

  const header = req.headers.authorization ?? "";
  if (!header.startsWith("Basic ")) {
    res.set("WWW-Authenticate", 'Basic realm="coral-cloud-pms"');
    return res.status(401).json({ error: "Authentication required" });
  }

  const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  const sep = decoded.indexOf(":");
  const user = sep === -1 ? decoded : decoded.slice(0, sep);
  const pass = sep === -1 ? "" : decoded.slice(sep + 1);

  if (user !== BASIC_AUTH_USER || pass !== BASIC_AUTH_PASSWORD) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  next();
}

const apollo = new ApolloServer({
  typeDefs,
  resolvers,
  introspection: true,
});

await apollo.start();

const app = express();
app.get("/health", (_, res) => res.json({ status: "ok" }));
app.use("/graphql", basicAuth, cors(), express.json({ limit: "1mb" }), expressMiddleware(apollo));

app.listen(PORT, () => {
  console.log(`Coral Cloud PMS GraphQL listening on :${PORT}/graphql`);
});
