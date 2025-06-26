/**
 * Tavily API Data Source
 * Uses Tavily SDK to fetch real-time web search results
 */

import { tavily } from "@tavily/core";
import {
  IDataSource,
  DataSourceResult,
  DataSourceOptions,
  createSuccessResult,
  createErrorResult,
} from "./types";
import { getConfig } from "../config";

/**
 * Tavily API Data Source implementation
 */
export class TavilyDataSource implements IDataSource {
  name = "tavily";
  description =
    "Web search using Tavily. Should be used for any queries that require real-time information, current events, or comprehensive web research. Use for all queries except GREETINGS.";

  /**
   * Fetches data from Tavily API
   *
   * @param prompt - The search query prompt
   * @param _ - Optional parameters (unused by this data source)
   * @returns Promise resolving to data source result
   */
  async fetch(prompt: string, _?: DataSourceOptions): Promise<DataSourceResult> {
    try {
      console.log("Using Tavily for web search");

      const config = getConfig();
      const tvly = tavily({ apiKey: config.dataSources.tavily.apiKey });

      const searchPrompt = `Timestamp: ${new Date().toISOString()}\n ${prompt}`;

      const response = await tvly.search(searchPrompt, {
        includeAnswer: true,
        maxResults: 5,
      });

      console.log("Tavily response:", response.answer);

      // Extract URLs from results for sources
      const sourcesArray =
        response.results
          ?.map((r: { url?: string }) => r.url)
          .filter((url): url is string => Boolean(url)) || [];

      // Use the answer as the response
      const responseText = response.answer || "No answer available";

      return createSuccessResult(this.name, responseText, sourcesArray);
    } catch (error) {
      console.error(`Tavily API error:`, error);
      return createErrorResult(
        this.name,
        `Tavily API error: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }
}
