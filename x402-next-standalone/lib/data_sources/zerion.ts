/**
 * Zerion Data Source
 * Uses AgentKit to fetch wallet portfolio and position information from Zerion
 */

import { AgentKit, zerionActionProvider } from "@coinbase/agentkit";
import { getVercelAITools } from "@coinbase/agentkit-vercel-ai-sdk";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { bedrock } from "@ai-sdk/amazon-bedrock";
import { isAddress } from "viem";
import {
  IDataSource,
  DataSourceResult,
  DataSourceOptions,
  createSuccessResult,
  createErrorResult,
} from "./types";
import { getConfig } from "../config";

/**
 * Zerion Data Source implementation
 */
export class ZerionDataSource implements IDataSource {
  name = "zerion";
  description =
    "Wallet portfolio analysis and token positions from Zerion. Provides portfolio overviews, fungible token holdings, USD values, and DeFi positions across multiple chains.";

  /**
   * Fetches data from Zerion using AgentKit
   *
   * @param prompt - The search query prompt (e.g., "Show portfolio for 0x...", "Get positions for wallet")
   * @param _ - Optional parameters (unused by this data source)
   * @returns Promise resolving to data source result
   */
  async fetch(prompt: string, _?: DataSourceOptions): Promise<DataSourceResult> {
    try {
      console.log("Using Zerion for wallet data with prompt:", prompt);

      const agentKit = await AgentKit.from({
        cdpApiKeyId: process.env.CDP_API_KEY_ID,
        cdpApiKeySecret: process.env.CDP_API_KEY_SECRET,
        cdpWalletSecret: process.env.CDP_WALLET_SECRET,
        actionProviders: [zerionActionProvider()],
      });

      const tools = getVercelAITools(agentKit);

      const agentkitModel = getConfig().models.agentkit;
      const isOpenAI = agentkitModel.startsWith("gpt");
      const model = isOpenAI ? openai(agentkitModel) : bedrock(agentkitModel);

      // Extract wallet address from prompt if present
      const addressRegex = /0x[a-fA-F0-9]{40}/;
      const addressMatch = prompt.match(addressRegex);

      let systemPrompt =
        "You are an agent that can analyze crypto wallet portfolios and positions using Zerion tools. " +
        "You have access to get_portfolio_overview and get_fungible_positions functions. " +
        "When asked about a wallet's portfolio, use get_portfolio_overview for overall stats. " +
        "When asked about specific token holdings or positions, use get_fungible_positions. " +
        "IMPORTANT: Always validate wallet addresses before making API calls. " +
        "If no valid Ethereum wallet address is found in the prompt, respond with 'No valid wallet address found in the query. Please provide a valid Ethereum address (0x...).' " +
        "Be decisive and provide clear, actionable insights about the wallet's holdings. " +
        "Focus on key metrics like total value, top holdings, and any notable DeFi positions. " +
        "Keep responses concise and directly answer what was asked. " +
        "Never ask follow-up questions - provide the most relevant information available.";

      if (addressMatch) {
        const walletAddress = addressMatch[0];
        if (isAddress(walletAddress)) {
          systemPrompt += ` The wallet address found in the prompt is: ${walletAddress}`;
        }
      }

      const { text } = await generateText({
        model,
        system: systemPrompt,
        prompt,
        tools,
        maxSteps: 5,
        maxRetries: 1,
      });

      console.log("Zerion data source result:", text);

      return createSuccessResult(this.name, text);
    } catch (error) {
      console.error(`Zerion data source error:`, error);
      return createErrorResult(
        this.name,
        `Zerion API error: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }
}
