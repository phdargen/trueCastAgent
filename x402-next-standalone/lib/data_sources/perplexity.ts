/**
 * Perplexity API Data Source
 * Uses AI SDK to fetch real-time web search results
 */

import { generateText } from "ai";
import { perplexity } from "@ai-sdk/perplexity";
import { IDataSource, DataSourceResult, createSuccessResult, createErrorResult } from "./types";

/**
 * Perplexity API Data Source implementation
 */
export class PerplexityDataSource implements IDataSource {
  name = "perplexity";
  description = "Web search and real-time information from across the internet";

  /**
   * Fetches data from Perplexity API using AI SDK
   *
   * @param prompt - The search query prompt
   * @returns Promise resolving to data source result
   */
  async fetch(prompt: string): Promise<DataSourceResult> {
    try {
      console.log("Using Perplexity for web search");
      const { text, sources } = await generateText({
        model: perplexity("sonar-pro"),
        prompt: `Search for current information about: ${prompt}`,
        providerOptions: {
          perplexity: {
            return_images: false,
            search_recency_filter: "week",
            search_context_size: "high",
          },
        },
      });

      const data = {
        query: prompt,
        results: [
          {
            title: "Perplexity Web Search Results",
            content: text,
            url: sources?.[0]?.url || "https://perplexity.ai",
            timestamp: new Date().toISOString(),
          },
        ],
        sources: sources || [],
        metadata: {
          source: "perplexity",
          totalResults: sources?.length || 1,
          searchRecency: "week",
          contextSize: "high",
        },
      };

      return createSuccessResult(this.name, data);
    } catch (error) {
      console.error(`Perplexity API error:`, error);
      return createErrorResult(
        this.name,
        `Perplexity API error: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }
}
