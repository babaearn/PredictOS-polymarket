/**
 * Express route: POST /api/arbitrage
 * Cross-platform arbitrage finder (Polymarket ↔ Kalshi)
 */
import { Router, Request, Response } from "express";
import { callAI } from "../ai/router";

const router = Router();

const GAMMA_API_URL = "https://gamma-api.polymarket.com";
const DFLOW_API_BASE = "https://a.prediction-markets-api.dflow.net/api/v1";

interface SimplifiedMarket {
  title: string;
  yesPrice: number;
  identifier?: string;
}

function detectPlatform(url: string): "polymarket" | "kalshi" | null {
  const lower = url.toLowerCase();
  if (lower.includes("polymarket.com")) return "polymarket";
  if (lower.includes("kalshi.com")) return "kalshi";
  return null;
}

function extractPolymarketSlug(url: string): string | null {
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    return parts[0] === "event" && parts[1] ? parts[1] : null;
  } catch { return null; }
}

function extractKalshiTicker(url: string): string | null {
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    if ((parts[0] === "markets" || parts[0] === "events") && parts.length >= 2) {
      return (parts.length >= 4 ? parts[parts.length - 1] : parts[1]).toUpperCase();
    }
    return null;
  } catch { return null; }
}

async function searchPolymarket(query: string): Promise<SimplifiedMarket[]> {
  const res = await fetch(`${GAMMA_API_URL}/public-search?q=${encodeURIComponent(query)}&events_status=open`);
  if (!res.ok) return [];
  const data = await res.json();
  const markets: SimplifiedMarket[] = [];
  for (const event of data.events ?? []) {
    for (const market of event.markets ?? []) {
      const title = market.question || market.title || "";
      let yesPrice = 50;
      try { yesPrice = parseFloat(JSON.parse(market.outcomePrices)[0]) * 100; } catch { /* noop */ }
      if (title) markets.push({ title, yesPrice, identifier: event.slug });
    }
  }
  return markets;
}

async function searchKalshi(query: string): Promise<SimplifiedMarket[]> {
  const dflowKey = process.env.DFLOW_API_KEY;
  const res = await fetch(
    `${DFLOW_API_BASE}/search?q=${encodeURIComponent(query)}&event_status=open&withNestedMarkets=true`,
    { headers: dflowKey ? { Authorization: `Bearer ${dflowKey}` } : {} },
  );
  if (!res.ok) return [];
  const data = await res.json();
  const markets: SimplifiedMarket[] = [];
  for (const event of data.events ?? []) {
    for (const market of event.markets ?? []) {
      const title = market.yesSubTitle || market.title || "";
      let yesPrice = 50;
      if (market.yesAsk && market.yesBid) yesPrice = ((parseFloat(market.yesAsk) + parseFloat(market.yesBid)) / 2) * 100;
      else if (market.yesAsk) yesPrice = parseFloat(market.yesAsk) * 100;
      if (title) markets.push({ title, yesPrice, identifier: event.ticker });
    }
  }
  return markets;
}

const ARBITRAGE_SYSTEM_PROMPT = `You are a prediction market arbitrage expert.
Given markets from two platforms, identify if they represent the same event and calculate arbitrage opportunity.
Return JSON with this structure:
{
  "isSameMarket": boolean,
  "sameMarketConfidence": 0-100,
  "matchedMarket": { "title": "...", "yesPrice": number, "identifier": "..." } | null,
  "arbitrage": {
    "hasArbitrage": boolean,
    "profitPercent": number,
    "buyYesOn": "polymarket" | "kalshi",
    "buyNoOn": "polymarket" | "kalshi",
    "yesPrice": number,
    "noPrice": number,
    "instructions": "step by step instructions"
  },
  "summary": "brief summary",
  "risks": ["risk1"],
  "recommendation": "what to do"
}`;

router.post("/", async (req: Request, res: Response) => {
  const { url, model } = req.body;
  if (!url) return res.status(400).json({ success: false, error: "Missing 'url'" });
  if (!model) return res.status(400).json({ success: false, error: "Missing 'model'" });

  const sourcePlatform = detectPlatform(url);
  if (!sourcePlatform) {
    return res.status(400).json({ success: false, error: "Must be a Polymarket or Kalshi URL" });
  }

  const searchPlatform = sourcePlatform === "polymarket" ? "kalshi" : "polymarket";

  try {
    const startTime = Date.now();

    // Step 1: Extract identifier
    const identifier = sourcePlatform === "polymarket"
      ? extractPolymarketSlug(url)
      : extractKalshiTicker(url);

    if (!identifier) {
      return res.status(400).json({ success: false, error: "Could not extract identifier from URL" });
    }

    // Step 2: Generate AI search query
    const queryResult = await callAI(
      `Generate a 1-2 word search query for this market: "${identifier.replace(/-/g, " ")}"`,
      "Reply with only 1-2 keywords, no punctuation.",
      "text",
      model,
      1,
    );
    const searchQuery = queryResult.text.replace(/['"]/g, "").trim().split(/\s+/).slice(0, 2).join(" ");

    // Step 3: Search the other platform
    const searchResults = searchPlatform === "polymarket"
      ? await searchPolymarket(searchQuery)
      : await searchKalshi(searchQuery);

    if (!searchResults.length) {
      return res.json({
        success: true,
        data: { isSameMarket: false, arbitrage: { hasArbitrage: false }, summary: `No matching markets found on ${searchPlatform}` },
        metadata: { processingTimeMs: Date.now() - startTime, model, searchQuery },
      });
    }

    // Step 4: AI arbitrage analysis
    const sourceYesPrice = 50; // placeholder — real impl fetches from platform
    const userPrompt = `Source platform: ${sourcePlatform}
Source market: ${identifier}
Source YES price: ${sourceYesPrice}%

Search results from ${searchPlatform}:
${JSON.stringify(searchResults.slice(0, 20), null, 2)}

Find if any of these match the source market and calculate arbitrage.`;

    const analysis = await callAI(userPrompt, ARBITRAGE_SYSTEM_PROMPT, "json_object", model);
    const parsed = JSON.parse(analysis.text);

    return res.json({
      success: true,
      data: parsed,
      metadata: {
        requestId: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        processingTimeMs: Date.now() - startTime,
        model: analysis.model,
        tokensUsed: analysis.usage.total_tokens,
        sourceMarket: sourcePlatform,
        searchedMarket: searchPlatform,
        searchQuery,
      },
    });
  } catch (error) {
    console.error("arbitrage error:", error);
    return res.status(500).json({ success: false, error: String(error) });
  }
});

export default router;
