/**
 * Pyth Price Feed Data Source
 * Uses AgentKit to fetch real-time cryptocurrency prices from Pyth Network
 */

import { AgentKit, pythActionProvider } from "@coinbase/agentkit";
import { getVercelAITools } from "@coinbase/agentkit-vercel-ai-sdk";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import {
  IDataSource,
  DataSourceResult,
  DataSourceOptions,
  createSuccessResult,
  createErrorResult,
} from "./types";
import { getConfig } from "../config";

/**
 * Pyth Price Feed Data Source implementation
 */
export class PythDataSource implements IDataSource {
  name = "pyth";
  description =
    "Real-time cryptocurrency prices from Pyth Network. Do not use this data source for any other purpose than fetching price data.";

  /**
   * Fetches data from Pyth Network using AgentKit
   *
   * @param prompt - The search query prompt (e.g., "Price of BTC")
   * @param _ - Optional parameters (unused by this data source)
   * @returns Promise resolving to data source result
   */
  async fetch(prompt: string, _?: DataSourceOptions): Promise<DataSourceResult> {
    try {
      console.log("Using Pyth for price data with prompt:", prompt);

      const agentKit = await AgentKit.from({
        cdpApiKeyId: process.env.CDP_API_KEY_ID,
        cdpApiKeySecret: process.env.CDP_API_KEY_SECRET,
        actionProviders: [pythActionProvider()],
      });

      const tools = getVercelAITools(agentKit);

      const { text } = await generateText({
        model: openai(getConfig().models.agentkit),
        system:
          "You are an agent that can query cryptocurrency prices using the available tools. " +
          "When asked for a price, use the tools to find it.",
        prompt,
        tools,
        maxSteps: 5,
      });

      console.log("Pyth data source result:", text);

      const data = {
        query: prompt,
        result: text,
      };

      return createSuccessResult(this.name, data);
    } catch (error) {
      console.error(`Pyth data source error:`, error);
      return createErrorResult(
        this.name,
        `Pyth API error: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }
}
