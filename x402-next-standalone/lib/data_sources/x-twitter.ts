/**
 * X/Twitter Data Source via xAI Grok
 * Uses xAI API calls to fetch real-time X/Twitter data
 */

import {
  IDataSource,
  DataSourceResult,
  DataSourceOptions,
  createSuccessResult,
  createErrorResult,
} from "./types";
import { getConfig } from "../config";

/**
 * X/Twitter Data Source implementation using xAI Grok
 */
export class XTwitterDataSource implements IDataSource {
  name = "x-twitter";
  description = "Social media sentiment, discussions and real-time public opinion";

  /**
   * Fetches data from X/Twitter via xAI Grok with search capabilities
   *
   * @param prompt - The search query prompt
   * @param _ - Optional parameters (unused by this data source)
   * @returns Promise resolving to data source result
   */
  async fetch(prompt: string, _?: DataSourceOptions): Promise<DataSourceResult> {
    try {
      console.log("Using direct xAI API for X/Twitter search");

      const config = getConfig();
      const response = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.dataSources.xTwitter.apiKey}`,
        },
        body: JSON.stringify({
          messages: [
            {
              role: "user",
              content: `Timestamp: ${new Date().toISOString()}\n ${prompt}`,
            },
          ],
          search_parameters: {
            mode: "auto",
            returnCitations: true,
            maxSearchResults: 10,
            sources: [
              // {
              //   type: 'web',
              //   allowedWebsites: ['arxiv.org', 'openai.com'],
              // },
              // {
              //   type: 'news',
              //   country: 'US',
              // },
              {
                type: "x",
                //xHandles: ['grok', 'xai'],
              },
            ],
          },
          model: config.models.xai,
        }),
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      console.log("xAI API response:", result);

      const responseText = result.choices?.[0]?.message?.content || "No response received";
      const sourcesArray =
        result.citations?.map((citation: { url?: string }) => citation.url).filter(Boolean) || [];

      return createSuccessResult(this.name, responseText, sourcesArray);
    } catch (error) {
      console.error(`xAI API error:`, error);
      return createErrorResult(
        this.name,
        `xAI API error: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }
}
