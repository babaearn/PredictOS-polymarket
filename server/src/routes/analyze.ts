/**
 * Express route: POST /api/analyze
 * AI-powered event market analysis (ported from event-analysis-agent edge function)
 */
import { Router, Request, Response } from "express";
import { callAI } from "../ai/router";

const router = Router();

function buildSystemPrompt(pmType: string): string {
  return `You are an expert prediction market analyst specializing in ${pmType} markets.
Analyze the provided market data and return a JSON object with this exact structure:
{
  "ticker": "market ticker or identifier",
  "recommendedAction": "BUY_YES" | "BUY_NO" | "HOLD" | "AVOID",
  "confidence": 0-100,
  "estimatedProbability": 0-100,
  "reasoning": "detailed analysis",
  "keyFactors": ["factor1", "factor2"],
  "risks": ["risk1", "risk2"],
  "timeHorizon": "short/medium/long"
}`;
}

router.post("/", async (req: Request, res: Response) => {
  const { markets, eventIdentifier, pmType, model, question } = req.body;

  if (!markets?.length) return res.status(400).json({ success: false, error: "Missing 'markets'" });
  if (!eventIdentifier) return res.status(400).json({ success: false, error: "Missing 'eventIdentifier'" });
  if (!pmType) return res.status(400).json({ success: false, error: "Missing 'pmType'" });
  if (!model) return res.status(400).json({ success: false, error: "Missing 'model'" });

  const systemPrompt = buildSystemPrompt(pmType);
  const userPrompt = `Event: ${eventIdentifier}\nMarkets: ${JSON.stringify(markets, null, 2)}\n\nQuestion: ${question || "What is the best trading opportunity?"}`;

  try {
    const startTime = Date.now();
    const result = await callAI(userPrompt, systemPrompt, "json_object", model);
    const analysis = JSON.parse(result.text);

    return res.json({
      success: true,
      data: analysis,
      metadata: {
        requestId: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        processingTimeMs: Date.now() - startTime,
        model: result.model,
        tokensUsed: result.usage.total_tokens,
      },
    });
  } catch (error) {
    console.error("analyze error:", error);
    return res.status(500).json({ success: false, error: String(error) });
  }
});

export default router;
