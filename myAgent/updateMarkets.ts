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
const newsworthyEventsKey = `${notificationServiceKey}:newsEvents`;

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
}

// Interface for newsworthy events
interface NewsworthyEvent extends MarketData {
  marketId: number;
  timestamp: number;
  eventType: string;
  
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
  const maxNewEvents = process.env.MAX_NEW_EVENTS ? parseInt(process.env.MAX_NEW_EVENTS) : 5; // Maximum events to process fully with web search and ranking

  // Filter out "yesPriceChange" events if a "statusChange" event exists for the same market
  const marketEvents = new Map<string, NewsworthyEvent[]>();
  newEvents.forEach(event => {
    if (!marketEvents.has(event.marketAddress)) {
      marketEvents.set(event.marketAddress, []);
    }
    marketEvents.get(event.marketAddress)?.push(event);
  });

  const filteredEvents: NewsworthyEvent[] = [];
  marketEvents.forEach((events, marketAddress) => {
    const hasStatusChange = events.some(e => e.eventType === "statusChange");
    const hasPriceChange = events.some(e => e.eventType === "yesPriceChange");

    if (hasStatusChange && hasPriceChange) {
      // Prioritize statusChange, remove yesPriceChange
      filteredEvents.push(...events.filter(e => e.eventType !== "yesPriceChange"));
      console.log(`Duplicate event types found for market ${marketAddress}. Prioritizing 'statusChange'.`);
    } else {
      // Keep all events if no conflict
      filteredEvents.push(...events);
    }
  });

  // Sort events to prioritize StatusChange and PriceChange over New for web search
  filteredEvents.sort((a, b) => {
    const isANew = a.eventType === 'New';
    const isBNew = b.eventType === 'New';

    if (isANew && !isBNew) return 1; // a (New) comes after b (Not New)
    if (!isANew && isBNew) return -1; // a (Not New) comes before b (New)
    return 0; // Keep original order for same priority types
  });

  // Use the filtered and sorted list for the rest of the function
  newEvents = filteredEvents;

  if (!redis) {
    console.error("Redis client not available");
    return;
  }

  if (newEvents.length === 0) {
    console.log("No new newsworthy events to process");
    return;
  }

