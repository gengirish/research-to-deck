import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { env } from "./env";

const AI_GATEWAY_BASE_URL = "https://ai-gateway.vercel.sh";

let client: Anthropic | undefined;
function getClient(): Anthropic {
  const gatewayKey = env.aiGatewayApiKey;
  client ??= gatewayKey ? new Anthropic({ apiKey: gatewayKey, baseURL: AI_GATEWAY_BASE_URL }) : new Anthropic();
  return client;
}

/** The gateway namespaces models by provider; the Anthropic API does not. */
function modelId(): string {
  const model = env.claudeModel;
  if (!env.aiGatewayApiKey || model.includes("/")) return model;
  return `anthropic/${model}`;
}

/**
 * One structured-output call to Claude. Returns the schema-validated object or throws
 * with a clear reason (refusal, truncation, or unparseable output).
 */
export async function claudeJson<S extends z.ZodType>(opts: {
  system: string;
  user: string;
  schema: S;
  effort: "low" | "medium" | "high";
  maxTokens?: number;
}): Promise<z.infer<S>> {
  const response = await getClient().messages.parse({
    model: modelId(),
    max_tokens: opts.maxTokens ?? 16_000,
    system: opts.system,
    messages: [{ role: "user", content: opts.user }],
    output_config: { effort: opts.effort, format: zodOutputFormat(opts.schema) },
  });

  if (response.stop_reason === "refusal") throw new Error("Claude declined to synthesize this topic");
  if (response.stop_reason === "max_tokens") throw new Error("Claude output was truncated (max_tokens reached)");
  if (response.parsed_output == null) throw new Error("Claude returned output that did not match the schema");
  return response.parsed_output as z.infer<S>;
}
