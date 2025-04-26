import * as dotenv from "dotenv";
dotenv.config();

import {
  CdpWalletProvider,
  truemarketsActionProvider
} from "@coinbase/agentkit";
import { redis } from "./redisClient";
import { openai } from "@ai-sdk/openai";
import { generateObject, generateText } from "ai";
import { z } from "zod";

// Keys for Redis sorted sets
const notificationServiceKey = process.env.NEXT_PUBLIC_ONCHAINKIT_PROJECT_NAME ?? "trueCast";
const activeMarketsKey = `${notificationServiceKey}:activeMarkets`;
const finalizedMarketsKey = `${notificationServiceKey}:finalizedMarkets`;
const newsworthyEventsKey = `${notificationServiceKey}:newsworthyEvents`;

// Interface for newsworthy events
interface NewsworthyEvent {
  marketId: number;
  marketQuestion: string;
  category: string;
  timestamp: number;
  eventType: string;
  [key: string]: any; // Additional properties depending on event type
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
 * Updates the top 5 newsworthy events in Redis
 * 
 * @param newEvents Array of newsworthy events collected during processing
 */
async function updateNewsworthyEvents(newEvents: NewsworthyEvent[]): Promise<void> {
  if (!redis) {
    console.error("Redis client not available");
    return;
  }

  if (newEvents.length === 0) {
    console.log("No new newsworthy events to process");
    return;
  }

  try {
    console.log(`Processing ${newEvents.length} newsworthy events`);

    // STEP 1: First perform web search to gather more insights about each event
    console.log("Gathering additional context with web search...");
    
    // Prepare for web search results
    interface EnrichedEvent extends NewsworthyEvent {
      webSearchResults?: string;
    }
    
    const enrichedEvents: EnrichedEvent[] = [...newEvents];
    
    // Perform web searches for each event (up to 5 to avoid excessive API usage)
    const eventsToSearch = newEvents.slice(0, Math.min(5, newEvents.length));
    
    for (let i = 0; i < eventsToSearch.length; i++) {
      const event = eventsToSearch[i];
      try {
        // Construct search query based on event type
        let searchQuery = event.marketQuestion;
        if (event.eventType === "priceChange") {
          searchQuery += ` market prediction price movement`;
        } else if (event.eventType === "statusChange") {
          searchQuery += ` market prediction status update`;
        } else if (event.eventType === "newMarket") {
          searchQuery += ` prediction market`;
        }
        
        // Perform web search
        console.log(`Searching for additional context on event: ${event.marketQuestion}`);
        const webSearch = await generateText({
          model: openai.responses('gpt-4.1'),
          prompt: `This is a newsworthy event about a prediction market: ${event.marketQuestion}
          ${event.eventType === "priceChange" ? 
            `Price moved ${event.direction} by ${event.percentChange}% (${event.previousPrice} → ${event.newPrice}).` : 
            event.eventType === "statusChange" ? 
            `Status changed to ${event.statusText}.` : 
            event.eventType === "newMarket" ? 
            `New market created with initial yes price of ${event.initialYesPrice}.` : 
            ''}
          
          Research this topic to provide additional context that would make this event more interesting and newsworthy.
          Focus on finding timely, relevant information about this topic that could explain why this market is moving or why it matters.
          Keep your final summary concise but insightful.
          `,
          tools: {
            web_search_preview: openai.tools.webSearchPreview({
              searchContextSize: 'high',
            }),
          },
          maxSteps: 3,
        });
        
        enrichedEvents[i].webSearchResults = webSearch.text;
        enrichedEvents[i].webSearchResponseId = webSearch.providerMetadata?.openai.responseId;
        
        console.log(`Completed web search for event: ${event.marketQuestion}`);
      } catch (error) {
        console.error(`Error performing web search for event ${event.marketQuestion}:`, error);
        // Continue with next event even if one fails
      }
      
      // Brief pause to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // STEP 2: Use the enriched context to rank and describe events
    console.log("Ranking events with enriched context...");
    
    const rankSchema = z.object({
      rankedEvents: z.array(z.object({
        index: z.number().describe("Original index of the event in the provided array"),
        interestScore: z.number().describe("Interest score from 1-10, with 10 being most interesting"),
        description: z.string().describe("A compelling paragraph describing why this event is interesting. Max 200 characters."),
      }))
    });

    const rankResult = await generateObject({
      model: openai.responses('gpt-4o'),
      schema: rankSchema,
      prompt: `You are a news analyst specializing in prediction markets.
      
      Below are ${enrichedEvents.length} events from prediction markets, some with additional context from web search. Please:
      1. Rank them by how interesting/newsworthy they would be to users
      2. Write a brief, compelling paragraph to display on a news website for each describing the event and why it's significant. Max 200 characters each.
      3. Provide additional context that makes it more newsworthy based on web search results
      4. Return the top ${Math.min(5, enrichedEvents.length)} most interesting events
      
      Events:
      ${enrichedEvents.map((event, idx) => {
        let details = `[${idx}] ${event.eventType} - "${event.marketQuestion}" (Category: ${event.category})`;
        
        if (event.eventType === "priceChange") {
          details += ` - Price moved ${event.direction} by ${event.percentChange}% (${event.previousPrice} → ${event.newPrice})`;
        } else if (event.eventType === "statusChange") {
          details += ` - Status changed from ${event.previousStatus} to ${event.newStatus} (${event.statusText})`;
        } else if (event.eventType === "newMarket") {
          details += ` - Initial yes price: ${event.initialYesPrice}, TVL: ${event.tvl}`;
        }
        
        if (event.webSearchResults) {
          details += `\n\nWeb Search Results: ${event.webSearchResults}`;
        }
        
        return details;
      }).join('\n\n')}
      
      Return only the top ${Math.min(5, enrichedEvents.length)} most interesting events, ranked by interestScore from highest to lowest.`,
      providerOptions: {
        openai: {
          reasoningEffort: 'high',
          // Pass previous response ID if available
          ...(enrichedEvents[0]?.webSearchResponseId 
            ? { previousResponseId: enrichedEvents[0].webSearchResponseId as string } 
            : {})
        },
      },
    });

    // Sort the ranked events by interest score (highest first)
    const sortedRankedEvents = rankResult.object.rankedEvents.sort((a, b) => 
      b.interestScore - a.interestScore
    );

    // Take top 5 (or less if fewer events)
    const topEvents = sortedRankedEvents.slice(0, 5);
    
    if (topEvents.length === 0) {
      console.log("No events were ranked by AI");
      return;
    }

    // Clear existing newsworthy events
    await redis.del(newsworthyEventsKey);
    
    // Add new top events with position as score (0 = most interesting)
    for (let i = 0; i < topEvents.length; i++) {
      const eventIndex = topEvents[i].index;
      const originalEvent = enrichedEvents[eventIndex];
      
      // Combine original event data with AI description and additional context
      const finalEvent = {
        ...originalEvent,
        interestScore: topEvents[i].interestScore,
        aiDescription: topEvents[i].description,
      };
      
      // Add to Redis with position as score (0 = most interesting)
      await redis.zadd(newsworthyEventsKey, {
        score: i,
        member: JSON.stringify(finalEvent)
      });
      
      console.log(`Added top newsworthy event #${i+1}: ${originalEvent.marketQuestion}`);
    }
    
    console.log(`Updated newsworthy events in Redis with ${topEvents.length} events`);

  } catch (error) {
    console.error("Error updating newsworthy events:", error);
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
    const formattedMarketData = {
      marketAddress: details.marketAddress || "",
      marketQuestion: details.question || "",
      yesToken: details.tokens?.yes?.tokenAddress || "",
      noToken: details.tokens?.no?.tokenAddress || "",
      additionalInfo: details.additionalInfo || "",
      source: details.source || "",
      status: details.status ,
      resolutionTime: details.resolutionTime || 0,
      yesLpPool: details.tokens?.yes?.lpAddress || "",
      noLpPool: details.tokens?.no?.lpAddress || "",
      yesPrice: details.prices?.yes || 0,
      noPrice: details.prices?.no || 0,
      tvl: details.tvl || 0,
      category: category,
      updatedAt: Date.now()
    };

    // Create newsworthy event for new market
    if (isNewMarket) {
      const newMarketEvent: NewsworthyEvent = {
        marketId: id,
        marketQuestion: details.question || "",
        category: category,
        timestamp: Date.now(),
        eventType: "newMarket",
        initialYesPrice: details.prices?.yes || 0,
        initialNoPrice: details.prices?.no || 0,
        tvl: details.tvl || 0
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
        marketId: id,
        marketQuestion: details.question || "",
        previousStatus: currentStatus,
        newStatus: newStatus,
        statusText: newStatus === 2 ? "Resolution Proposed" : "Finalized",
        category: category,
        timestamp: Date.now(),
        eventType: "statusChange"
      };
      
      // Add to in-memory collection instead of Redis
      newsworthyEvents.push(eventData);
      
      console.log(`Collected newsworthy event: Market ${id} changed from status ${currentStatus} to ${newStatus}`);
    }

    // Check for significant yes token price changes
    if (currentYesPrice !== null && newYesPrice !== null && 
        currentYesPrice > 0 && newYesPrice > 0) {
      
      // Calculate percentage change
      const priceChangePercent = Math.abs((newYesPrice - currentYesPrice) / currentYesPrice);
      
      // If change exceeds threshold, add newsworthy event
      if (priceChangePercent >= SIGNIFICANT_PRICE_CHANGE_THRESHOLD) {
        const priceChangeDirection = newYesPrice > currentYesPrice ? "up" : "down";
        const percentChange = (priceChangePercent * 100).toFixed(2);
        
        // Create newsworthy event object for price change
        const priceEventData: NewsworthyEvent = {
          marketId: id,
          marketQuestion: details.question || "",
          previousPrice: currentYesPrice,
          newPrice: newYesPrice,
          percentChange: parseFloat(percentChange),
          direction: priceChangeDirection,
          category: category,
          timestamp: Date.now(),
          eventType: "priceChange"
        };
        
        // Add to in-memory collection instead of Redis
        newsworthyEvents.push(priceEventData);
        
        console.log(`Collected newsworthy event: Market ${id} yes price moved ${priceChangeDirection} by ${percentChange}% (${currentYesPrice} → ${newYesPrice})`);
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

// Export for use in other modules
export { updateMarkets };