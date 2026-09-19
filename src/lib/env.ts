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
  get semanticScholarApiKey(): string | undefined {
    return process.env.SEMANTIC_SCHOLAR_API_KEY || undefined;
  },
  get claudeModel() {
    return process.env.CLAUDE_MODEL || "claude-sonnet-5";
  },
  get pythonBin() {
    return process.env.PYTHON_BIN || "python";
  },
};
