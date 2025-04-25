import * as dotenv from "dotenv";
dotenv.config();

import { redis } from "./redisClient";
import { generateText, generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";

// Keys for Redis
const notificationServiceKey = process.env.NEXT_PUBLIC_ONCHAINKIT_PROJECT_NAME ?? "trueCast";
const activeMarketsKey = `${notificationServiceKey}:activeMarkets`;
const featuredMarketsKey = `${notificationServiceKey}:featured_markets`;

// Minimum TVL threshold for featured markets in $
const MIN_TVL_THRESHOLD = parseInt(process.env.MIN_TVL_THRESHOLD || "200");

// Selection method from environment variable (1: Direct proportional, 2: Square root, 3: Rank-based, 4: Power function, 5: AI selection)
const SELECTION_METHOD = parseInt(process.env.MARKET_SELECTION_METHOD || "1");

// Power to use for power function method (higher values favor larger TVL more strongly)
const TVL_POWER = parseFloat(process.env.TVL_POWER || "2.0");

// Number of candidate markets for AI selection
const AI_CANDIDATE_COUNT = 4;

// Number of recently featured markets to exclude from selection
const EXCLUDE_RECENT_COUNT = parseInt(process.env.EXCLUDE_RECENT_COUNT || "1");

/**
 * Selects a random active market and adds it to the featured markets list
 * Markets with TVL < 200 are filtered out
 * Selection is weighted by TVL - higher TVL markets have higher probability
 * The current featured market is excluded from selection
 */
async function selectFeaturedMarket() {
  console.log("Starting featured market selection using method: " + SELECTION_METHOD);

  try {
    if (!redis) {
      throw new Error("Redis client not available");
    }

    // Get the recently featured markets to exclude them
    console.log(`Getting ${EXCLUDE_RECENT_COUNT} recent featured markets from Redis: ${featuredMarketsKey}`);
    const recentFeaturedMarkets = await redis.lrange(featuredMarketsKey, 0, EXCLUDE_RECENT_COUNT - 1);
    const recentFeaturedMarketAddresses = new Set<string>();
    
    if (recentFeaturedMarkets && recentFeaturedMarkets.length > 0) {
      try {
        recentFeaturedMarkets.forEach(marketData => {
          const market = typeof marketData === 'string' 
            ? JSON.parse(marketData)
            : marketData;
          
          if (market.marketAddress) {
            recentFeaturedMarketAddresses.add(market.marketAddress);
          }
        });
        
        console.log(`Excluding ${recentFeaturedMarketAddresses.size} recently featured markets`);
      } catch (e) {
        console.error("Error processing recent featured markets:", e);
      }
    }

    // Get all active markets directly from Redis
    console.log("Getting all active markets from Redis: " + activeMarketsKey);
    const markets = await redis.zrange(activeMarketsKey, 0, -1);
    
    if (!markets || markets.length === 0) {
      console.log("No active markets available to feature");
      return;
    }

    console.log(`Total active markets: ${markets.length}`);
    
    // Parse markets into objects
    const parsedMarkets = markets.map(market => {
      if (typeof market === 'string') {
        try {
          return JSON.parse(market);
        } catch (e) {
          return null;
        }
      }
      return market;
    }).filter(m => m !== null);
    
    // Filter markets with TVL >= MIN_TVL_THRESHOLD and exclude recently featured markets
    const eligibleMarkets = parsedMarkets.filter(market => 
      market.tvl && 
      market.tvl >= MIN_TVL_THRESHOLD && 
      !recentFeaturedMarketAddresses.has(market.marketAddress)
    );
    
    if (eligibleMarkets.length === 0) {
      console.log(`No eligible markets available to feature (TVL >= ${MIN_TVL_THRESHOLD} and not recently featured)`);
      return;
    }
    
    console.log(`Eligible markets: ${eligibleMarkets.length}`);
    console.log(`Using selection method: ${getSelectionMethodName(SELECTION_METHOD)}`);
    
    // Select market using weighted random selection based on TVL
    const selectedMarket = await selectMarketWeightedByTVL(eligibleMarkets);
    
    if (!selectedMarket) {
      console.error("Failed to select a market");
      return;
    }

    // Add selectedAt timestamp
    const featuredMarket = {
      ...selectedMarket,
      selectedAt: Date.now()
    };

    // Convert to string for storage
    const featuredMarketString = JSON.stringify(featuredMarket);
    
    // Add to featured markets list (push to left/beginning for newest first)
    await redis.lpush(featuredMarketsKey, featuredMarketString);

    console.log(`Featured market selected: "${selectedMarket.marketQuestion}" (ID: ${selectedMarket.marketAddress}, TVL: ${selectedMarket.tvl})`);
    
  } catch (error) {
    console.error("Error selecting featured market:", error);
  }
}

/**
 * Returns the name of the selection method based on its ID
 * 
 * @param methodId The selection method ID
 * @returns The name of the selection method
 */
function getSelectionMethodName(methodId: number): string {
  switch (methodId) {
    case 1: return "Direct proportional (TVL)";
    case 2: return "Square root transformation";
    case 3: return "Rank-based";
    case 4: return `Power function (TVL^${TVL_POWER})`;
    case 5: return "AI selection with latest news";
    default: return "Unknown";
  }
}

/**
 * Selects a market using weighted random selection based on TVL
 * Higher TVL markets have higher probability of being selected
 * 
 * @param markets Array of market objects with TVL property
 * @returns Selected market object
 */
async function selectMarketWeightedByTVL(markets: any[]): Promise<any> {
  // Choose selection method based on environment variable
  switch (SELECTION_METHOD) {
    case 2:
      return selectUsingSquareRoot(markets);
    case 3:
      return selectUsingRankBased(markets);
    case 4:
      return selectUsingPowerFunction(markets);
    case 5:
      return await selectUsingAIWithNews(markets);
    case 1:
    default:
      return selectUsingDirectProportional(markets);
  }
}

/**
 * Method 1: Direct proportional weighting
 * Probability directly proportional to TVL
 */
function selectUsingDirectProportional(markets: any[]): any {
  // Calculate total TVL
  const totalTVL = markets.reduce((sum: number, market: any) => sum + (market.tvl || 0), 0);
  
  // Generate a random value between 0 and totalTVL
  const randomValue = Math.random() * totalTVL;
  
  // Select a market based on TVL weight
  let cumulativeWeight = 0;
  
  for (const market of markets) {
    cumulativeWeight += (market.tvl || 0);
    
    if (randomValue <= cumulativeWeight) {
      return market;
    }
  }
  
  // Fallback in case of rounding errors - return last market
  return markets[markets.length - 1];
}

/**
 * Method 2: Square root transformation
 * Reduces impact of large TVL differences
 */
function selectUsingSquareRoot(markets: any[]): any {
  // Calculate weights using square root transformation
  const marketWeights = markets.map(market => ({
    market,
    weight: Math.sqrt(market.tvl || 0)
  }));
  
  // Calculate total weight
  const totalWeight = marketWeights.reduce((sum: number, item: any) => sum + item.weight, 0);
  
  // Generate a random value between 0 and totalWeight
  const randomValue = Math.random() * totalWeight;
  
  // Select a market based on transformed weight
  let cumulativeWeight = 0;
  
  for (const item of marketWeights) {
    cumulativeWeight += item.weight;
    
    if (randomValue <= cumulativeWeight) {
      return item.market;
    }
  }
  
  // Fallback in case of rounding errors - return last market
  return markets[markets.length - 1];
}

/**
 * Method 3: Rank-based selection
 * Selection probability based on TVL ranking rather than absolute values
 */
function selectUsingRankBased(markets: any[]): any {
  // Sort markets by TVL in descending order
  const sortedMarkets = [...markets].sort((a, b) => (b.tvl || 0) - (a.tvl || 0));
  
  // Assign weights based on rank (n = rank position)
  const marketWeights = sortedMarkets.map((market, index) => ({
    market,
    weight: 1 / (index + 1) // Rank weight: 1/1, 1/2, 1/3, etc.
  }));
  
  // Calculate total weight
  const totalWeight = marketWeights.reduce((sum: number, item: any) => sum + item.weight, 0);
  
  // Generate a random value between 0 and totalWeight
  const randomValue = Math.random() * totalWeight;
  
  // Select a market based on rank weight
  let cumulativeWeight = 0;
  
  for (const item of marketWeights) {
    cumulativeWeight += item.weight;
    
    if (randomValue <= cumulativeWeight) {
      return item.market;
    }
  }
  
  // Fallback in case of rounding errors - return last market
  return sortedMarkets[sortedMarkets.length - 1];
}

/**
 * Method 4: Power function transformation
 * Amplifies the effect of TVL differences by raising TVL to a power
 * Higher power values give even stronger preference to markets with larger TVL
 */
function selectUsingPowerFunction(markets: any[]): any {
  // Calculate weights using power function transformation
  const marketWeights = markets.map(market => ({
    market,
    weight: Math.pow(market.tvl || 0, TVL_POWER)
  }));
  
  // Calculate total weight
  const totalWeight = marketWeights.reduce((sum: number, item: any) => sum + item.weight, 0);
  
  // Generate a random value between 0 and totalWeight
  const randomValue = Math.random() * totalWeight;
  
  // Select a market based on transformed weight
  let cumulativeWeight = 0;
  
  for (const item of marketWeights) {
    cumulativeWeight += item.weight;
    
    if (randomValue <= cumulativeWeight) {
      return item.market;
    }
  }
  
  // Fallback in case of rounding errors - return last market
  return markets[markets.length - 1];
}

/**
 * Method 5: AI selection with latest news
 * First selects candidate markets using direct proportional method,
 * then uses AI with web search to select one based on latest news
 * 
 * @param markets Array of market objects
 * @returns Promise with selected market object
 */
async function selectUsingAIWithNews(markets: any[]): Promise<any> {
  // Check if we have enough markets to select candidates
  if (markets.length <= AI_CANDIDATE_COUNT) {
    console.log(`Not enough markets (${markets.length}) for AI selection, using direct proportional method instead`);
    return selectUsingDirectProportional(markets);
  }

  console.log(`Selecting ${AI_CANDIDATE_COUNT} candidate markets using direct proportional method...`);
  
  // Create a copy of markets array to avoid modifying original
  const availableMarkets = [...markets];
  const candidates = [];
  
  // Select candidate markets using direct proportional method
  for (let i = 0; i < AI_CANDIDATE_COUNT; i++) {
    if (availableMarkets.length === 0) break;
    
    // Select a market using direct proportional method
    const selectedMarket = selectUsingDirectProportional(availableMarkets);
    candidates.push(selectedMarket);
    
    // Remove the selected market from available markets
    const index = availableMarkets.findIndex(m => m.marketAddress === selectedMarket.marketAddress);
    if (index !== -1) {
      availableMarkets.splice(index, 1);
    }
  }
  
  console.log(`Selected ${candidates.length} candidate markets for AI evaluation`);
  
  // If we don't have any candidate markets, return null
  if (candidates.length === 0) {
    console.error("No candidate markets selected for AI evaluation");
    return null;
  }
  
  // If we only have one candidate, return it without AI evaluation
  if (candidates.length === 1) {
    console.log("Only one candidate market available, skipping AI evaluation");
    return candidates[0];
  }

  // Check for OpenAI API key
  if (!process.env.OPENAI_API_KEY) {
    console.warn("OPENAI_API_KEY not set, falling back to direct proportional selection");
    return candidates[0]; // Return first candidate
  }
  
  try {
    console.log("Using AI with web search to evaluate candidate markets...");
    
    // Format candidate markets for AI prompt
    const candidatesText = candidates.map((market, index) => 
      `Candidate ${index + 1}: "${market.marketQuestion}" (TVL: $${market.tvl.toLocaleString()})`
    ).join("\n");
    
    // First do a web search to get information about the candidates
    const webSearch = await generateText({
      model: openai.responses('gpt-4.1'),
      prompt: `Research the latest news and information about these prediction market topics:
      ${candidatesText}
      
      For each candidate, find out:
      1. How relevant is this topic to current events?
      2. What recent news or developments might impact this market?
      3. How much public interest exists in this topic right now?
      
      Be thorough in your research as your findings will be used to select one market to feature.`,
      tools: {
        web_search_preview: openai.tools.webSearchPreview({
          searchContextSize: 'high',
        }),
      },
      maxSteps: 3,
    });
    
    console.log("Web search completed");
    console.log(webSearch.text);
    
    // Now use generateObject with the web search results to make a selection
    const aiResponse = await generateObject({
      model: openai.responses('gpt-4o-mini'),
      schema: z.object({
        selectedCandidateIndex: z.number()
          .int()
          .describe('The index of the selected candidate (1-based)'),
        reason: z.string()
          .describe('Brief explanation of why this market was selected based on current news and relevance'),
      }),
      prompt: `Based on your research about these prediction markets:
      ${candidatesText}
      
      Select the ONE market that has the most relevance to current events and news. Consider:
      1. Which market question relates to the most trending or important current news
      2. Which market will generate the most interest from users right now
      3. Which market has the most significant recent developments that could impact its outcome
      
      Return the candidate number (1 to ${candidates.length}) and a brief reason explaining why it's the most newsworthy or relevant right now.`,
      providerOptions: {
        openai: {
          previousResponseId: webSearch.providerMetadata?.openai.responseId as string,
        },
      },
    });
    
    console.log("AI Evaluation Complete");
    console.log("Selected Candidate:", aiResponse.object.selectedCandidateIndex);
    console.log("Selection Reason:", aiResponse.object.reason);
    
    // Get the selected candidate (adjusting from 1-based to 0-based index)
    const selectedIndex = aiResponse.object.selectedCandidateIndex - 1;
    
    if (selectedIndex >= 0 && selectedIndex < candidates.length) {
      console.log(`AI selected Candidate ${selectedIndex + 1}: "${candidates[selectedIndex].marketQuestion}"`);
      return candidates[selectedIndex];
    } else {
      // This should never happen due to Zod validation, but just in case
      console.warn("Invalid candidate index from AI, using first candidate");
      return candidates[0];
    }
    
  } catch (error) {
    console.error("Error during AI evaluation:", error);
    console.log("Falling back to first candidate market");
    return candidates[0];
  }
}

/**
 * Get all featured markets from Redis
 * 
 * @param limit Maximum number of markets to return (default: all)
 * @returns Promise with array of featured market objects
 */
export async function getFeaturedMarkets(limit?: number): Promise<any[]> {
  if (!redis) {
    console.error("Redis client not available");
    return [];
  }

  try {
    // Get markets from list
    const markets = await redis.lrange(featuredMarketsKey, 0, limit ? limit - 1 : -1);
    
    // Parse each market from JSON string to object if needed
    return markets.map(market => {
      try {
        // If already an object, return it
        if (typeof market === 'object' && market !== null) {
          return market;
        }
        
        // Otherwise try to parse string to object
        if (typeof market === 'string') {
          return JSON.parse(market);
        }
        
        console.error(`Market is not a string or object but ${typeof market}`);
        return null;
      } catch (error) {
        console.error(`Error parsing featured market data: ${error}`);
        return null;
      }
    }).filter(market => market !== null);
  } catch (error) {
    console.error("Error retrieving featured markets:", error);
    return [];
  }
}

// Run the featured market selection if this file is executed directly
if (require.main === module) {
  selectFeaturedMarket()
    .then(() => {
      console.log("Featured market selection completed");
      process.exit(0);
    })
    .catch(error => {
      console.error("Featured market selection failed:", error);
      process.exit(1);
    });
}

// Export for use in other modules
export { selectFeaturedMarket }; 