/**
 * Express route: POST /api/analyze
 * AI-powered event market analysis — supports Grok, OpenAI, and Gemini.
 * Returns the same MarketAnalysis schema used by the Supabase edge function
 * so the terminal UI can consume responses from either backend.
 */
import { Router, Request, Response } from "express";
import { callAI } from "../ai/router";

const router = Router();

type ToolType = "x_search" | "web_search";

function buildPrompts(
  markets: unknown[],
  eventIdentifier: string,
  question: string,
  pmType: string,
  tools?: ToolType[],
  userCommand?: string,
): { systemPrompt: string; userPrompt: string } {
  const hasXSearch = tools?.includes("x_search");
  const hasWebSearch = tools?.includes("web_search");

  let toolInstructions = "";
  if (hasXSearch) {
    toolInstructions +=
      "\nYou have access to X (Twitter) search. Use it to find the latest posts, news, and sentiment about this event. When you find relevant posts that back your analysis, include their URLs in your response.";
  }
  if (hasWebSearch) {
    toolInstructions +=
      "\nYou have access to web search. Use it to find the latest news articles, reports, and analysis about this event. When you find relevant resources that back your analysis, include their URLs in your response.";
  }

  const systemPrompt =
    `You are a financial analyst expert in the field of prediction markets (posted on ${pmType}) that understands the latest news, events, and market trends.\n` +
    `Your expertise lies in deeply analyzing prediction markets for a specific event, identifying if there's alpha (mispricing) opportunity, and providing a clear recommendation on which side (YES or NO) is more likely to win based on your analysis.\n` +
    `You always provide a short analysisSummary of your findings, less than 270 characters, that is very conversational and understandable by a non-expert who just wants to understand which side it might make more sense to buy into.\n` +
    toolInstructions +
    (userCommand
      ? `\n### VERY IMPORTANT: The user has provided specific commands that you MUST prioritize over everything else:\n${userCommand}`
      : "") +
    `\nYour output is ALWAYS in JSON format and you are VERY STRICT about it. You must return valid JSON that matches the exact schema specified.`;

  const xSourcesField = hasXSearch
    ? `,\n  "xSources": ["string - X/Twitter post URLs backing your analysis"]`
    : "";
  const webSourcesField = hasWebSearch
    ? `,\n  "webSources": ["string - web URLs backing your analysis"]`
    : "";

  const userPrompt =
    `# Task: Deep Analysis of an Event's Prediction Markets\n\n` +
    `You are analyzing all markets for a specific event (${eventIdentifier}) to determine:\n` +
    `1. Whether there is an alpha (mispricing) opportunity in any of the markets\n` +
    `2. Which market has the best alpha opportunity (if any)\n` +
    `3. Which side (YES or NO) is more likely to win for that market\n` +
    `4. Your confidence level in this assessment\n\n` +
    `## User's query/input/question About This Event\n${question}\n\n` +
    `## Platform: ${pmType}\n\n` +
    `## Event Markets (${markets.length} market${markets.length !== 1 ? "s" : ""})\n\n` +
    `${JSON.stringify(markets, null, 2)}\n\n` +
    `## Output Format\n\n` +
    `Return your analysis as a JSON object with these exact fields:\n\n` +
    `{\n` +
    `  "event_ticker": "string - event ticker identifier",\n` +
    `  "ticker": "string - market ticker for the best opportunity",\n` +
    `  "title": "string - market title",\n` +
    `  "marketProbability": number (0-100),\n` +
    `  "estimatedActualProbability": number (0-100),\n` +
    `  "alphaOpportunity": number (positive = buy yes, negative = buy no),\n` +
    `  "hasAlpha": boolean,\n` +
    `  "predictedWinner": "YES" or "NO",\n` +
    `  "winnerConfidence": number (0-100),\n` +
    `  "recommendedAction": "BUY YES" or "BUY NO" or "NO TRADE",\n` +
    `  "reasoning": "string - detailed explanation",\n` +
    `  "confidence": number (0-100),\n` +
    `  "keyFactors": ["string"],\n` +
    `  "risks": ["string"],\n` +
    `  "questionAnswer": "string - direct answer to the user question",\n` +
    `  "analysisSummary": "string - brief summary under 270 characters"` +
    xSourcesField +
    webSourcesField +
    `\n}\n` +
    (userCommand
      ? `\n### VERY IMPORTANT: Prioritize the user commands below over everything else\n${userCommand}\n`
      : "") +
    `\nNow analyze these markets and provide your assessment in the exact JSON format above.`;

  return { systemPrompt, userPrompt };
}

router.post("/", async (req: Request, res: Response) => {
  const { markets, eventIdentifier, pmType, model, question, tools, userCommand } = req.body;

  if (!markets?.length) return res.status(400).json({ success: false, error: "Missing 'markets'" });
  if (!eventIdentifier) return res.status(400).json({ success: false, error: "Missing 'eventIdentifier'" });
  if (!pmType) return res.status(400).json({ success: false, error: "Missing 'pmType'" });
  if (!model) return res.status(400).json({ success: false, error: "Missing 'model'" });

  const defaultQuestion =
    "What is the best trading opportunity in this market? Analyze the probability and provide a recommendation.";
  const analysisQuestion = question || defaultQuestion;

  const { systemPrompt, userPrompt } = buildPrompts(
    markets,
    eventIdentifier,
    analysisQuestion,
    pmType,
    tools,
    userCommand,
  );

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
