import * as dotenv from "dotenv";
dotenv.config();

import {
  CdpWalletProvider,
  truemarketsActionProvider
} from "@coinbase/agentkit";
import { redis } from "./redisClient";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";

// Keys for Redis sorted sets and lists
const notificationServiceKey = process.env.NEXT_PUBLIC_ONCHAINKIT_PROJECT_NAME ?? "trueCast";
const activeMarketsKey = `${notificationServiceKey}:activeMarkets`;
const finalizedMarketsKey = `${notificationServiceKey}:finalizedMarkets`;
const featuredMarketsKey = `${notificationServiceKey}:featured_markets`;
const newsworthyEventsKey = `${notificationServiceKey}:newsEvents`;

// Maximum number of news events to store
const MAX_NEWS_POSTS = process.env.MAX_NEWS_POSTS ? parseInt(process.env.MAX_NEWS_POSTS) : 5;

// Interface for formatted market data
interface MarketData {
  marketAddress: string;
  marketQuestion: string;
  yesToken: string;
  noToken: string;
  additionalInfo: string;
  source: string;
  status: number | string;
  resolutionTime: number;
  yesLpPool: string;
  noLpPool: string;
  yesPrice: number;
  noPrice: number;
  tvl: number;
  category: string;
  updatedAt: number;
  winningPosition: number;
  winningPositionString: string;
  payToken: {
    tokenAddress: string;
    tokenName: string;
  };
}

// Interface for newsworthy events
interface NewsworthyEvent extends MarketData {
  marketId: number;
  timestamp: number;
  eventType: string;
  priceChange: number;
  // Additional properties depending on event type
  [key: string]: any;
}

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
 * Gets the current status of a market from Redis
 * 
 * @param id Market ID to check
 * @returns Promise<number|null> Current status or null if not found
 */
async function getCurrentMarketStatus(id: number): Promise<number|null> {
  if (!redis) {
    console.error("Redis client not available");
    return null;
  }

  // Check active markets first
  const activeMembers = await redis.zrange<string[]>(activeMarketsKey, id, id, { byScore: true });
  if (activeMembers.length > 0) {
    try {
      // Check if the data is already an object or needs to be parsed
      const marketData = typeof activeMembers[0] === 'object' && activeMembers[0] !== null 
        ? activeMembers[0] 
        : JSON.parse(activeMembers[0]);
      return typeof marketData.status === 'number' ? marketData.status : null;
    } catch (error) {
      console.warn(`Error parsing market data for ID ${id}:`, error);
      return null;
    }
  }

  // Check finalized markets if not found in active
  const finalizedMembers = await redis.zrange<string[]>(finalizedMarketsKey, id, id, { byScore: true });
  if (finalizedMembers.length > 0) {
    try {
      // Check if the data is already an object or needs to be parsed
      const marketData = typeof finalizedMembers[0] === 'object' && finalizedMembers[0] !== null 
        ? finalizedMembers[0] 
        : JSON.parse(finalizedMembers[0]);
      return typeof marketData.status === 'number' ? marketData.status : null;
    } catch (error) {
      console.warn(`Error parsing market data for ID ${id}:`, error);
      return null;
    }
  }

  return null;
}

/**
 * Gets the current yes token price of a market from Redis
 * 
 * @param id Market ID to check
 * @returns Promise<number|null> Current yes price or null if not found
 */
