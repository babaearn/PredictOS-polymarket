/**
 * AI provider router — picks the right caller based on model name
 */
import { callGemini, isGeminiModel } from "./callGemini";
import { callGrok } from "./callGrok";
import { callOpenAI, isOpenAIModel } from "./callOpenAI";

export interface AIResult {
  model: string;
  text: string;
  usage: { total_tokens: number };
}

export async function callAI(
  message: string,
  systemPrompt: string,
  responseFormat: "json_object" | "text",
  model: string,
  maxRetries: number = 3,
): Promise<AIResult> {
  if (isGeminiModel(model)) {
    const r = await callGemini(message, systemPrompt, responseFormat, model, maxRetries);
    return { model: r.model, text: r.text, usage: { total_tokens: r.usage.total_tokens } };
  }
  if (isOpenAIModel(model)) {
    return callOpenAI(message, systemPrompt, responseFormat, model, maxRetries);
  }
  return callGrok(message, systemPrompt, responseFormat, model, maxRetries);
}
