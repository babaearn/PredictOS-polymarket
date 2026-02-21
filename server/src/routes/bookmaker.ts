/**
 * Express route: POST /api/bookmaker
 * Aggregates multiple agent analyses into a consolidated recommendation
 */
import { Router, Request, Response } from "express";
import { callAI } from "../ai/router";

const router = Router();

const BOOKMAKER_SYSTEM_PROMPT = `You are a master bookmaker and prediction market strategist.
You receive multiple AI agent analyses of the same market and must synthesize them into one final recommendation.
Return JSON with this structure:
{
  "recommendedAction": "BUY_YES" | "BUY_NO" | "HOLD" | "AVOID",
  "confidence": 0-100,
  "estimatedProbability": 0-100,
  "agentConsensus": {
    "agreementLevel": "high" | "medium" | "low",
    "majorityAction": "...",
    "dissenting": []
  },
  "synthesizedReasoning": "...",
  "keyFactors": [],
  "risks": [],
  "finalVerdict": "one sentence summary"
}`;

router.post("/", async (req: Request, res: Response) => {
  const { analyses, eventIdentifier, pmType, model } = req.body;

  if (!analyses?.length || analyses.length < 2) {
    return res.status(400).json({ success: false, error: "Need at least 2 analyses to aggregate" });
  }
  if (!eventIdentifier) return res.status(400).json({ success: false, error: "Missing 'eventIdentifier'" });
  if (!model) return res.status(400).json({ success: false, error: "Missing 'model'" });

  const userPrompt = `Event: ${eventIdentifier} (${pmType})

Agent analyses:
${JSON.stringify(analyses, null, 2)}

Synthesize these analyses into one final recommendation.`;

  try {
    const startTime = Date.now();
    const result = await callAI(userPrompt, BOOKMAKER_SYSTEM_PROMPT, "json_object", model);
    const aggregated = JSON.parse(result.text);

    return res.json({
      success: true,
      data: aggregated,
      metadata: {
        requestId: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        processingTimeMs: Date.now() - startTime,
        model: result.model,
        tokensUsed: result.usage.total_tokens,
        agentsAggregated: analyses.length,
      },
    });
  } catch (error) {
    console.error("bookmaker error:", error);
    return res.status(500).json({ success: false, error: String(error) });
  }
});

export default router;
