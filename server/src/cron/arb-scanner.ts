/**
 * Arbitrage Scanner — runs every 5 minutes via cron
 *
 * Flow:
 * 1. Fetch top 50 open markets from Polymarket (Dome API)
 * 2. Fetch top 50 open markets from Kalshi (DFlow API)
 * 3. Use Gemini to match same events across platforms
 * 4. Calculate profit: 100 - (YES_A + NO_B)
 * 5. If profit > MIN_PROFIT_THRESHOLD → send Telegram alert
 *
 * Settings (all configurable via env vars):
 *   ARB_MIN_PROFIT_PCT     default: 3      (minimum % profit to alert)
 *   ARB_MIN_VOLUME         default: 10000  (minimum market volume $)
 *   ARB_SCAN_LIMIT         default: 50     (markets to scan per platform)
 *   ARB_AI_MODEL           default: gemini-2.5-flash
 */

import cron from "node-cron";
import { callAI } from "../ai/router";
import { sendArbAlert, sendNotification } from "../telegram/bot";

const MIN_PROFIT = parseFloat(process.env.ARB_MIN_PROFIT_PCT ?? "3");
const MIN_VOLUME = parseFloat(process.env.ARB_MIN_VOLUME ?? "10000");
const SCAN_LIMIT = parseInt(process.env.ARB_SCAN_LIMIT ?? "50");
const AI_MODEL = process.env.ARB_AI_MODEL ?? "gemini-2.5-flash";

const DOME_API_BASE = "https://api.domeapi.io/v1";
const DFLOW_API_BASE = "https://a.prediction-markets-api.dflow.net/api/v1";

interface Market {
  id: string;
  title: string;
  yesPrice: number; // 0–100
  noPrice: number;  // 0–100
  volume: number;
  platform: "polymarket" | "kalshi";
}

// ─── Data Fetching ────────────────────────────────────────────────────────────

async function fetchPolymarketMarkets(): Promise<Market[]> {
  const key = process.env.DOME_API_KEY;
  if (!key) return [];

  try {
    const res = await fetch(
      `${DOME_API_BASE}/polymarket/markets?status=open&limit=${SCAN_LIMIT}&order_by=volume_total&order=desc`,
      { headers: { Authorization: `Bearer ${key}` } },
    );
    if (!res.ok) return [];
    const data = await res.json() as any;
    const markets: Market[] = [];

    for (const m of data.markets ?? []) {
      const yesPrice = parseFloat(m.price ?? "0") * 100;
      const volume = parseFloat(m.volume_total ?? "0");
      if (volume < MIN_VOLUME) continue;
      markets.push({
        id: m.market_slug ?? m.slug ?? m.condition_id,
        title: m.title ?? "",
        yesPrice,
        noPrice: 100 - yesPrice,
        volume,
        platform: "polymarket",
      });
    }
    return markets.slice(0, SCAN_LIMIT);
  } catch (e) {
    console.error("fetchPolymarketMarkets error:", e);
    return [];
  }
}

async function fetchKalshiMarkets(): Promise<Market[]> {
  const key = process.env.DFLOW_API_KEY;
  if (!key) return [];

  try {
    const res = await fetch(
      `${DFLOW_API_BASE}/markets?status=open&limit=${SCAN_LIMIT}&sort=volume&order=desc`,
      { headers: { Authorization: `Bearer ${key}` } },
    );
    if (!res.ok) return [];
    const data = await res.json() as any;
    const markets: Market[] = [];

    for (const m of data.markets ?? []) {
      const ask = parseFloat(m.yesAsk ?? "0");
      const bid = parseFloat(m.yesBid ?? "0");
      const yesPrice = ((ask + bid) / 2) * 100;
      const volume = parseFloat(m.volume ?? "0");
      if (volume < MIN_VOLUME) continue;
      markets.push({
        id: m.ticker ?? m.id,
        title: m.title ?? m.yesSubTitle ?? "",
        yesPrice,
        noPrice: 100 - yesPrice,
        volume,
        platform: "kalshi",
      });
    }
    return markets.slice(0, SCAN_LIMIT);
  } catch (e) {
    console.error("fetchKalshiMarkets error:", e);
    return [];
  }
}

// ─── AI Matching ──────────────────────────────────────────────────────────────

interface MatchedPair {
  polymarket: Market;
  kalshi: Market;
  confidence: number;
}

async function matchMarketsWithAI(
  polymarkets: Market[],
  kalshiMarkets: Market[],
): Promise<MatchedPair[]> {
  if (!polymarkets.length || !kalshiMarkets.length) return [];

  const systemPrompt = `You are a prediction market matching expert.
Given two lists of markets from different platforms, identify which ones represent the same real-world event.
Return a JSON array of matches:
[{ "polymarketId": "...", "kalshiId": "...", "confidence": 0-100 }]
Only include matches with confidence >= 60. Return [] if no good matches.`;

  const userPrompt = `Polymarket markets:
${JSON.stringify(polymarkets.map((m) => ({ id: m.id, title: m.title })), null, 2)}

Kalshi markets:
${JSON.stringify(kalshiMarkets.map((m) => ({ id: m.id, title: m.title })), null, 2)}

Match them. Return JSON array only.`;

  try {
    const result = await callAI(userPrompt, systemPrompt, "json_object", AI_MODEL, 2);

    // Handle both array and object responses
    let rawMatches: Array<{ polymarketId: string; kalshiId: string; confidence: number }>;
    const parsed = JSON.parse(result.text);
    rawMatches = Array.isArray(parsed) ? parsed : (parsed.matches ?? []);

    const pairs: MatchedPair[] = [];
    for (const match of rawMatches) {
      const poly = polymarkets.find((m) => m.id === match.polymarketId);
      const kalshi = kalshiMarkets.find((m) => m.id === match.kalshiId);
      if (poly && kalshi) {
        pairs.push({ polymarket: poly, kalshi, confidence: match.confidence });
      }
    }
    return pairs;
  } catch (e) {
    console.error("AI matching error:", e);
    return [];
  }
}

