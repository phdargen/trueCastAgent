/**
 * DefiLlama Data Source
 * Uses AgentKit to fetch DeFi protocol information from DefiLlama
 */

import { AgentKit, defillamaActionProvider } from "@coinbase/agentkit";
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
 * DefiLlama Data Source implementation
 */
export class DefiLlamaDataSource implements IDataSource {
  name = "defillama";
  description =
    "DeFi protocol information such as description, TVL, market cap and token prices from DefiLlama";

  /**
   * Fetches data from DefiLlama using AgentKit
   *
   * @param prompt - The search query prompt (e.g., "Find Uniswap protocol info", "Get ETH token price")
   * @param _ - Optional parameters (unused by this data source)
   * @returns Promise resolving to data source result
   */
  async fetch(prompt: string, _?: DataSourceOptions): Promise<DataSourceResult> {
    try {
      console.log("Using DefiLlama for DeFi data with prompt:", prompt);

      const agentKit = await AgentKit.from({
        cdpApiKeyId: process.env.CDP_API_KEY_ID,
        cdpApiKeySecret: process.env.CDP_API_KEY_SECRET,
        actionProviders: [defillamaActionProvider()],
      });

      const tools = getVercelAITools(agentKit);

      const { text } = await generateText({
        model: openai(getConfig().models.agentkit),
        system:
          "You are an agent that can query DeFi protocol information and token prices using the available DefiLlama tools. " +
          "When asked for protocol information, use the search and get protocol tools. " +
          "When asked for token prices, use the get token prices tool with proper token addresses including chain prefixes. " +
          "IMPORTANT: Be decisive and focused. When multiple results are found, automatically select the most relevant/popular one (usually the one with highest TVL or most direct name match). " +
          "Do not ask for clarification or present multiple options. " +
          "Return only the most relevant information for the query - focus on key metrics like TVL, description, and recent performance. " +
          "Keep responses concise and directly answer what was asked.",
        prompt,
        tools,
        maxSteps: 5,
        maxRetries: 1,
      });

      console.log("DefiLlama data source result:", text);

      const data = {
        query: prompt,
        result: text,
      };

      return createSuccessResult(this.name, data);
    } catch (error) {
      console.error(`DefiLlama data source error:`, error);
      return createErrorResult(
        this.name,
        `DefiLlama API error: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }
}
