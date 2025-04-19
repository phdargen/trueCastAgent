import * as dotenv from "dotenv";
dotenv.config();

import {
  CdpWalletProvider,
  truemarketsActionProvider
} from "@coinbase/agentkit";
import { redis } from "./redisClient";
import { getVercelAITools } from "@coinbase/agentkit-vercel-ai-sdk";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";

// Keys for Redis sorted sets
const notificationServiceKey = process.env.NEXT_PUBLIC_ONCHAINKIT_PROJECT_NAME ?? "trueCast";
const activeMarketsKey = `${notificationServiceKey}:activeMarkets`;
const finalizedMarketsKey = `${notificationServiceKey}:finalizedMarkets`;

/**
 * Initializes the wallet provider for blockchain interactions
 * 
 * @returns Configured wallet provider
 */
async function initializeWalletProvider() {
  const walletProvider = await CdpWalletProvider.configureWithWallet({
    apiKeyName: process.env.CDP_API_KEY_NAME,
    apiKeyPrivateKey: process.env.CDP_API_KEY_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    networkId: process.env.NETWORK_ID || "base-mainnet",
  });

  return walletProvider;
}

/**
 * Checks if a market with given ID exists in the finalized markets set
 * 
 * @param id Market ID to check
 * @returns Promise<boolean> true if market is already finalized
 */
async function isMarketFinalized(id: number): Promise<boolean> {
  if (!redis) {
    console.error("Redis client not available");
    return false;
  }

  // Get all members with the market ID as score
  const members = await redis.zrange(finalizedMarketsKey, id, id, {
    byScore: true
  });
  return members.length > 0;
}

/**
 * Gets or generates a category for a market
 * 
 * @param question The market question
 * @param existingCategory Optional existing category
 * @returns Promise with the market category
 */
async function getMarketCategory(question: string, existingCategory?: string): Promise<string> {
  // If category already exists, return it to avoid unnecessary API calls
  if (existingCategory) {
    return existingCategory;
  }
  
  try {
    // Generate category using OpenAI
    const categorizeMarket = await generateObject({
      model: openai.responses('gpt-4o-mini'),
      schema: z.object({
        category: z.string().describe('Category of the market'),
      }),
      prompt: `Categorize the prediction market ${question} into one of the following categories:
      - Crypto
      - Politics
      - Sports
      - Entertainment
      - Technology
      - Finance
      - Other
      `,
    });
    
    return categorizeMarket.object.category;
  } catch (error) {
    console.error("Error categorizing market:", error);
    return "Other"; // Default category in case of error
  }
}

/**
 * Adds or updates a market in the appropriate Redis sorted set based on status
 * 
 * @param id Market ID
 * @param marketDetails Market details as JSON string
 */
async function updateMarketInRedis(id: number, marketDetails: string): Promise<void> {
  if (!redis) {
    console.error("Redis client not available");
    return;
  }

  try {
    const details = JSON.parse(marketDetails);
    
    // If parse failed or market isn't successful, skip
    if (!details || !details.success) {
      console.warn(`Skipping market ID ${id} due to missing or unsuccessful data`);
      return;
    }

    // Check if market already exists in Redis to get existing category
    let existingCategory: string | undefined;
    const marketIsFinalized = details.status === "Finalized" || details.status === 7;
    const redisKey = marketIsFinalized ? finalizedMarketsKey : activeMarketsKey;
    
    const existingMembers = await redis.zrange<string[]>(redisKey, id, id, { byScore: true });
    if (existingMembers.length > 0) {
      try {
        // Check if the data is already an object or needs to be parsed
        const existingData = typeof existingMembers[0] === 'object' && existingMembers[0] !== null 
          ? existingMembers[0] 
          : JSON.parse(existingMembers[0]);
        existingCategory = existingData.category;
      } catch (error) {
        console.warn(`Error parsing existing market data for ID ${id}:`, error);
      }
    }
    
    // Get category for the market
    const category = await getMarketCategory(details.question, existingCategory);

    // Format the market data according to the required structure
    const formattedMarketData = {
      marketAddress: details.marketAddress || "",
      marketQuestion: details.question || "",
      yesToken: details.tokens?.yes?.tokenAddress || "",
      noToken: details.tokens?.no?.tokenAddress || "",
      additionalInfo: details.additionalInfo || "",
      source: details.source || "",
      status: details.status || -1,
      resolutionTime: details.resolutionTime || 0,
      yesLpPool: details.tokens?.yes?.lpAddress || "",
      noLpPool: details.tokens?.no?.lpAddress || "",
      yesPrice: details.prices?.yes || 0,
      noPrice: details.prices?.no || 0,
      tvl: details.tvl || 0,
      category: category,
      updatedAt: Date.now()
    };

    // Convert to string for storage
    const formattedMarketString = JSON.stringify(formattedMarketData);

    // Determine if market is finalized (status 7 is Finalized)
    const isFinalized = details.status === "Finalized" || details.status === 7;

    // Add market data as string with ID as score
    if (isFinalized) {
      // If finalized, remove from active and add to finalized
      // Get all members with this score and remove them from active markets
      const activeMembers = await redis.zrange(activeMarketsKey, id, id, { byScore: true });
      if (activeMembers.length > 0) {
        for (const member of activeMembers) {
          await redis.zrem(activeMarketsKey, member);
        }
      }
      
      await redis.zadd(finalizedMarketsKey, { score: id, member: formattedMarketString });
      console.log(`Market ${id} moved to finalized markets`);
    } else {
      // If active, add/update in active markets
      // Get all members with this score and remove them from active markets first
      const existingActiveMembers = await redis.zrange(activeMarketsKey, id, id, { byScore: true });
      if (existingActiveMembers.length > 0) {
        for (const member of existingActiveMembers) {
          await redis.zrem(activeMarketsKey, member);
        }
      }
      
      await redis.zadd(activeMarketsKey, { score: id, member: formattedMarketString });
      console.log(`Market ${id} updated in active markets`);
    }
  } catch (error) {
    console.error(`Error updating market ${id} in Redis:`, error);
  }
}

