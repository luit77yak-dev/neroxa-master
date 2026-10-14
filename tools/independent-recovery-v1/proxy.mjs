// Private test-only loopback prefix adapter; no internet upstreams or credential logs.
import fs from "node:fs";
import http from "node:http";
const c = JSON.parse(fs.readFileSync(process.env.AB_WORKDIR + "/dr-services.private.json", "utf8"));
for (const u of [c.auth, c.rest])
  if (new URL(u).hostname !== "127.0.0.1") throw Error("Non-loopback upstream");
http
  .createServer((req, res) => {
    const base = req.url.startsWith("/auth/v1/")
      ? c.auth
      : req.url.startsWith("/rest/v1/")
        ? c.rest
        : null;
    if (!base) {
      res.writeHead(404);
      return res.end();
    }
    const target = new URL(req.url.replace(/^\/(auth|rest)\/v1/, ""), base);
    const out = http.request(
      target,
      { method: req.method, headers: { ...req.headers, host: target.host } },
      (r) => {
        res.writeHead(r.statusCode, r.headers);
        r.pipe(res);
      },
    );
    out.on("error", () => {
      res.writeHead(502);
      res.end("Disposable upstream unavailable");
    });
    req.pipe(out);
  })
  .listen(56321, "127.0.0.1");