// ─── Arbitrage Calculation ────────────────────────────────────────────────────

interface ArbOpportunity {
  marketName: string;
  buyYesOn: "polymarket" | "kalshi";
  buyNoOn: "polymarket" | "kalshi";
  yesPrice: number;
  noPrice: number;
  profitPercent: number;
  instructions: string;
}

function calculateArbitrage(pair: MatchedPair): ArbOpportunity | null {
  const { polymarket, kalshi } = pair;

  // Check both combinations: YES on Poly + NO on Kalshi, and YES on Kalshi + NO on Poly
  const combo1Cost = polymarket.yesPrice + kalshi.noPrice;
  const combo2Cost = kalshi.yesPrice + polymarket.noPrice;

  let buyYesOn: "polymarket" | "kalshi";
  let buyNoOn: "polymarket" | "kalshi";
  let yesPrice: number;
  let noPrice: number;
  let totalCost: number;

  if (combo1Cost < combo2Cost) {
    buyYesOn = "polymarket";
    buyNoOn = "kalshi";
    yesPrice = polymarket.yesPrice;
    noPrice = kalshi.noPrice;
    totalCost = combo1Cost;
  } else {
    buyYesOn = "kalshi";
    buyNoOn = "polymarket";
    yesPrice = kalshi.yesPrice;
    noPrice = polymarket.noPrice;
    totalCost = combo2Cost;
  }

  const profitPercent = 100 - totalCost;
  if (profitPercent < MIN_PROFIT) return null;

  const instructions =
    `1. Buy YES on ${buyYesOn.toUpperCase()} at ${yesPrice.toFixed(1)}¢\n` +
    `2. Buy NO on ${buyNoOn.toUpperCase()} at ${noPrice.toFixed(1)}¢\n` +
    `3. Total cost: ${totalCost.toFixed(1)}¢ → guaranteed payout: 100¢\n` +
    `4. Net profit: ${profitPercent.toFixed(2)}¢ per dollar regardless of outcome`;

  return {
    marketName: polymarket.title || kalshi.title,
    buyYesOn,
    buyNoOn,
    yesPrice,
    noPrice,
    profitPercent,
    instructions,
  };
}

// ─── Main Scan Function ───────────────────────────────────────────────────────

// Track sent alerts to avoid duplicates within the same hour
const recentAlerts = new Set<string>();

async function runArbScan(): Promise<void> {
  console.log(`[ArbScanner] Starting scan at ${new Date().toISOString()}`);

  const [polymarkets, kalshiMarkets] = await Promise.all([
    fetchPolymarketMarkets(),
    fetchKalshiMarkets(),
  ]);

  console.log(`[ArbScanner] Fetched ${polymarkets.length} Polymarket + ${kalshiMarkets.length} Kalshi markets`);

  if (!polymarkets.length || !kalshiMarkets.length) {
    console.log("[ArbScanner] Insufficient data, skipping scan");
    return;
  }

  const pairs = await matchMarketsWithAI(polymarkets, kalshiMarkets);
  console.log(`[ArbScanner] AI matched ${pairs.length} pairs`);

  let alertCount = 0;
  for (const pair of pairs) {
    const opp = calculateArbitrage(pair);
    if (!opp) continue;

    // Deduplicate: skip if we already alerted for this market in the last hour
    const alertKey = `${opp.buyYesOn}-${opp.buyNoOn}-${opp.marketName.slice(0, 30)}`;
    if (recentAlerts.has(alertKey)) continue;
    recentAlerts.add(alertKey);
    setTimeout(() => recentAlerts.delete(alertKey), 60 * 60 * 1000); // expire after 1h

    console.log(`[ArbScanner] OPPORTUNITY: ${opp.marketName} — ${opp.profitPercent.toFixed(2)}% profit`);
    await sendArbAlert(opp);
    alertCount++;
  }

  if (alertCount === 0) {
    console.log("[ArbScanner] No arbitrage opportunities found above threshold");
  } else {
    console.log(`[ArbScanner] Sent ${alertCount} alert(s)`);
  }
}

// ─── Cron Scheduler ──────────────────────────────────────────────────────────

export function startArbScanner(): void {
  console.log(`[ArbScanner] Starting — scanning every 5 minutes (min profit: ${MIN_PROFIT}%, min volume: $${MIN_VOLUME})`);

  // Run immediately on start, then every 5 minutes
  runArbScan().catch(console.error);

  cron.schedule("*/5 * * * *", () => {
    runArbScan().catch(console.error);
  });
}
