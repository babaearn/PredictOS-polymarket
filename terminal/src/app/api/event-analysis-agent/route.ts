import { NextRequest, NextResponse } from "next/server";
import type { EventAnalysisAgentRequest, EventAnalysisAgentResponse } from "@/types/agentic";

/**
 * Server-side API route for event analysis.
 *
 * Routing priority:
 *  1. EXPRESS_API_URL — calls the deployed Express server (/api/analyze).
 *     Used when Supabase is not configured or when you want to use the
 *     Express server (which supports Gemini, Grok, OpenAI via API keys).
 *  2. SUPABASE_URL + SUPABASE_ANON_KEY — proxies to the Supabase Edge Function.
 */
export async function POST(request: NextRequest) {
  try {
    const body: EventAnalysisAgentRequest = await request.json();

    // Validate required fields
    if (!body.markets || !Array.isArray(body.markets) || body.markets.length === 0) {
      return NextResponse.json({ success: false, error: "Missing required field: markets" }, { status: 400 });
    }
    if (!body.eventIdentifier) {
      return NextResponse.json({ success: false, error: "Missing required field: eventIdentifier" }, { status: 400 });
    }
    if (!body.pmType) {
      return NextResponse.json({ success: false, error: "Missing required field: pmType" }, { status: 400 });
    }
    if (!body.model) {
      return NextResponse.json({ success: false, error: "Missing required field: model" }, { status: 400 });
    }

    const expressApiUrl = process.env.EXPRESS_API_URL;
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

    // ── Route 1: Express server ───────────────────────────────────────────────
    if (expressApiUrl) {
      const response = await fetch(`${expressApiUrl}/api/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          markets: body.markets,
          eventIdentifier: body.eventIdentifier,
          pmType: body.pmType,
          model: body.model,
          question: body.question,
          tools: body.tools,
          userCommand: body.userCommand,
        }),
      });

      const data: EventAnalysisAgentResponse = await response.json();
      return NextResponse.json(data, { status: response.status });
    }

    // ── Route 2: Supabase Edge Function ──────────────────────────────────────
    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json(
        { success: false, error: "Server configuration error: set EXPRESS_API_URL or Supabase credentials" },
        { status: 500 }
      );
    }

    const edgeFunctionUrl =
      process.env.SUPABASE_EDGE_FUNCTION_EVENT_ANALYSIS_AGENT ||
      `${supabaseUrl}/functions/v1/event-analysis-agent`;

    const response = await fetch(edgeFunctionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseAnonKey}`,
        apikey: supabaseAnonKey,
      },
      body: JSON.stringify({
        markets: body.markets,
        eventIdentifier: body.eventIdentifier,
        pmType: body.pmType,
        model: body.model,
        question: body.question,
        tools: body.tools,
        userCommand: body.userCommand,
      }),
    });

    const data: EventAnalysisAgentResponse = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Error in event-analysis-agent API route:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "An unexpected error occurred",
      },
      { status: 500 }
    );
  }
}
