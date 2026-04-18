import http from "node:http";
import { config } from "./config.js";
import { log } from "./log.js";
import { scheduleDailySync } from "./jobs/dailySync.js";
import { scheduleLiveIngest } from "./jobs/liveIngest.js";
import { scheduleNativeEta } from "./jobs/nativeEta.js";

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

scheduleDailySync();
scheduleLiveIngest();
scheduleNativeEta();

process.on("SIGTERM", () => {
  log.info("SIGTERM received, shutting down");
  healthServer.close(() => process.exit(0));
});
