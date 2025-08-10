/**
 * Allora Data Source
 * Uses AgentKit to fetch prediction market data and price inferences from Allora Network
 */

import { AgentKit, alloraActionProvider } from "@coinbase/agentkit";
import { getVercelAITools } from "@coinbase/agentkit-vercel-ai-sdk";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { bedrock } from "@ai-sdk/amazon-bedrock";
import {
  IDataSource,
  DataSourceResult,
  DataSourceOptions,
  createSuccessResult,
  createErrorResult,
} from "./types";
import { getConfig } from "../config";

/**
 * Allora Data Source implementation
 */
export class AlloraDataSource implements IDataSource {
  name = "allora";
  description =
    "Allora Network prediction markets and price inferences. Provides AI-powered predictions for cryptocurrency prices and market trends through collective intelligence.";

  /**
   * Fetches data from Allora Network using AgentKit
   *
   * @param prompt - The search query prompt (e.g., "BTC price prediction", "Get all prediction topics")
   * @param _ - Optional parameters (unused by this data source)
   * @returns Promise resolving to data source result
   */
  async fetch(prompt: string, _?: DataSourceOptions): Promise<DataSourceResult> {
    try {
      console.log("Using Allora for prediction data with prompt:", prompt);

      const config = getConfig();

      const agentKit = await AgentKit.from({
        cdpApiKeyId: process.env.CDP_API_KEY_ID,
        cdpApiKeySecret: process.env.CDP_API_KEY_SECRET,
        cdpWalletSecret: process.env.CDP_WALLET_SECRET,
        actionProviders: [
          alloraActionProvider({
            apiKey: config.dataSources.allora.apiKey || undefined,
          }),
        ],
      });

      const tools = getVercelAITools(agentKit);

      const agentkitModel = getConfig().models.agentkit;
      const isOpenAI = agentkitModel.startsWith("gpt");
      const model = isOpenAI ? openai(agentkitModel) : bedrock(agentkitModel);

      const { text } = await generateText({
        model,
        system:
          "You are an agent that can access Allora Network prediction markets and price inferences. " +
          "You have access to these tools: " +
          "1. get_all_topics - to fetch all available prediction topics " +
          "2. get_inference_by_topic_id - to get inference for a specific topic (requires topic ID) " +
          "3. get_price_inference - to get price predictions for specific tokens and timeframes " +
          "When asked about predictions or forecasts, use the appropriate tools. " +
          "For general queries about available predictions, start with get_all_topics. " +
          "For specific token price predictions, use get_price_inference with supported tokens like BTC, ETH, etc. " +
          "Provide clear, actionable insights from the prediction data. " +
          "Focus on the most relevant predictions and their confidence levels. " +
          "Never ask follow-up questions - provide the most relevant information available.",
        prompt,
        tools,
        maxSteps: 5,
        maxRetries: 1,
      });

      console.log("Allora data source result:", text);

      return createSuccessResult(this.name, text);
    } catch (error) {
      console.error(`Allora data source error:`, error);
      return createErrorResult(
        this.name,
        `Allora API error: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }
}