/**
 * Main function to update all markets in Redis
 */
async function updateMarkets() {
  console.log("Starting markets update process...");

  try {
    // Initialize wallet provider
    const walletProvider = await initializeWalletProvider();
    console.log("Wallet provider initialized");

    // Initialize TrueMarkets action provider
    const trueMarketsAction = truemarketsActionProvider({ 
      RPC_URL: process.env.RPC_URL 
    });

    // Get total number of markets by fetching first market with descending order
    const marketsResponse = await trueMarketsAction.getActiveMarkets(walletProvider, {
      limit: 1,
      offset: 0,
      sortOrder: "desc"
    });

    const marketsData = JSON.parse(marketsResponse);
    
    if (!marketsData.success || !marketsData.totalMarkets) {
      console.error("Failed to retrieve total markets count:", marketsData);
      return;
    }

    const totalMarkets = marketsData.totalMarkets;
    console.log(`Total markets: ${totalMarkets}`);

    // Process all markets
    let processedCount = 0;
    let skippedCount = 0;
    let updatedActive = 0;
    let updatedFinalized = 0;

    for (let id = 0; id < totalMarkets; id++) {
      // Check if market is already finalized in our database
      const alreadyFinalized = await isMarketFinalized(id);
      
      if (alreadyFinalized) {
        skippedCount++;
        // Skip already finalized markets - no need to fetch again
        if (skippedCount % 50 === 0) {
          console.log(`Skipped ${skippedCount} already finalized markets`);
        }
        continue;
      }

      // Get market details for non-finalized markets
      const marketDetails = await trueMarketsAction.getMarketDetails(walletProvider, {id});
      
      // Parse to check status
      const details = JSON.parse(marketDetails);
      
      if (details.success) {
        await updateMarketInRedis(id, marketDetails);
        
        // Track what we've updated
        if (details.status === "Finalized" || details.status === 7) {
          updatedFinalized++;
        } else {
          updatedActive++;
        }
      } else {
        console.warn(`Failed to get details for market ${id}:`, details.error);
      }

      processedCount++;
      if (processedCount % 10 === 0) {
        console.log(`Processed ${processedCount} markets (${skippedCount} skipped)`);
      }
    }

    console.log("Markets update completed");
    console.log(`Total processed: ${processedCount}`);
    console.log(`Total skipped (already finalized): ${skippedCount}`);
    console.log(`Updated active markets: ${updatedActive}`);
    console.log(`Updated finalized markets: ${updatedFinalized}`);
    
  } catch (error) {
    console.error("Error updating markets:", error);
  }
}

/**
 * Get all active markets from Redis
 * 
 * @param limit Maximum number of markets to return (default: all)
 * @param newest Whether to return newest markets first (default: true)
 * @returns Promise with array of market details objects
 */
export async function getActiveMarkets(limit?: number, newest: boolean = true): Promise<any[]> {
  if (!redis) {
    console.error("Redis client not available");
    return [];
  }

  try {
    // Get markets sorted by ID (score) with newest first if requested
    const markets = await redis.zrange<string[]>(activeMarketsKey, 0, limit ? limit - 1 : -1, {
      byScore: true,
      rev: newest // Reverse order to get newest (highest IDs) first
    });
    
    // Parse each market from JSON string to object
    return markets.map(market => {
      try {
        return JSON.parse(market);
      } catch (error) {
        console.error("Error parsing market data:", error);
        return null;
      }
    }).filter(market => market !== null);
  } catch (error) {
    console.error("Error retrieving active markets:", error);
    return [];
  }
}

/**
 * Get all finalized markets from Redis
 * 
 * @param limit Maximum number of markets to return (default: all)
 * @param newest Whether to return newest markets first (default: true)
 * @returns Promise with array of market details objects
 */
export async function getFinalizedMarkets(limit?: number, newest: boolean = true): Promise<any[]> {
  if (!redis) {
    console.error("Redis client not available");
    return [];
  }

  try {
    // Get markets sorted by ID (score) with newest first if requested
    const markets = await redis.zrange<string[]>(finalizedMarketsKey, 0, limit ? limit - 1 : -1, {
      byScore: true,
      rev: newest // Reverse order to get newest (highest IDs) first
    });
    
    // Parse each market from JSON string to object
    return markets.map(market => {
      try {
        return JSON.parse(market);
      } catch (error) {
        console.error("Error parsing market data:", error);
        return null;
      }
    }).filter(market => market !== null);
  } catch (error) {
    console.error("Error retrieving finalized markets:", error);
    return [];
  }
}

// Run the markets update if this file is executed directly
if (require.main === module) {
  updateMarkets()
    .then(() => {
      console.log("Markets update process completed");
      process.exit(0);
    })
    .catch(error => {
      console.error("Markets update process failed:", error);
      process.exit(1);
    });
}

// Export for use in other modules
export { updateMarkets };