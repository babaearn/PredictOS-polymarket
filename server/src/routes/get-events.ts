import { Router, Request, Response } from "express";

const router = Router();

const GAMMA_API_URL = "https://gamma-api.polymarket.com";
const DFLOW_API_BASE = "https://a.prediction-markets-api.dflow.net/api/v1";

function detectPmType(url: string): "Kalshi" | "Polymarket" | null {
  const lower = url.toLowerCase();
  if (lower.includes("jup.ag/prediction") || lower.includes("kalshi")) return "Kalshi";
  if (lower.includes("polymarket")) return "Polymarket";
  return null;
}

function extractSlugOrTicker(url: string, pmType: "Kalshi" | "Polymarket"): string | null {
  const clean = url.split("?")[0];
  const parts = clean.split("/").filter(Boolean);
  const last = parts[parts.length - 1];
  if (!last) return null;
  return pmType === "Kalshi" ? last.toUpperCase() : last;
}

async function fetchPolymarketMarkets(slug: string) {
  const endpoints = [
    `${GAMMA_API_URL}/events?slug=${encodeURIComponent(slug)}`,
    `${GAMMA_API_URL}/events/${encodeURIComponent(slug)}`,
  ];
  for (const endpoint of endpoints) {
    const res = await fetch(endpoint);
    if (!res.ok) continue;
    const data = await res.json() as any;
    const event = Array.isArray(data) ? data[0] : data;
    if (event?.markets?.length) return { eventId: String(event.id ?? ""), markets: event.markets };
  }
  return { eventId: null, markets: [] };
}

async function fetchKalshiMarkets(ticker: string) {
  const dflowKey = process.env.DFLOW_API_KEY;
  const res = await fetch(`${DFLOW_API_BASE}/event/${ticker}?withNestedMarkets=true`, {
    headers: dflowKey ? { Authorization: `Bearer ${dflowKey}` } : {},
  });
  if (!res.ok) throw new Error(`DFlow error: ${res.status}`);
  const data = await res.json();
  return data.markets ?? [];
}

router.post("/", async (req: Request, res: Response) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ success: false, error: "Missing 'url'" });

  const pmType = detectPmType(url);
  if (!pmType) return res.status(400).json({ success: false, error: "Unrecognized URL — use Kalshi, Polymarket, or Jupiter" });

  const identifier = extractSlugOrTicker(url, pmType);
  if (!identifier) return res.status(400).json({ success: false, error: "Could not extract slug/ticker from URL" });

  try {
    let markets: unknown[];
    let eventId: string | undefined;

    if (pmType === "Kalshi") {
      markets = await fetchKalshiMarkets(identifier);
    } else {
      const result = await fetchPolymarketMarkets(identifier);
      markets = result.markets;
      eventId = result.eventId ?? undefined;
    }

    if (!markets.length) {
      return res.status(404).json({ success: false, error: `No markets found for '${identifier}'` });
    }

    return res.json({
      success: true,
      eventIdentifier: identifier,
      eventId,
      pmType,
      markets,
      marketsCount: markets.length,
    });
  } catch (error) {
    console.error("get-events error:", error);
    return res.status(500).json({ success: false, error: String(error) });
  }
});

export default router;
