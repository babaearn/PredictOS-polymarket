/**
 * PredictOS Express API Server
 * Deployed on Railway — replaces Supabase Edge Functions
 *
 * Routes:
 *   POST /api/get-events     → fetch market data by URL
 *   POST /api/analyze        → AI market analysis
 *   POST /api/bookmaker      → aggregate multiple analyses
 *   POST /api/arbitrage      → cross-platform arb finder
 *   POST /api/wallet         → wallet tracking via Dome API
 *   POST /telegram/webhook   → Telegram bot updates
 *   GET  /health             → health check
 */

import "dotenv/config";
import express from "express";
import cors from "cors";

import getEventsRoute from "./routes/get-events";
import analyzeRoute from "./routes/analyze";
import bookmakerRoute from "./routes/bookmaker";
import arbitrageRoute from "./routes/arbitrage";
import walletRoute from "./routes/wallet";
import { handleUpdate, setupBot } from "./telegram/bot";
import { startArbScanner } from "./cron/arb-scanner";

const app = express();
const PORT = parseInt(process.env.PORT ?? "3001");
const PUBLIC_URL = process.env.PUBLIC_URL; // e.g. https://predictos-server.railway.app

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "10mb" }));

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use("/api/get-events", getEventsRoute);
app.use("/api/analyze", analyzeRoute);
app.use("/api/bookmaker", bookmakerRoute);
app.use("/api/arbitrage", arbitrageRoute);
app.use("/api/wallet", walletRoute);

// ─── Telegram Webhook ─────────────────────────────────────────────────────────
app.post("/telegram/webhook", (req, res) => {
  try {
    handleUpdate(req.body);
    res.sendStatus(200);
  } catch (error) {
    console.error("Telegram webhook error:", error);
    res.sendStatus(500);
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`PredictOS server running on port ${PORT}`);

  // Set up Telegram bot webhook if token is configured
  if (process.env.TELEGRAM_BOT_TOKEN && PUBLIC_URL) {
    try {
      await setupBot(PUBLIC_URL);
      console.log("Telegram bot configured");
    } catch (error) {
      console.error("Telegram bot setup failed:", error);
    }
  } else {
    console.warn("TELEGRAM_BOT_TOKEN or PUBLIC_URL not set — bot disabled");
  }

  // Start the arbitrage scanner cron job
  if (process.env.DOME_API_KEY && process.env.DFLOW_API_KEY) {
    startArbScanner();
  } else {
    console.warn("DOME_API_KEY or DFLOW_API_KEY not set — arb scanner disabled");
  }
});

export default app;
