/**
 * TrueMarkets Data Source
 * Fetches related prediction markets from Redis and uses Google AI to select the most relevant one
 */

import { generateObject } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import {
  IDataSource,
  DataSourceResult,
  DataSourceOptions,
  createSuccessResult,
  createErrorResult,
} from "./types";
import { getConfig } from "../config";
import Redis from "ioredis";
import { getMarketPrices } from "../onchain/truemarkets";

// Schema for market selection
const MarketSelectionSchema = z.object({
  id: z.number().describe("ID of the selected market, or -1 if no market is relevant"),
});

// Define market type
interface Market {
  marketQuestion: string;
  marketAddress: string;
  additionalInfo: string;
  source: string;
  tvl: number;
  yesPrice: number;
  noPrice: number;
  yesToken: string;
  noToken: string;
  yesLpPool: string;
  noLpPool: string;
}

/**
 * TrueMarkets Data Source implementation
 */
export class TrueMarketsDataSource implements IDataSource {
  name = "truemarkets";
  description =
    "Finds relevant prediction markets and their current odds/prices. Returns data from the most closely matching market question based on the query. Should be used for any queries related to cryptocurrencies, politics, economics, current events or topics where public sentiment and crowd wisdom would be valuable.";
  private redis: Redis;

  /**
   * Initializes the TrueMarkets data source by establishing a Redis connection
   * using the provided REDIS_URL environment variable or default connection string.
   */
  constructor() {
    // Initialize Redis connection
    this.redis = new Redis(process.env.REDIS_URL || "");
  }

  /**
   * Fetches prediction markets from Redis and selects the most relevant one using Google AI
   *
   * @param prompt - The search query prompt
   * @param _ - Optional parameters (unused by this data source)
   * @returns Promise resolving to data source result
   */
  async fetch(prompt: string, _?: DataSourceOptions): Promise<DataSourceResult> {
    try {
      console.log("Fetching prediction markets for prompt:", prompt);

      // Retrieve all markets from Redis sorted set
      const marketData = await this.redis.zrange("trueCast:activeMarkets", 0, -1);

      if (!marketData || marketData.length === 0) {
        return createSuccessResult(this.name, "No prediction markets are currently available.");
      }

      // Parse market data
      const markets = marketData
        .map((data: string) => {
          try {
            return JSON.parse(data) as Market;
          } catch (error) {
            console.warn("Failed to parse market data:", data, "Error:", error);
            return null;
          }
        })
        .filter((market: Market | null): market is Market => market !== null);

      if (markets.length === 0) {
        return createSuccessResult(
          this.name,
          "No relevant prediction markets found for this query.",
        );
      }

      console.log(`Found ${markets.length} active markets`);

      // Extract market questions for AI selection
      const marketQuestions = markets
        .map((market: Market, index: number) => `${index}: ${market.marketQuestion}`)
        .join("\n");

      // Use Google AI to select the most relevant market
      const selectionPrompt = `Given the user query: "${prompt}"

Here are the available prediction markets:
${marketQuestions}

Please select the ONE market that is most closely related to the user's query. If none are relevant, return -1.

Consider relevance based on:
- Topic similarity
- Keywords overlap
- Conceptual relationship
- Content alignment

IMPORTANT: Better to include a market that is only loosely related to the query, than to not include any market at all.
For example, if query contains BTC, any market question that mentions BTC or bitcoin is relevant.

Timestamp: ${new Date().toISOString()}`;

      console.log("Selection prompt:", selectionPrompt);

      const { object: selection } = await generateObject({
        model: google(getConfig().models.google),
        schema: MarketSelectionSchema,
        prompt: selectionPrompt,
      });

      if (selection.id === -1) {
        return createSuccessResult(
          this.name,
          "No relevant prediction markets found for this query.",
        );
      } else if (selection.id >= 0 && selection.id < markets.length) {
        const market = markets[selection.id];

        // Fetch real-time prices from onchain contracts
        const priceData = await getMarketPrices({
          yesLpPool: market.yesLpPool,
          noLpPool: market.noLpPool,
          yesToken: market.yesToken,
          noToken: market.noToken,
          marketAddress: market.marketAddress,
        });

        const yesPrice = priceData.success ? priceData.yesPrice : market.yesPrice;
        const noPrice = priceData.success ? priceData.noPrice : market.noPrice;
        const winningPositionString = priceData.success ? priceData.winningPositionString : "Open";

        // Build human-readable response
        const response = `Prediction Market: "${market.marketQuestion}" with additional info: ${market.additionalInfo} - Current odds: YES ${(yesPrice * 100).toFixed(1)}%, NO ${(noPrice * 100).toFixed(1)}%. Market status: ${winningPositionString}. TVL: $${market.tvl.toLocaleString()}. (Note: For A vs B markets, the first mentioned option corresponds to YES outcome)`;
        console.log("TrueMarkets response:", response);
        return createSuccessResult(this.name, response, [market.marketAddress]);
      } else {
        return createErrorResult(this.name, `Invalid market selection: ${selection.id}`);
      }
    } catch (error) {
      console.error(`TrueMarkets API error:`, error);
      return createErrorResult(
        this.name,
        `TrueMarkets error: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Close Redis connection when done
   */
  async cleanup() {
    await this.redis.quit();
  }
}
