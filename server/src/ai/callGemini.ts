/**
 * Gemini AI caller (Node.js / Express version)
 * Supports: gemini-2.5-flash, gemini-2.5-pro
 */

export interface GeminiResponseResult {
  model: string;
  text: string;
  usage: { input_tokens: number; output_tokens: number; total_tokens: number };
  status: "completed" | "failed";
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function callGemini(
  message: string,
  systemPrompt: string,
  responseFormat: "json_object" | "text",
  model: string = "gemini-2.5-flash",
  maxRetries: number = 3,
): Promise<GeminiResponseResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const payload = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: "user", parts: [{ text: message }] }],
    generationConfig: {
      ...(responseFormat === "json_object" && { responseMimeType: "application/json" }),
    },
  };

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
      }
      if (attempt < maxRetries) {
        await sleep(Math.min(1000 * Math.pow(2, attempt), 10000));
        continue;
      }
      throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
    }

    const raw = await response.json() as any;
    const text: string = raw.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    return {
      model,
      text,
      usage: {
        input_tokens: raw.usageMetadata?.promptTokenCount ?? 0,
        output_tokens: raw.usageMetadata?.candidatesTokenCount ?? 0,
        total_tokens: raw.usageMetadata?.totalTokenCount ?? 0,
      },
      status: "completed",
    };
  }

  throw new Error("Gemini: exhausted retries");
}

export function isGeminiModel(model: string): boolean {
  return model.startsWith("gemini-");
}
