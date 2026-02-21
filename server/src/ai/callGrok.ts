/**
 * Grok AI caller (Node.js / Express version)
 */

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface GrokResponseResult {
  model: string;
  text: string;
  usage: { total_tokens: number };
}

export async function callGrok(
  message: string,
  systemPrompt: string,
  responseFormat: "json_object" | "text",
  model: string = "grok-4-1-fast-reasoning",
  maxRetries: number = 3,
): Promise<GrokResponseResult> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) throw new Error("XAI_API_KEY is not set");

  const payload = {
    model,
    input: [
      { role: "system", content: systemPrompt },
      { role: "user", content: message },
    ],
    response_format: { type: responseFormat },
  };

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch("https://api.x.ai/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        throw new Error(`Grok API error: ${response.status} - ${errorText}`);
      }
      if (attempt < maxRetries) {
        await sleep(Math.min(1000 * Math.pow(2, attempt), 10000));
        continue;
      }
      throw new Error(`Grok API error: ${response.status} - ${errorText}`);
    }

    const raw = await response.json() as any;
    const text: string =
      raw.output
        ?.filter((o: { type: string }) => o.type === "message")
        ?.flatMap((o: { content: { text: string }[] }) => o.content)
        ?.map((c: { text: string }) => c.text)
        ?.join("\n") ?? "";

    return { model: raw.model ?? model, text, usage: { total_tokens: raw.usage?.total_tokens ?? 0 } };
  }

  throw new Error("Grok: exhausted retries");
}

export function isGrokModel(model: string): boolean {
  return model.startsWith("grok-");
}
