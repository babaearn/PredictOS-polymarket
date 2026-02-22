/**
 * Express route: POST /api/bookmaker
 * Aggregates multiple agent analyses (and optional x402 PayAI results) into
 * a consolidated AggregatedAnalysis — same schema as the Supabase edge function.
 */
import { Router, Request, Response } from "express";
import { callAI } from "../ai/router";

const router = Router();

interface AgentAnalysisInput {
  agentId: string;
  model: string;
  analysis: Record<string, unknown>;
}

interface X402ResultInput {
  agentId: string;
  seller: string;
  query: string;
  response: string;
}

function buildBookmakerPrompts(
  analyses: AgentAnalysisInput[],
  x402Results: X402ResultInput[],
  eventIdentifier: string,
  pmType: string,
): { systemPrompt: string; userPrompt: string } {
  const systemPrompt =
    "You are a senior financial analyst who specializes in synthesizing multiple expert opinions on prediction markets.\n" +
    "Your task is to combine and consolidate analyses from multiple AI agents and external data sources into a single authoritative assessment.\n" +
    "You weigh each agent's analysis based on their confidence levels and consistency of reasoning.\n" +
    "Your output is ALWAYS in JSON format and you are VERY STRICT about it. You must return valid JSON that matches the exact schema specified.";

  const analysesText =
    analyses.length > 0
      ? analyses
          .map(
            (a, i) =>
              `### Agent ${i + 1}: ${a.model}\n` +
              Object.entries(a.analysis)
                .map(([k, v]) => `- **${k}**: ${JSON.stringify(v)}`)
                .join("\n"),
          )
          .join("\n\n")
      : "(No AI agent analyses provided)";

  const x402Text =
    x402Results.length > 0
      ? x402Results
          .map(
            (r, i) =>
              `### PayAI Data Source ${i + 1}: ${r.seller}\n- **Query**: ${r.query}\n- **Response** (truncated):\n\`\`\`\n${r.response}\n\`\`\``,
          )
          .join("\n\n")
      : "";

  const userPrompt =
    `# Task: Aggregate Multiple Data Sources\n\n` +
    `You are consolidating data for the ${pmType} event: ${eventIdentifier}\n\n` +
    `## Individual Agent Analyses\n${analysesText}\n` +
    (x402Text ? `\n## PayAI External Data Sources\n${x402Text}\n` : "") +
    `\n## Output Format\n\n` +
    `Return consolidated analysis as a JSON object:\n\n` +
    `{\n` +
    `  "event_ticker": "string",\n` +
    `  "ticker": "string",\n` +
    `  "title": "string",\n` +
    `  "marketProbability": number (0-100),\n` +
    `  "estimatedActualProbability": number (0-100),\n` +
    `  "alphaOpportunity": number,\n` +
    `  "hasAlpha": boolean,\n` +
    `  "predictedWinner": "YES" or "NO",\n` +
    `  "winnerConfidence": number (0-100),\n` +
    `  "recommendedAction": "BUY YES" or "BUY NO" or "NO TRADE",\n` +
    `  "reasoning": "string - synthesized reasoning noting agreements/disagreements",\n` +
    `  "confidence": number (0-100),\n` +
    `  "keyFactors": ["string"],\n` +
    `  "risks": ["string"],\n` +
    `  "questionAnswer": "string",\n` +
    `  "analysisSummary": "string under 270 characters",\n` +
    `  "agentConsensus": {\n` +
    `    "agreementLevel": "high" | "medium" | "low",\n` +
    `    "majorityRecommendation": "string",\n` +
    `    "dissenting": ["string"]\n` +
    `  }\n` +
    `}\n\n` +
    `Now consolidate all sources and return the JSON above.`;

  return { systemPrompt, userPrompt };
}

router.post("/", async (req: Request, res: Response) => {
  const { analyses, x402Results, eventIdentifier, pmType, model } = req.body;

  const analysesArr: AgentAnalysisInput[] = analyses || [];
  const x402Arr: X402ResultInput[] = x402Results || [];
  const totalSources = analysesArr.length + x402Arr.length;

  if (totalSources < 2) {
    return res.status(400).json({
      success: false,
      error: `Need at least 2 data sources to aggregate (got ${analysesArr.length} analyses + ${x402Arr.length} PayAI results)`,
    });
  }
  if (!eventIdentifier) return res.status(400).json({ success: false, error: "Missing 'eventIdentifier'" });
  if (!model) return res.status(400).json({ success: false, error: "Missing 'model'" });

  const { systemPrompt, userPrompt } = buildBookmakerPrompts(analysesArr, x402Arr, eventIdentifier, pmType || "");

  try {
    const startTime = Date.now();
    const result = await callAI(userPrompt, systemPrompt, "json_object", model);
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
        agentsAggregated: totalSources,
      },
    });
  } catch (error) {
    console.error("bookmaker error:", error);
    return res.status(500).json({ success: false, error: String(error) });
  }
});

export default router;
