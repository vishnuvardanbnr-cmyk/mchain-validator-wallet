import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import rateLimit from "express-rate-limit";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import router from "./routes";
import { logger } from "./lib/logger";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app: Express = express();

// Trust the nginx reverse proxy (one hop)
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
// Rate limiting — 120 requests per minute per IP for public API
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  message: { error: "Too many requests, please try again later." },
  skip: (req) => req.path.startsWith("/api/admin/"), // admin has its own stricter limit
});

const adminLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  message: { error: "Too many requests." },
});

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.use("/api/admin", adminLimiter);
app.use("/api", apiLimiter);
app.use("/api", router);

// Serve admin panel static files at /admin
const adminDist = path.resolve(__dirname, "admin");
if (existsSync(adminDist)) {
  // Hashed assets (JS/CSS) — long cache, immutable
  app.use("/admin/assets", express.static(path.join(adminDist, "assets"), {
    maxAge: "1y",
    immutable: true,
  }));
  // index.html and other root files — never cache so browsers always get latest
  app.use("/admin", express.static(adminDist, { maxAge: 0, etag: false }));
  // SPA fallback — serve index.html for any /admin/* route
  app.get("/admin/*splat", (_req, res) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.sendFile(path.join(adminDist, "index.html"));
  });
}

export default app;
