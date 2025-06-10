/**
 * Centralized configuration management
 * Reads environment variables and provides typed access
 */

// Dynamic configuration getter to ensure env vars are read at runtime
export const getConfig = () => ({
  openai: {
    apiKey: process.env.OPENAI_API_KEY || "",
  },
  models: {
    decisionMaker: process.env.DECISION_MAKER_MODEL || "gpt-4o",
    orchestrator: process.env.ORCHESTRATOR_MODEL || "gpt-4o-mini",
    agentkit: process.env.AGENTKIT_MODEL || "gpt-4o-mini",
    perplexity: process.env.PERPLEXITY_MODEL || "sonar-pro",
    google: process.env.GOOGLE_MODEL || "gemini-2.0-flash",
  },
  dataSources: {
    pyth: {
      enabled: process.env.DATASOURCE_PYTH_ENABLED === "true",
    },
    defillama: {
      enabled: process.env.DATASOURCE_DEFILLAMA_ENABLED === "true",
    },
    perplexity: {
      enabled: process.env.DATASOURCE_PERPLEXITY_ENABLED === "true",
      apiKey: process.env.PERPLEXITY_API_KEY || "",
    },
    xTwitter: {
      enabled: process.env.DATASOURCE_X_TWITTER_ENABLED === "true",
      apiKey: process.env.X_TWITTER_API_KEY || "",
      apiSecret: process.env.X_TWITTER_API_SECRET || "",
      bearerToken: process.env.X_TWITTER_BEARER_TOKEN || "",
    },
    truemarkets: {
      enabled: process.env.DATASOURCE_TRUEMARKETS_ENABLED === "true",
      redisUrl: process.env.REDIS_URL || "",
    },
  },
});

// Legacy static config for backward compatibility
export const config = getConfig();

// Validation function to ensure required config is present
/**
 * Validates configuration settings and logs warnings for missing required values
 */
export function validateConfig() {
  const dynamicConfig = getConfig();
  const issues: string[] = [];

  if (!dynamicConfig.openai.apiKey) {
    issues.push("Warning: OPENAI_API_KEY is not set - some features may be limited");
  }

  if (
    dynamicConfig.dataSources.perplexity.enabled &&
    !dynamicConfig.dataSources.perplexity.apiKey
  ) {
    issues.push("Warning: PERPLEXITY_API_KEY is required when Perplexity is enabled");
  }

  if (
    dynamicConfig.dataSources.xTwitter.enabled &&
    (!dynamicConfig.dataSources.xTwitter.apiKey || !dynamicConfig.dataSources.xTwitter.bearerToken)
  ) {
    issues.push(
      "Warning: X_TWITTER_API_KEY and X_TWITTER_BEARER_TOKEN are required when X/Twitter is enabled",
    );
  }

  if (dynamicConfig.dataSources.truemarkets.enabled && !process.env.REDIS_URL) {
    issues.push("Warning: REDIS_URL is required when TrueMarkets is enabled");
  }

  if (issues.length > 0) {
    // Log warnings but don't throw
    console.warn("Configuration warnings:\n" + issues.join("\n"));
  }
}
