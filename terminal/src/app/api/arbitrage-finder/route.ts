import { NextRequest, NextResponse } from "next/server";
import type { ArbitrageRequest, ArbitrageResponse } from "@/types/arbitrage";

/**
 * Server-side API route for finding cross-platform arbitrage.
 *
 * Routing priority:
 *  1. EXPRESS_API_URL — calls the deployed Express server (/api/arbitrage).
 *  2. SUPABASE_URL + SUPABASE_ANON_KEY — proxies to the Supabase Edge Function.
 */
export async function POST(request: NextRequest) {
  try {
    const body: ArbitrageRequest = await request.json();

    if (!body.url) {
      return NextResponse.json({ success: false, error: "Missing required field: url" }, { status: 400 });
    }
    if (!body.model) {
      return NextResponse.json({ success: false, error: "Missing required field: model" }, { status: 400 });
    }

    const expressApiUrl = process.env.EXPRESS_API_URL;
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

    // ── Route 1: Express server ───────────────────────────────────────────────
    if (expressApiUrl) {
      const response = await fetch(`${expressApiUrl}/api/arbitrage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: body.url, model: body.model }),
      });

      const data: ArbitrageResponse = await response.json();
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
      process.env.SUPABASE_EDGE_FUNCTION_ARBITRAGE_FINDER ||
      `${supabaseUrl}/functions/v1/arbitrage-finder`;

    const response = await fetch(edgeFunctionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseAnonKey}`,
        apikey: supabaseAnonKey,
      },
      body: JSON.stringify({ url: body.url, model: body.model }),
    });

    const data: ArbitrageResponse = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Error in arbitrage-finder API route:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