async function getCurrentYesPrice(id: number): Promise<number|null> {
  if (!redis) {
    console.error("Redis client not available");
    return null;
  }

  // Check active markets first
  const activeMembers = await redis.zrange<string[]>(activeMarketsKey, id, id, { byScore: true });
  if (activeMembers.length > 0) {
    try {
      // Check if the data is already an object or needs to be parsed
      const marketData = typeof activeMembers[0] === 'object' && activeMembers[0] !== null 
        ? activeMembers[0] 
        : JSON.parse(activeMembers[0]);
      return typeof marketData.yesPrice === 'number' ? marketData.yesPrice : null;
    } catch (error) {
      console.warn(`Error parsing market data for ID ${id}:`, error);
      return null;
    }
  }

  // Check finalized markets if not found in active
  const finalizedMembers = await redis.zrange<string[]>(finalizedMarketsKey, id, id, { byScore: true });
  if (finalizedMembers.length > 0) {
    try {
      // Check if the data is already an object or needs to be parsed
      const marketData = typeof finalizedMembers[0] === 'object' && finalizedMembers[0] !== null 
        ? finalizedMembers[0] 
        : JSON.parse(finalizedMembers[0]);
      return typeof marketData.yesPrice === 'number' ? marketData.yesPrice : null;
    } catch (error) {
      console.warn(`Error parsing market data for ID ${id}:`, error);
      return null;
    }
  }

  return null;
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
 * Updates newsworthy events in Redis
 * 
 * @param newEvents Array of newsworthy events collected during processing
 */
async function updateNewsworthyEvents(newEvents: NewsworthyEvent[]): Promise<void> {
  // Filter out "yesPriceChange" events if a "statusChange" event exists for the same market
  const marketEvents = new Map<string, NewsworthyEvent[]>();
  newEvents.forEach(event => {
    if (!marketEvents.has(event.marketAddress)) {
      marketEvents.set(event.marketAddress, []);
    }
    marketEvents.get(event.marketAddress)?.push(event);
  });

  // Initial filtering for duplicate event types
  const initialFiltered: NewsworthyEvent[] = [];
  marketEvents.forEach((events, marketAddress) => {
    const hasStatusChange = events.some(e => e.eventType === "statusChange");
    const hasPriceChange = events.some(e => e.eventType === "yesPriceChange");

    if (hasStatusChange && hasPriceChange) {
      // Prioritize statusChange, remove yesPriceChange
      initialFiltered.push(...events.filter(e => e.eventType !== "yesPriceChange"));
      console.log(`Duplicate event types found for market ${marketAddress}. Prioritizing 'statusChange'.`);
    } else {
      // Keep all events if no conflict
      initialFiltered.push(...events);
    }
  });

  if (!redis) {
    console.error("Redis client not available");
    return;
  }

  if (initialFiltered.length === 0) {
    console.log("No new newsworthy events to save");
    return;
  }

  // Separate new market events from other types of events
  const newMarketEvents = initialFiltered.filter(e => e.eventType === "New");
  const otherEvents = initialFiltered.filter(e => e.eventType !== "New");
  
  // Create the final filtered events list
  let filteredEvents: NewsworthyEvent[];
  
  // If non-New events already exceed MAX_NEWS_POSTS, don't add any New events
  if (otherEvents.length >= MAX_NEWS_POSTS) {
    console.log(`Other events (${otherEvents.length}) already exceed MAX_NEWS_POSTS (${MAX_NEWS_POSTS}). Skipping new market events.`);
    // Only include other events in final filtered list
    filteredEvents = otherEvents;
  } else {
    // Calculate how many New events we can add
    const availableSlots = MAX_NEWS_POSTS - otherEvents.length;
    const newEventsToAdd = Math.min(newMarketEvents.length, availableSlots);
    
    console.log(`Can add ${newEventsToAdd} new market events (available slots: ${availableSlots})`);
    
    // Combine otherEvents with limited newMarketEvents
    filteredEvents = [...otherEvents, ...newMarketEvents.slice(0, newEventsToAdd)];
  }

  try {
    console.log(`Saving ${filteredEvents.length} filtered newsworthy events to Redis list...`);
    let addedCount = 0;

    // Add all filtered events to the beginning of the list (most recent first)
    for (const event of filteredEvents) {
      // Push to the beginning of the list in Redis
      await redis.lpush(newsworthyEventsKey, JSON.stringify(event));
      addedCount++;

      // Log added event
      console.log(`Saved event #${addedCount}: ${event.marketQuestion} (${event.eventType})`);
    }
    console.log(`Saved ${addedCount} newsworthy events to the list ${newsworthyEventsKey}`);

    // Trim the list to keep only the latest 1000 entries
    await redis.ltrim(newsworthyEventsKey, 0, 999);

  } catch (error) {
    console.error("Error saving newsworthy events list:", error);
  }
}

/**
 * Adds or updates a market in the appropriate Redis sorted set based on status
 * 
 * @param id Market ID
 * @param marketDetails Market details as JSON string
 * @param newsworthyEvents Array to collect newsworthy events
 */
async function updateMarketInRedis(
  id: number, 
  marketDetails: string, 
  isNewMarket: boolean,
  newsworthyEvents: NewsworthyEvent[]
): Promise<boolean> {
  if (!redis) {
    console.error("Redis client not available");
    return false;
  }

  try {
    const details = JSON.parse(marketDetails);
    
    // If parse failed or market isn't successful, skip
    if (!details || !details.success) {
      console.warn(`Skipping market ID ${id} due to missing or unsuccessful data`);
      return false;
    }

    // Check if market already exists in Redis to get existing category
    let existingCategory: string | undefined;
    const marketIsFinalized = details.status === "Finalized" || details.status === 7;
    const redisKey = marketIsFinalized ? finalizedMarketsKey : activeMarketsKey;

    // Get current market status to track status changes
    const currentStatus = await getCurrentMarketStatus(id);
    const newStatus = typeof details.status === 'number' ? details.status : 
                     details.status === "Finalized" ? 7 : null;
    
    // Get current yes token price to track significant changes
    const currentYesPrice = await getCurrentYesPrice(id);
    const newYesPrice = details.prices?.yes || 0;
    
    // Price change threshold for tracking significant movements (20%)
    const SIGNIFICANT_PRICE_CHANGE_THRESHOLD = 0.20;
    
    let existingMembers = await redis.zrange<string[]>(redisKey, id, id, { byScore: true });
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
    const formattedMarketData: MarketData = {
      marketAddress: details.marketAddress || "",
      marketQuestion: details.question || "",
      yesToken: details.tokens?.yes?.tokenAddress || "",
      noToken: details.tokens?.no?.tokenAddress || "",
      additionalInfo: details.additionalInfo || "",
      source: details.source || "",
      status: details.status,
      resolutionTime: details.resolutionTime || 0,
      yesLpPool: details.tokens?.yes?.lpAddress || "",
      noLpPool: details.tokens?.no?.lpAddress || "",
      yesPrice: details.prices?.yes || 0,
      noPrice: details.prices?.no || 0,
      tvl: details.tvl || 0,
      category: category,
      updatedAt: Date.now(),
      winningPosition: details.winningPosition || 0,
      winningPositionString: details.winningPositionString || "",
      payToken: {
        tokenAddress: details.tokens?.payToken?.tokenAddress || "",
        tokenName: details.tokens?.payToken?.tokenName || ""
      }
    };

    // Create newsworthy event for new market
    if (isNewMarket) {
      const newMarketEvent: NewsworthyEvent = {
        ...formattedMarketData,
        marketId: id,
        timestamp: Date.now(),
        eventType: "New",
        initialYesPrice: formattedMarketData.yesPrice,
        initialNoPrice: formattedMarketData.noPrice,
        priceChange: 0
      };
      
      // Add to in-memory collection instead of Redis
      newsworthyEvents.push(newMarketEvent);
      
      console.log(`Collected newsworthy event: New market ${id} created - ${details.question}`);
    }

    // Convert to string for storage
    const formattedMarketString = JSON.stringify(formattedMarketData);

    // Check for newsworthy status changes (to ResolutionProposed=2 or Finalized=7)
    if (newStatus !== null && 
        (newStatus === 2 || newStatus === 7) && 
        currentStatus !== newStatus) {
      
      // Create newsworthy event object
      const eventData: NewsworthyEvent = {
        ...formattedMarketData,
        marketId: id,
        previousStatus: currentStatus,
        newStatus: newStatus,
        timestamp: Date.now(),
        eventType: "statusChange",
        statusText: newStatus === 2 ? "Resolution Proposed" : "Finalized",
        priceChange: 0
      };
      
      // Add to in-memory collection instead of Redis
      newsworthyEvents.push(eventData);
      
      console.log(`Collected newsworthy event: Market ${id} changed from status ${currentStatus} to ${newStatus}`);
    }

    // Check for significant yes token price changes
    if (currentYesPrice !== null && newYesPrice !== null && 
        currentYesPrice > 0 && newYesPrice > 0) {
      // Calculate absolute price change
      const priceChange = Math.abs(newYesPrice - currentYesPrice);

      // If change exceeds threshold, add newsworthy event
      if (priceChange > SIGNIFICANT_PRICE_CHANGE_THRESHOLD) {
        const priceChangeDirection = newYesPrice > currentYesPrice ? "up" : "down";
        const percentChange = parseFloat(((priceChange / currentYesPrice) * 100).toFixed(2));

        // Create newsworthy event object for price change
        const priceEventData: NewsworthyEvent = {
          ...formattedMarketData,
          marketId: id,
          previousPrice: currentYesPrice,
          newPrice: newYesPrice,
          priceChange,
          percentChange,
          direction: priceChangeDirection,
          timestamp: Date.now(),
          eventType: "yesPriceChange"
        };
        
        // Add to in-memory collection instead of Redis
        newsworthyEvents.push(priceEventData);
        
        console.log(`Collected newsworthy event: Market ${id} yes price moved ${priceChangeDirection} by ${percentChange}% (${currentYesPrice} → ${newYesPrice}), absolute change: ${priceChange}`);
      }
    }

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

    return true;
  } catch (error) {
    console.error(`Error updating market ${id} in Redis:`, error);
    return false;
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

    // Find highest existing market ID from both active and finalized markets
    let highestActiveId = -1;
    let highestFinalizedId = -1;
    
    if (redis) {
      try {
        // Get the highest scored element (highest ID) from active markets
        const activeHighest = await redis.zrange(activeMarketsKey, 0, 0, { 
          withScores: true,
          rev: true 
        });
        if (activeHighest.length >= 2) {
          highestActiveId = parseInt(String(activeHighest[1]));
        }
        
        // Get the highest scored element (highest ID) from finalized markets
        const finalizedHighest = await redis.zrange(finalizedMarketsKey, 0, 0, { 
          withScores: true,
          rev: true 
        });
        if (finalizedHighest.length >= 2) {
          highestFinalizedId = parseInt(String(finalizedHighest[1]));
        }
      } catch (error) {
        console.error("Error getting highest market IDs:", error);
      }
    }
    
    // Use the maximum of both sets as our highest existing ID
    const highestExistingId = Math.max(highestActiveId, highestFinalizedId);
    console.log(`Highest existing market ID: ${highestExistingId}`);

    // Create array to collect newsworthy events during processing
    const newsworthyEvents: NewsworthyEvent[] = [];

    // Process all markets
    let processedCount = 0;
    let skippedCount = 0;
    let updatedActive = 0;
    let updatedFinalized = 0;
    let newMarketsCount = 0;
    
    // Pass the highest existing ID to the updateMarketInRedis function
    async function updateMarketWithContext(id: number, marketDetails: string): Promise<void> {
      const isNewMarket = id > highestExistingId;
      if (await updateMarketInRedis(id, marketDetails, isNewMarket, newsworthyEvents)) {
        if (isNewMarket) {
          newMarketsCount++;
        }
      }
    }

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
        await updateMarketWithContext(id, marketDetails);
        
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

    // Now process all collected newsworthy events
    if (newsworthyEvents.length > 0) {
      console.log(`Processing ${newsworthyEvents.length} collected newsworthy events`);
      await updateNewsworthyEvents(newsworthyEvents);
    } else {
      console.log("No newsworthy events collected during processing");
    }

    console.log("Markets update completed");
    console.log(`Total processed: ${processedCount}`);
    console.log(`Total skipped (already finalized): ${skippedCount}`);
    console.log(`Updated active markets: ${updatedActive}`);
    console.log(`Updated finalized markets: ${updatedFinalized}`);
    console.log(`New markets added: ${newMarketsCount}`);
    console.log(`Newsworthy events collected: ${newsworthyEvents.length}`);
    
  } catch (error) {
    console.error("Error updating markets:", error);
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

/**
 * Retroactively adds payToken information to existing markets in Redis
 * that are missing this data. Uses batch operations to minimize Redis calls.
 */
async function addPayTokenToExistingMarkets() {
  console.log("Starting retroactive payToken update process...");
  console.log("=".repeat(60));
  console.log("REDIS KEYS BEING UPDATED:");
  console.log(`- Active Markets: ${activeMarketsKey}`);
  console.log(`- Finalized Markets: ${finalizedMarketsKey}`);
  console.log(`- Featured Markets: ${featuredMarketsKey}`);
  console.log("=".repeat(60));
  
  if (!redis) {
    console.error("Redis client not available");
    return;
  }

  try {
    // Initialize wallet provider
    const walletProvider = await initializeWalletProvider();
    console.log("Wallet provider initialized");

    // Initialize TrueMarkets action provider
    const trueMarketsAction = truemarketsActionProvider({ 
      RPC_URL: process.env.RPC_URL 
    });

    // Get all markets from active, finalized sets and featured list
    const [activeMarkets, finalizedMarkets, featuredMarkets] = await Promise.all([
      redis.zrange(activeMarketsKey, 0, -1, { withScores: true }),
      redis.zrange(finalizedMarketsKey, 0, -1, { withScores: true }),
      redis.lrange(featuredMarketsKey, 0, -1)
    ]);

    console.log(`Found ${activeMarkets.length / 2} active markets, ${finalizedMarkets.length / 2} finalized markets, and ${featuredMarkets.length} featured markets`);
    
    // Debug: Show sample data structure
    if (activeMarkets.length > 0) {
      console.log("Sample active market data type:", typeof activeMarkets[0]);
      console.log("Sample active market data preview:", String(activeMarkets[0]).substring(0, 100) + "...");
    }

    // Helper function to process featured markets (Redis list)
    const processFeaturedMarkets = async (featuredMarkets: string[]) => {
      const marketsToUpdate: Array<{ data: string, originalData: any, index: number }> = [];
      
      // Parse all featured markets and identify those missing payToken info
      featuredMarkets.forEach((marketData, index) => {
        try {
          // Handle both string and object data from Redis
          let parsedData;
          if (typeof marketData === 'string') {
            parsedData = JSON.parse(marketData);
          } else if (typeof marketData === 'object' && marketData !== null) {
            parsedData = marketData;
          } else {
            console.warn(`Unexpected featured market data type at index ${index}:`, typeof marketData);
            return;
          }
          
          // Check if payToken is missing or incomplete
          if (!parsedData.payToken || !parsedData.payToken.tokenAddress) {
            marketsToUpdate.push({
              data: typeof marketData === 'string' ? marketData : JSON.stringify(marketData),
              originalData: parsedData,
              index: index
            });
          }
        } catch (error) {
          console.warn(`Error parsing featured market data at index ${index}:`, error);
        }
      });

      console.log(`Found ${marketsToUpdate.length} featured markets missing payToken info`);

      if (marketsToUpdate.length === 0) {
        return 0;
      }

      // Extract market IDs and fetch details in batches
      const batchSize = 10;
      let updatedCount = 0;

      for (let i = 0; i < marketsToUpdate.length; i += batchSize) {
        const batch = marketsToUpdate.slice(i, i + batchSize);
        
        console.log(`Processing featured markets batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(marketsToUpdate.length / batchSize)}`);

        // Get market IDs from the market addresses (we need to match them with active/finalized markets)
        const updatedMarkets: Array<{ index: number, data: string }> = [];

        for (const market of batch) {
          try {
            const marketAddress = market.originalData.marketAddress;
            if (!marketAddress) {
              console.warn(`Featured market missing marketAddress:`, market.originalData);
              continue;
            }

            // Find the market ID by looking it up in active or finalized markets
            let marketId: number | null = null;
            
            // Search in active markets
            for (let j = 0; j < activeMarkets.length; j += 2) {
              const activeMarketData = activeMarkets[j];
              try {
                let activeParsedData;
                if (typeof activeMarketData === 'string') {
                  activeParsedData = JSON.parse(activeMarketData);
                } else {
                  activeParsedData = activeMarketData;
                }
                
                if (activeParsedData.marketAddress === marketAddress) {
                  marketId = parseInt(String(activeMarkets[j + 1]));
                  break;
                }
              } catch (error) {
                continue;
              }
            }

            // Search in finalized markets if not found in active
            if (marketId === null) {
              for (let j = 0; j < finalizedMarkets.length; j += 2) {
                const finalizedMarketData = finalizedMarkets[j];
                try {
                  let finalizedParsedData;
                  if (typeof finalizedMarketData === 'string') {
                    finalizedParsedData = JSON.parse(finalizedMarketData);
                  } else {
                    finalizedParsedData = finalizedMarketData;
                  }
                  
                  if (finalizedParsedData.marketAddress === marketAddress) {
                    marketId = parseInt(String(finalizedMarkets[j + 1]));
                    break;
                  }
                } catch (error) {
                  continue;
                }
              }
            }

            if (marketId !== null) {
              // Fetch fresh market details
              const detailsResult = await trueMarketsAction.getMarketDetails(walletProvider, { id: marketId });
              const details = JSON.parse(detailsResult);
              
              if (details.success && details.tokens?.payToken) {
                // Update the original data with payToken info
                const updatedData = {
                  ...market.originalData,
                  payToken: {
                    tokenAddress: details.tokens.payToken.tokenAddress || "",
                    tokenName: details.tokens.payToken.tokenName || ""
                  }
                };

                updatedMarkets.push({
                  index: market.index,
                  data: JSON.stringify(updatedData)
                });
                
                console.log(`Prepared featured market update for ${updatedData.marketQuestion} - PayToken: ${updatedData.payToken.tokenName}`);
              } else {
                console.warn(`Failed to get payToken info for featured market at address ${marketAddress}`);
              }
            } else {
              console.warn(`Could not find market ID for featured market address: ${marketAddress}`);
            }
          } catch (error) {
            console.error(`Error processing featured market:`, error);
          }
        }

        // Batch update Redis list
        if (updatedMarkets.length > 0 && redis) {
          for (const update of updatedMarkets) {
            await redis.lset(featuredMarketsKey, update.index, update.data);
          }
          updatedCount += updatedMarkets.length;
          console.log(`Updated ${updatedMarkets.length} featured markets in Redis for this batch`);
        }

        // Small delay between batches
        if (i + batchSize < marketsToUpdate.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      return updatedCount;
    };

    // Helper function to process markets in batches (for sorted sets)
    const processMarketsBatch = async (markets: string[], keyName: string, isActive: boolean) => {
      const marketsToUpdate: Array<{ id: number, data: string, originalData: any }> = [];
      
      // Parse all markets and identify those missing payToken info
      for (let i = 0; i < markets.length; i += 2) {
        const marketData = markets[i];
        const marketId = parseInt(markets[i + 1]);
        
        try {
          // Handle both string and object data from Redis
          let parsedData;
          if (typeof marketData === 'string') {
            parsedData = JSON.parse(marketData);
          } else if (typeof marketData === 'object' && marketData !== null) {
            parsedData = marketData;
          } else {
            console.warn(`Unexpected market data type for ID ${marketId}:`, typeof marketData);
            continue;
          }
          
          // Check if payToken is missing or incomplete
          if (!parsedData.payToken || !parsedData.payToken.tokenAddress) {
            marketsToUpdate.push({
              id: marketId,
              data: typeof marketData === 'string' ? marketData : JSON.stringify(marketData),
              originalData: parsedData
            });
          }
        } catch (error) {
          console.warn(`Error parsing market data for ID ${marketId}:`, error);
        }
      }

      console.log(`Found ${marketsToUpdate.length} ${isActive ? 'active' : 'finalized'} markets missing payToken info`);

      if (marketsToUpdate.length === 0) {
        return 0;
      }

      // Batch fetch market details for all markets missing payToken info
      const batchSize = 10; // Process 10 markets at a time to avoid overwhelming the API
      let updatedCount = 0;

      for (let i = 0; i < marketsToUpdate.length; i += batchSize) {
        const batch = marketsToUpdate.slice(i, i + batchSize);
        
        console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(marketsToUpdate.length / batchSize)} for ${isActive ? 'active' : 'finalized'} markets`);

        // Fetch market details for the batch
        const marketDetailsPromises = batch.map(market => 
          trueMarketsAction.getMarketDetails(walletProvider, { id: market.id })
        );

        const marketDetailsResults = await Promise.all(marketDetailsPromises);

        // Prepare batch updates for Redis
        const redisUpdates: Array<{ score: number, member: string }> = [];

        for (let j = 0; j < batch.length; j++) {
          const market = batch[j];
          const detailsResult = marketDetailsResults[j];
          
          try {
            const details = JSON.parse(detailsResult);
            
            if (details.success && details.tokens?.payToken) {
              // Update the original data with payToken info
              const updatedData = {
                ...market.originalData,
                payToken: {
                  tokenAddress: details.tokens.payToken.tokenAddress || "",
                  tokenName: details.tokens.payToken.tokenName || ""
                }
              };

              redisUpdates.push({
                score: market.id,
                member: JSON.stringify(updatedData)
              });
              
              console.log(`Prepared update for market ${market.id}: ${updatedData.marketQuestion} - PayToken: ${updatedData.payToken.tokenName}`);
            } else {
              console.warn(`Failed to get payToken info for market ${market.id}:`, details.error || "Missing payToken data");
            }
          } catch (error) {
            console.error(`Error processing market ${market.id}:`, error);
          }
        }

        // Batch update Redis - remove old entries and add updated ones
        if (redisUpdates.length > 0 && redis) {
          const pipeline = redis.pipeline();
          
          // Remove old entries
          for (const market of batch) {
            pipeline.zrem(keyName, market.data);
          }
          
          // Add updated entries
          for (const update of redisUpdates) {
            pipeline.zadd(keyName, update);
          }
          
          await pipeline.exec();
          updatedCount += redisUpdates.length;
          
          console.log(`Updated ${redisUpdates.length} markets in Redis for this batch`);
        }

        // Small delay between batches to be respectful to the API
        if (i + batchSize < marketsToUpdate.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      return updatedCount;
    };

    // Process active, finalized, and featured markets
    const [activeUpdated, finalizedUpdated, featuredUpdated] = await Promise.all([
      processMarketsBatch(activeMarkets as string[], activeMarketsKey, true),
      processMarketsBatch(finalizedMarkets as string[], finalizedMarketsKey, false),
      processFeaturedMarkets(featuredMarkets as string[])
    ]);

    console.log("Retroactive payToken update completed");
    console.log(`Updated active markets: ${activeUpdated}`);
    console.log(`Updated finalized markets: ${finalizedUpdated}`);
    console.log(`Updated featured markets: ${featuredUpdated}`);
    console.log(`Total markets updated: ${activeUpdated + finalizedUpdated + featuredUpdated}`);

  } catch (error) {
    console.error("Error during retroactive payToken update:", error);
  }
}

// Export for use in other modules
export { updateMarkets, addPayTokenToExistingMarkets };