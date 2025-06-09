/**
 * Centralized configuration management
 * Reads environment variables and provides typed access
 */

// Dynamic configuration getter to ensure env vars are read at runtime
export const getConfig = () => ({
  openai: {
    apiKey: process.env.OPENAI_API_KEY || "",
  },
  dataSources: {
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
  },
});

// Legacy static config for backward compatibility
export const config = getConfig();

// Helper function to check if OpenAI is available
/**
 * Checks if OpenAI API key is configured and available
 *
 * @returns True if OpenAI API key is present, false otherwise
 */
export function isOpenAIAvailable(): boolean {
  return Boolean(getConfig().openai.apiKey);
}

// Validation function to ensure required config is present
/**
 * Validates configuration settings and logs warnings for missing required values
 *
 * @param options - Validation options
 * @param options.skipDataSourceValidation - Skip data source configuration validation
 */
export function validateConfig(options?: { skipDataSourceValidation?: boolean }) {
  const dynamicConfig = getConfig();
  const issues: string[] = [];
  const opts = {
    skipDataSourceValidation: false,
    ...options,
  };

  if (!dynamicConfig.openai.apiKey) {
    issues.push("Warning: OPENAI_API_KEY is not set - some features may be limited");
  }

  if (!opts.skipDataSourceValidation) {
    if (
      dynamicConfig.dataSources.perplexity.enabled &&
      !dynamicConfig.dataSources.perplexity.apiKey
    ) {
      issues.push("Warning: PERPLEXITY_API_KEY is required when Perplexity is enabled");
    }

    if (
      dynamicConfig.dataSources.xTwitter.enabled &&
      (!dynamicConfig.dataSources.xTwitter.apiKey ||
        !dynamicConfig.dataSources.xTwitter.bearerToken)
    ) {
      issues.push(
        "Warning: X_TWITTER_API_KEY and X_TWITTER_BEARER_TOKEN are required when X/Twitter is enabled",
      );
    }
  }

  if (issues.length > 0) {
    // Log warnings but don't throw
    console.warn("Configuration warnings:\n" + issues.join("\n"));
  }
}
