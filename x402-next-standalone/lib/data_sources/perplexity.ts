/**
 * Perplexity API Data Source
 * Uses AI SDK to fetch real-time web search results
 */

import { generateText } from "ai";
import { perplexity } from "@ai-sdk/perplexity";
import {
  IDataSource,
  DataSourceResult,
  DataSourceOptions,
  createSuccessResult,
  createErrorResult,
} from "./types";
import { getConfig } from "../config";

/**
 * Perplexity API Data Source implementation
 */
export class PerplexityDataSource implements IDataSource {
  name = "perplexity";
  description =
    "Web search. Should be used for any queries that require real-time information, historical facts/data or scientific information.";

  /**
   * Fetches data from Perplexity API using AI SDK
   *
   * @param prompt - The search query prompt
   * @param _ - Optional parameters (unused by this data source)
   * @returns Promise resolving to data source result
   */
  async fetch(prompt: string, _?: DataSourceOptions): Promise<DataSourceResult> {
    try {
      console.log("Using Perplexity for web search");
      const { text, sources } = await generateText({
        model: perplexity(getConfig().models.perplexity),
        prompt: `Timestamp: ${new Date().toISOString()}\n ${prompt}`,
        providerOptions: {
          perplexity: {
            return_images: false,
            //search_recency_filter: "week",
            search_context_size: "high",
          },
        },
      });
      console.log("Perplexity response:", text);

      const sourcesArray = sources?.map(source => source.url).filter(Boolean) || [];
      return createSuccessResult(this.name, text, sourcesArray);
    } catch (error) {
      console.error(`Perplexity API error:`, error);
      return createErrorResult(
        this.name,
        `Perplexity API error: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }
}
