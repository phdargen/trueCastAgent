/**
 * TrueMarkets Data Source
 * Fetches related prediction markets from Redis and uses Google AI to select the most relevant one
 */

import { generateObject } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { IDataSource, DataSourceResult, createSuccessResult, createErrorResult } from "./types";
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
  description = "Prediction markets data to find related market sentiment.";
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
   * @returns Promise resolving to data source result
   */
  async fetch(prompt: string): Promise<DataSourceResult> {
    try {
      console.log("Fetching prediction markets for prompt:", prompt);

      // Retrieve all markets from Redis sorted set
      const marketData = await this.redis.zrange("trueCast:activeMarkets", 0, -1);

      if (!marketData || marketData.length === 0) {
        return createSuccessResult(this.name, {
          selectedMarket: null,
        });
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
        return createSuccessResult(this.name, {
          selectedMarket: null,
        });
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
- Content alignment`;

      console.log("Selection prompt:", selectionPrompt);

      const { object: selection } = await generateObject({
        model: google(getConfig().models.google),
        schema: MarketSelectionSchema,
        prompt: selectionPrompt,
      });

      let selectedMarket = null;
      let reason = "";

      if (selection.id === -1) {
        reason = "AI determined no markets are relevant to the query";
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

        selectedMarket = {
          marketQuestion: market.marketQuestion,
          marketAddress: market.marketAddress,
          source: market.source,
          tvl: market.tvl,
          yesPrice: priceData.success ? priceData.yesPrice : market.yesPrice,
          noPrice: priceData.success ? priceData.noPrice : market.noPrice,
          winningPosition: priceData.success ? priceData.winningPosition : 0,
          winningPositionString: priceData.success ? priceData.winningPositionString : "Open",
        };

        reason = priceData.success
          ? `Selected market ${selection.id} as most relevant with real-time prices`
          : `Selected market ${selection.id} as most relevant (using cached prices: ${priceData.error})`;
      } else {
        reason = `Invalid selection from AI: ${selection.id}`;
      }

      console.log("TrueMarkets data source result:", { selectedMarket, reason });

      return createSuccessResult(this.name, { selectedMarket });
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
