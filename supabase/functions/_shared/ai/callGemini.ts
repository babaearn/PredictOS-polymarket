/**
 * Gemini AI caller for Supabase Edge Functions (Deno runtime)
 * Supports: gemini-2.0-flash, gemini-2.5-pro
 * Get your API key free at: https://aistudio.google.com
 */

export interface GeminiResponseResult {
  model: string;
  text: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  };
  status: "completed" | "failed";
}

function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes("connection") ||
      message.includes("tls") ||
      message.includes("timeout") ||
      message.includes("eof") ||
      message.includes("network") ||
      message.includes("fetch failed")
    );
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number = 120000,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Request timeout after ${timeoutMs}ms`);
    }
    throw error;
  }
}

/**
 * Call Gemini AI with the generateContent REST API
 *
 * @param message User message to send
 * @param systemPrompt System prompt for the AI
 * @param responseFormat "json_object" for JSON output, "text" for plain text
 * @param model Gemini model: "gemini-2.0-flash" | "gemini-2.5-pro"
 * @param maxRetries Maximum number of retries on failure
 * @returns Normalized GeminiResponseResult
 */
export async function callGemini(
  message: string,
  systemPrompt: string,
  responseFormat: "json_object" | "text",
  model: string = "gemini-2.0-flash",
  maxRetries: number = 3,
): Promise<GeminiResponseResult> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is not set");
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const payload = {
    systemInstruction: {
      parts: [{ text: systemPrompt }],
    },
    contents: [
      {
        role: "user",
        parts: [{ text: message }],
      },
    ],
    generationConfig: {
      ...(responseFormat === "json_object" && { responseMimeType: "application/json" }),
    },
  };

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetchWithTimeout(
        url,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
        120000,
      );

      if (!response.ok) {
        const errorText = await response.text();
        const error = new Error(
          `Gemini API error: ${response.status} ${response.statusText} - ${errorText}`,
        );
        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          throw error;
        }
        lastError = error;
        if (attempt < maxRetries) {
          const backoffMs = Math.min(1000 * Math.pow(2, attempt), 10000);
          console.warn(`Gemini API error (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${backoffMs}ms...`);
          await sleep(backoffMs);
          continue;
        }
        throw error;
      }

      const raw = await response.json();

      const text: string =
        raw.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

      const usage = {
        input_tokens: raw.usageMetadata?.promptTokenCount ?? 0,
        output_tokens: raw.usageMetadata?.candidatesTokenCount ?? 0,
        total_tokens: raw.usageMetadata?.totalTokenCount ?? 0,
      };

      return { model, text, usage, status: "completed" };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (!isRetryableError(error) && attempt === 0) throw lastError;
      if (attempt >= maxRetries) throw lastError;
      const backoffMs = Math.min(1000 * Math.pow(2, attempt), 10000);
      console.warn(
        `Network error (attempt ${attempt + 1}/${maxRetries + 1}): ${lastError.message}. Retrying in ${backoffMs}ms...`,
      );
      await sleep(backoffMs);
    }
  }

  throw lastError || new Error("Unknown error occurred");
}
