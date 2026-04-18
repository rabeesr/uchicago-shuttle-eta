import http from "node:http";
import { config } from "./config.js";
import { log } from "./log.js";

const healthServer = http.createServer((req, res) => {
  if (req.url === "/healthz") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, systemId: config.systemId }));
    return;
  }
  res.writeHead(404);
  res.end();
});

healthServer.listen(config.healthPort, () => {
  log.info("health server listening", { port: config.healthPort });
});

log.info("worker bootstrapping", { systemId: config.systemId });

// Jobs are wired in later commits:
// - dailySync  (routes, stops, route_stops)
// - liveIngest (WS primary, REST fallback)
// - etaTick    (polyline projection → stop_etas)
// - nativeEta  (Passio ETA for favorited stops)

process.on("SIGTERM", () => {
  log.info("SIGTERM received, shutting down");
  healthServer.close(() => process.exit(0));
});
