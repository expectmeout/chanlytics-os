/**
 * Stands in for the edge on a copy of the app away from production (the nightly's whole suite, nightly-e2e.yml).
 *
 *   node tooling/scripts/e2e-harness/edge-stub.mjs 3101
 *
 * Every call is refused, as an edge with nothing set up refuses it, and each is logged, so a run says which of the suite's
 * paths reached for the edge at all. Without this, EDGE_URL unset, the app calls production's edge.
 */
import { createServer } from "node:http";

const port = Number(process.argv[2]);
if (!Number.isInteger(port) || port <= 0) {
  console.error("say which port: node tooling/scripts/e2e-harness/edge-stub.mjs 3101");
  process.exit(2);
}

createServer((req, res) => {
  console.log(`${req.method} ${req.url}`);
  res.writeHead(503, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: "not_configured" }));
}).listen(port, "127.0.0.1", () => console.log(`the edge's stand-in listens on ${port}`));
