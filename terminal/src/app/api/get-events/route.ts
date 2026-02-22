import { NextRequest, NextResponse } from "next/server";
import type { GetEventsRequest, GetEventsResponse } from "@/types/agentic";

/**
 * Server-side API route for fetching prediction market event data.
 *
 * Routing priority:
 *  1. EXPRESS_API_URL — calls the deployed Express server (/api/get-events).
 *  2. SUPABASE_URL + SUPABASE_ANON_KEY — proxies to the Supabase Edge Function.
 */
export async function POST(request: NextRequest) {
  try {
    const body: GetEventsRequest = await request.json();

    if (!body.url) {
      return NextResponse.json({ success: false, error: "Missing required field: url" }, { status: 400 });
    }

    // Detect urlSource from the URL (used by the UI for Jupiter-specific behaviour)
    const lowerUrl = body.url.toLowerCase();
    const isJupiter = lowerUrl.includes("jup.ag/prediction");
    const isKalshi = lowerUrl.includes("kalshi");
    const urlSource = isJupiter ? "jupiter" : isKalshi ? "kalshi" : "polymarket";

    const expressApiUrl = process.env.EXPRESS_API_URL;
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

    // ── Route 1: Express server ───────────────────────────────────────────────
    if (expressApiUrl) {
      const response = await fetch(`${expressApiUrl}/api/get-events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: body.url }),
      });

      const data = await response.json();
      // Inject urlSource since the Express server doesn't track wrapper origins
      return NextResponse.json({ ...data, urlSource } as GetEventsResponse, { status: response.status });
    }

    // ── Route 2: Supabase Edge Function ──────────────────────────────────────
    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json(
        { success: false, error: "Server configuration error: set EXPRESS_API_URL or Supabase credentials" },
        { status: 500 }
      );
    }

    const dataProvider = isKalshi || isJupiter ? "dflow" : "dome";
    const edgeFunctionUrl =
      process.env.SUPABASE_EDGE_FUNCTION_GET_EVENTS ||
      `${supabaseUrl}/functions/v1/get-events`;

    const response = await fetch(edgeFunctionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseAnonKey}`,
        apikey: supabaseAnonKey,
      },
      body: JSON.stringify({ url: body.url, dataProvider }),
    });

    const data: GetEventsResponse = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Error in get-events API route:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