  try {
    console.log(`Processing ${newEvents.length} potential newsworthy events`);

    // --- Pre-filtering if more than maxNewEvents ---
    let eventsToProcess = newEvents;
    if (newEvents.length > maxNewEvents) {
      console.log(`More than ${maxNewEvents} events (${newEvents.length}). Pre-filtering for the most interesting...`);

      const preFilterSchema = z.object({
        selectedIndices: z.array(z.number()).describe(`Indices of the top ${maxNewEvents} most interesting events from the original list.`)
      });

      const preFilterPrompt = `You are a news analyst. Select the ${maxNewEvents} most potentially interesting/newsworthy events from the list below based on their question, rules, and event type/details. Return only the original indices of your selections.

      Events:
      ${newEvents.map((event, idx) => {
        let details = `[${idx}] ${event.eventType} - "${event.marketQuestion}" (Category: ${event.category})`;
        details += `\n Rules: ${event.additionalInfo}`; // Added rules for better context

        if (event.eventType === "yesPriceChange") {
          details += `\n Details: Price for yes outcome moved ${event.direction} by ${event.percentChange}% (${event.previousPrice} → ${event.newPrice})`;
        } else if (event.eventType === "statusChange") {
          details += `\n Details: Status changed from ${event.previousStatus} to ${event.newStatus} (${event.statusText})`;
        } else if (event.eventType === "New") {
          details += `\n Details: Initial yes price: ${event.initialYesPrice}, TVL: ${event.tvl}`;
        }
        return details;
      }).join('\n\n')}

      Return the indices of the top ${maxNewEvents} events.`;

      try {
        const preFilterResult = await generateObject({
          model: openai.responses('o4-mini'), // Use a faster model for pre-filtering
          schema: preFilterSchema,
          prompt: preFilterPrompt,
        });

        // Filter the events based on the selected indices
        eventsToProcess = preFilterResult.object.selectedIndices
          .map(index => newEvents[index])
          .filter(event => event !== undefined); // Filter out potential undefined entries if index is wrong

        console.log(`Pre-filtered down to ${eventsToProcess.length} most interesting events.`);

      } catch (error) {
        console.error("Error during pre-filtering events:", error);
        // If pre-filtering fails, proceed with the original first maxNewEvents
        eventsToProcess = newEvents.slice(0, maxNewEvents);
        console.warn(`Pre-filtering failed. Proceeding with the first ${eventsToProcess.length} events.`);
      }
    }
    // --- End of Pre-filtering ---


    // First perform web search to gather more insights about each event
    console.log(`Gathering additional context with web search for ${eventsToProcess.length} events...`);
    
    // Prepare for web search results
    interface EnrichedEvent extends NewsworthyEvent {
      webSearchResults?: string;
    }
    
    const enrichedEvents: EnrichedEvent[] = []; // Initialize as empty
    
    // Perform web searches only for the selected eventsToProcess
    for (let i = 0; i < eventsToProcess.length; i++) {
      const event = eventsToProcess[i];
      const enrichedEvent: EnrichedEvent = { ...event }; // Create a copy to enrich

      try {
        // Construct search query based on event type
        let searchQuery = event.marketQuestion;
        if (event.eventType === "yesPriceChange") {
          searchQuery += ` market prediction price movement`;
        } else if (event.eventType === "statusChange") {
          searchQuery += ` market prediction status update`;
        } else if (event.eventType === "New") {
          searchQuery += ` prediction market`;
        }
        
        // Define the prompt for web search
        const webSearchPrompt = `This is a newsworthy event about a prediction market with question: ${event.marketQuestion},
        with the rules: ${event.additionalInfo}.
          ${event.eventType === "yesPriceChange" ? 
            `Price for yes outcome moved ${event.direction} by ${event.percentChange}% (${event.previousPrice} → ${event.newPrice}).` : 
            event.eventType === "statusChange" ? 
            `Status changed to ${event.statusText}.` : 
            event.eventType === "New" ? 
            `New market created with initial yes price of ${event.initialYesPrice}.` : 
            ''}
          
          ${event.status === 7 || event.status === "Finalized" || event.status === 2 ? 
            `This market is ${event.status === 2 ? 'proposed to resolve' : 'finalized'} with winning position: ${event.winningPositionString}.` : 
            `Current prices: YES token: ${event.yesPrice}, NO token: ${event.noPrice}.`}
          
          Research this topic to provide additional context that would make this event interesting and newsworthy.
          Focus on finding timely, relevant information about this topic that could explain why this market is moving or why it matters.
          Today's date is ${new Date().toISOString().split('T')[0]}.
          Keep your final summary concise but insightful.
          `;

        // Log the prompt for debugging
        console.log("--- Web Search Prompt ---");
        console.log(webSearchPrompt);
        console.log("-------------------------");

        // Perform web search
        console.log(`Searching for additional context on event: ${event.marketQuestion}`);
        const webSearch = await generateText({
          model: openai.responses('gpt-4.1'),
          prompt: webSearchPrompt,
          tools: {
            web_search_preview: openai.tools.webSearchPreview({
              searchContextSize: 'high',
            }),
          },
          maxSteps: 3,
        });
        
        enrichedEvent.webSearchResults = webSearch.text;

        console.log(`Completed web search for event: ${event.marketQuestion}`);

      } catch (error) {
        console.error(`Error performing web search for event ${event.marketQuestion}:`, error);
        // Continue with next event even if one fails, but don't add web search results
      } finally {
         // Add the event (potentially enriched) to the list for ranking
         enrichedEvents.push(enrichedEvent); 
      }
      
      // Brief pause to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Ensure we only rank events that underwent web search (and are in enrichedEvents)
    if (enrichedEvents.length === 0) {
        console.log("No events were successfully processed with web search. Skipping ranking.");
        return;
    }

    // Use enriched context to rank and describe events
    console.log(`Ranking ${enrichedEvents.length} events with enriched context...`);
    
    const rankSchema = z.object({
      rankedEvents: z.array(z.object({
        index: z.number().describe("Original index of the event in the provided array"),
        interestScore: z.number().describe("Interest score from 1-10, with 10 being most interesting"),
        description: z.string().describe("A compelling paragraph describing why this event is interesting. Max 280 characters."),
      }))
    });

    // Define prompt for ranking and description
    const rankPrompt = `You are a news analyst specializing in prediction markets.
      
      Below are ${enrichedEvents.length} events from prediction markets, some with additional context from web search. Please:
      1. Evaluate each event for how interesting/newsworthy it would be to users, assigning an interestScore from 1-10.
      2. Write a brief, compelling paragraph (max 280 characters) to display on a news website for each, describing the event and why it's significant. Do not talk about the prediction market itself, write it like a news article.
      3. Return the results for ALL events provided, including the original index (from the list below), interestScore, and description for each.
      
      Events:
      ${enrichedEvents.map((event, idx) => { // Iterate over enrichedEvents
        let details = `[${idx}] ${event.eventType} - "${event.marketQuestion}" (Category: ${event.category})`;
        
        if (event.eventType === "yesPriceChange") {
          details += ` - Price for yes outcome moved ${event.direction} by ${event.percentChange}% (${event.previousPrice} → ${event.newPrice})`;
        } else if (event.eventType === "statusChange") {
          details += ` - Status changed from ${event.previousStatus} to ${event.newStatus} (${event.statusText})`;
        } else if (event.eventType === "New") {
          details += ` - Initial yes price: ${event.initialYesPrice}, TVL: ${event.tvl}`;
        }
        
        if (event.webSearchResults) { 
          details += `\n\nWeb Search Results: ${event.webSearchResults}`;
        } else {
          details += `\n\n(No web search results available)`; 
        }
        
        return details;
      }).join('\n\n')}
      
      Ensure you return an entry for every single event provided, each with its original index relative to this list.`;

    // Log the prompt for debugging
    console.log("--- Rank/Description Prompt ---");
    console.log(rankPrompt);
    console.log("-----------------------------");

    const rankResult = await generateObject({
      model: openai.responses('o4-mini'),
      schema: rankSchema,
      prompt: rankPrompt, 
      providerOptions: {
        openai: {
          reasoningEffort: 'high'
        },
      },
    });

    // Sort the ranked events by interest score (ascending: least interesting first)
    const sortedRankedEvents = rankResult.object.rankedEvents.sort((a, b) => 
      a.interestScore - b.interestScore // Ascending order
    );

    // Take top events from the end of the ascending list
    const topEvents = sortedRankedEvents.length > maxNewEvents 
        ? sortedRankedEvents.slice(-maxNewEvents) 
        : sortedRankedEvents;
    
    if (topEvents.length === 0) {
      console.log("No events were ranked by AI");
      return;
    }

    // Push top new events to the beginning of the Redis list
    console.log(`Adding ${topEvents.length} top ranked events to Redis list...`);
    let addedCount = 0;
    
    // Add new top events to the beginning of the list (most interesting first)
    for (const rankedEvent of topEvents) { 
      const eventIndex = rankedEvent.index;
      // Ensure index is valid before accessing
      if (eventIndex < 0 || eventIndex >= enrichedEvents.length) {
        console.warn(`Invalid index ${eventIndex} received from ranking AI. Skipping.`);
        continue;
      }
      // Get the original event data from the enriched list using the index provided by the ranking AI
      const originalEvent = enrichedEvents[eventIndex]; 
      
      // Combine original event data with AI description and additional context
      const finalEvent = {
        ...originalEvent, // Use the event from enrichedEvents
        interestScore: rankedEvent.interestScore,
        newsDescription: rankedEvent.description,
      };
      
      // Push to the beginning of the list in Redis
      await redis.lpush(newsworthyEventsKey, JSON.stringify(finalEvent));
      addedCount++;
      
      // Log added event
      console.log(`Added top event #${addedCount} (Rank: ${rankedEvent.interestScore}): ${originalEvent.marketQuestion}`);
    }    
    console.log(`Added ${addedCount} newsworthy events to the list ${newsworthyEventsKey}`);
    
    // Trim the list to keep only the latest 1000 entries
    await redis.ltrim(newsworthyEventsKey, 0, 999); 

  } catch (error) {
    console.error("Error updating newsworthy events list:", error); // Updated error message
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
      winningPositionString: details.winningPositionString || ""
    };

    // Create newsworthy event for new market
    if (isNewMarket) {
      const newMarketEvent: NewsworthyEvent = {
        ...formattedMarketData,
        marketId: id,
        timestamp: Date.now(),
        eventType: "New",
        initialYesPrice: formattedMarketData.yesPrice,
        initialNoPrice: formattedMarketData.noPrice
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
        statusText: newStatus === 2 ? "Resolution Proposed" : "Finalized"
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
          ...formattedMarketData,
          marketId: id,
          previousPrice: currentYesPrice,
          newPrice: newYesPrice,
          percentChange: parseFloat(percentChange),
          direction: priceChangeDirection,
          timestamp: Date.now(),
          eventType: "yesPriceChange"
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