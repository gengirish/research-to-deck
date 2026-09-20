function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const env = {
  get databaseUrl() {
    return required("DATABASE_URL");
  },
  get redisUrl() {
    return required("REDIS_URL");
  },
  get voyageApiKey() {
    return required("VOYAGE_API_KEY");
  },
  /** Paper search provider. OpenAlex is the default: no API key, 10 req/s polite pool. */
  get paperSource(): "openalex" | "semanticscholar" {
    const raw = (process.env.PAPER_SOURCE || "openalex").trim().toLowerCase();
    if (raw === "semanticscholar" || raw === "semantic_scholar" || raw === "s2") return "semanticscholar";
    if (raw === "openalex") return "openalex";
    throw new Error(`Invalid PAPER_SOURCE: ${raw} (expected "openalex" or "semanticscholar")`);
  },
  /** Contact address sent to OpenAlex as `mailto`. Not auth - it opts us into the polite pool. */
  get openAlexMailto(): string | undefined {
    return process.env.OPENALEX_MAILTO || undefined;
  },
  /** Only used when PAPER_SOURCE=semanticscholar. */
  get semanticScholarApiKey(): string | undefined {
    return process.env.SEMANTIC_SCHOLAR_API_KEY || undefined;
  },
  get claudeModel() {
    return process.env.CLAUDE_MODEL || "claude-sonnet-5";
  },
  /**
   * Vercel AI Gateway key. When set, Claude calls route through the gateway and are
   * billed to Vercel instead of Anthropic; `ANTHROPIC_API_KEY` is then unnecessary.
   */
  get aiGatewayApiKey(): string | undefined {
    return process.env.AI_GATEWAY_API_KEY || undefined;
  },
  get pythonBin() {
    return process.env.PYTHON_BIN || "python";
  },

  // --- AgentMail (optional: email delivery is skipped entirely when unset) ---
  get agentMailApiKey(): string | undefined {
    return process.env.AGENTMAIL_API_KEY || undefined;
  },
  /** Domain the system inbox lives on. AgentMail defaults to agentmail.to for unverified accounts. */
  get agentMailDomain(): string | undefined {
    return process.env.AGENTMAIL_DOMAIN || undefined;
  },
  get agentMailInboxUsername(): string {
    return process.env.AGENTMAIL_INBOX_USERNAME || "decks";
  },
  /** Use an existing inbox verbatim instead of creating one (an address, e.g. decks@example.com). */
  get agentMailInboxId(): string | undefined {
    return process.env.AGENTMAIL_INBOX_ID || undefined;
  },
  /** Svix signing secret (whsec_...) for POST /api/webhooks/agentmail. */
  get agentMailWebhookSecret(): string | undefined {
    return process.env.AGENTMAIL_WEBHOOK_SECRET || undefined;
  },
  /** Public origin used to build download links inside emails. */
  get appBaseUrl(): string {
    return (process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
  },
};
