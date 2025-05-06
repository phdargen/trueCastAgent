import * as dotenv from "dotenv";
dotenv.config();

import {
  CdpWalletProvider,
  farcasterActionProvider,
  twitterActionProvider,
  zoraActionProvider
} from "@coinbase/agentkit";
import { redis } from "./redisClient";
import * as fs from "fs";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";
import OpenAI, { toFile } from "openai";
import { RawNewsworthyEvent, ProcessedNewsworthyEvent } from './types'; 
import { preFilterEvents } from './preFilterEvents'; 
import { enrichEventsWithWebSearch } from './enrichEventsWithWebSearch'; 
import { put } from '@vercel/blob';

/**
 * Sanitizes text by replacing special characters with standard ASCII equivalents
 * @param text Text to sanitize
 * @returns Sanitized text
 */
function sanitizeText(text: string): string {
  return text
    .replace(/°/g, ' degrees ')
    .replace(/[^\x00-\x7F]/g, '') // Remove non-ASCII characters
    .replace(/&/g, 'and')
    .replace(/[^a-zA-Z0-9\s\.,\-_?!]/g, ''); // Keep only alphanumeric and basic punctuation
}

// Initialize OpenAI client
const openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Keys for Redis sorted sets
const notificationServiceKey = process.env.NEXT_PUBLIC_ONCHAINKIT_PROJECT_NAME ?? "trueCast";
const newsworthyEventsKey = `${notificationServiceKey}:newsEvents`;
const newsPostedKey = `${notificationServiceKey}:newsPosts`;

// Settings
const DISABLE_POSTS = process.env.DISABLE_POSTS === 'true';
const MAX_NEWS_POSTS = process.env.MAX_NEWS_POSTS ? parseInt(process.env.MAX_NEWS_POSTS) : 5;
const ART_STYLES = [
  "Studio Ghibli style in modern setting.", 
  "Traditional Japanese Ukiyo-e style, woodblock print texture, flat colors, bold outlines in an contemporary composition.", 
  "Combine Impressionist and Post-Impressionist techniques with modern imagery, creating a fusion of Van Gogh's style with a contemporary art.", 
  "Cyberpunk aesthetic, neon lighting, moody cinematic color grading, deep shadows, high contrast, vibrant purples and blues, atmospheric glow, reflective surfaces, soft focus, futuristic urban texture."
]

/**
 * Initialize wallet provider
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
 * Fetches newsworthy events from Redis
 * @param maxPosts Maximum number of events to fetch
 */
async function getNewsworthyEvents(maxPosts: number = MAX_NEWS_POSTS): Promise<ProcessedNewsworthyEvent[]> {
  if (!redis) {
    console.error("Redis client not available");
    return [];
  }

  try {
    // Fetch raw events from the list (fetch more than maxPosts initially to allow for filtering/ranking)
    // Fetch up to MAX_NEWS_POSTS * 2 initially to have a buffer
    const rawEventStrings = await redis.lrange(newsworthyEventsKey, 0, MAX_NEWS_POSTS * 2 - 1);

    if (rawEventStrings.length === 0) {
      console.log("No raw newsworthy events found in Redis list");
      return [];
    }

    console.log(`Found ${rawEventStrings.length} raw newsworthy events in Redis list`);
    let rawEvents: RawNewsworthyEvent[] = [];
    let successfullyParsedCount = 0;

    // Parse raw events
    for (const eventString of rawEventStrings) {
      try {
        // Normalize entry to a JSON string if it's not already one
        const rawString = typeof eventString === 'string'
          ? eventString
          : JSON.stringify(eventString);
        const eventData = JSON.parse(rawString);
        rawEvents.push(eventData);
        successfullyParsedCount++;
      } catch (error) {
        const preview =
          typeof eventString === 'string'
            ? eventString.substring(0, 100)
            : JSON.stringify(eventString).slice(0, 100);
        console.error("Error parsing raw event data from Redis:", error, "Event string:", preview + "...");
      }
    }
    console.log(`Successfully parsed ${successfullyParsedCount} raw events.`);

    if (rawEvents.length === 0) {
        return [];
    }

    // Filter out events that were already posted
    const unpostedEvents: RawNewsworthyEvent[] = [];
    for (const event of rawEvents) {
      const id = `${event.marketId}:${event.timestamp}:${event.eventType}`;
      const postedEvents = await redis.lrange(newsPostedKey, 0, -1);
      const isPosted = postedEvents.some(postedEvent => {
        try {
          const parsedEvent = JSON.parse(postedEvent);
          return parsedEvent.marketId === event.marketId && 
                 parsedEvent.timestamp === event.timestamp && 
                 parsedEvent.eventType === event.eventType;
        } catch {
          return false;
        }
      });
      if (!isPosted) {
        unpostedEvents.push(event);
      }
    }
    console.log(`Filtered out ${rawEvents.length - unpostedEvents.length} already posted events; ${unpostedEvents.length} remain.`);
    rawEvents = unpostedEvents;
    if (rawEvents.length === 0) {
      console.log("No new newsworthy events to process");
      return [];
    }

    // --- Pre-filtering ---
    let eventsToProcess: ProcessedNewsworthyEvent[] = await preFilterEvents(rawEvents, MAX_NEWS_POSTS);

    // --- Web Search ---
    const enrichedEvents = await enrichEventsWithWebSearch(eventsToProcess);

    if (enrichedEvents.length === 0) {
        console.log("No events were processed with web search. Cannot rank.");
        return [];
    }

    // --- Ranking and Description Generation ---
    const rankSchema = z.object({
      rankedEvents: z.array(z.object({
        index: z.number().describe("Original index of the event in the provided array"),
        interestScore: z.number().describe("Interest score from 1-10, with 10 being most interesting"),
        headline: z.string().describe("A short, catchy news headline for this event. Max 60 characters."),
        description: z.string().describe("A compelling paragraph describing why this event is interesting. Max 280 characters."),
        imagePrompt: z.string().describe("Image prompt for AI-generated art for this event. Should be allegory for the event capturing its essence as closely as possible. Should be fun, joyous and whimsical without text or famous likenesses.")
      }))
    });

    const rankPrompt = `You are a news analyst/journalist specializing in prediction markets.

Below are ${enrichedEvents.length} events from prediction markets with additional context from web search. Please:
1. Evaluate each event for how interesting/newsworthy it would be to users, assigning an interestScore from 1-10.
2. Create a short, catchy news headline (max 60 characters) for each event.
3. Write a brief, compelling paragraph (max 280 characters) to display on a news website for each, describing the event and why it's significant. Do not talk about the prediction market itself, write it like a news article.
4. Create an imaginative image prompt for AI-generated art for each news event. Describe a vivid, symbolic scene that visually represents the event. It should be allegory for the event capturing its essence as closely as possible. Don't include text or famous people's likenesses. The prompt must pass content filters.
5. Return the results for ALL events provided, including the original index (from the list below), interestScore, headline, description, and imagePrompt for each.

Events:
${enrichedEvents.map((event, idx) => {
    let details = `[${idx}] ${event.eventType} - "${event.marketQuestion}" (Category: ${event.category || 'N/A'})`;
    if (event.eventType === "yesPriceChange" && event.previousPrice && event.newPrice) {
      details += ` - Chances for yes outcome moved from ${(event.previousPrice * 100).toFixed(2)}% to ${(event.newPrice * 100).toFixed(2)}%`;
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

    console.log(`Ranking ${enrichedEvents.length} events with enriched context...`);
    console.log("Rank prompt: ", rankPrompt);
    let rankedEvents: ProcessedNewsworthyEvent[] = [];
    try {
        const rankResult = await generateObject({
          model: openai.responses('o4-mini'),
          schema: rankSchema,
          prompt: rankPrompt,
        });

        // Combine original event data with AI description and score
        rankedEvents = rankResult.object.rankedEvents.flatMap(rankedInfo => {
            const originalEvent = enrichedEvents[rankedInfo.index];
            if (!originalEvent) {
                console.warn(`Invalid index ${rankedInfo.index} received from ranking AI. Skipping.`);
                return [];
            }
            
            // Select a random art style for each event
            const randomStyleIndex = Math.floor(Math.random() * ART_STYLES.length);
            const selectedArtStyle = ART_STYLES[randomStyleIndex];
            const imagePromptWithStyle = `${rankedInfo.imagePrompt} Style: ${selectedArtStyle}`;
            
            return [{
                ...originalEvent,
                interestScore: rankedInfo.interestScore,
                headline: rankedInfo.headline,
                newsDescription: rankedInfo.description,
                imagePrompt: imagePromptWithStyle
            }];
        });

        // Sort by interest score (ascending: least interesting first)
        // This will ensure most interesting events end up at index 0 in Redis when using lpush
        rankedEvents.sort((a, b) => (a.interestScore ?? 0) - (b.interestScore ?? 0));

    } catch (error) {
        console.error("Error ranking or describing events:", error);
        // If ranking fails, return the enriched events without scores/descriptions
        rankedEvents = enrichedEvents; // Fallback: return enriched events unsorted
    }

    // Return only the top `maxPosts` events for posting
    const eventsToPost = rankedEvents.slice(0, maxPosts);
    console.log(`Returning ${eventsToPost.length} top ranked events for posting.`);
    
    // Log image prompts for debugging
    for (const event of eventsToPost) {
      if (event.imagePrompt) {
        console.log(`Event ${event.marketId} image prompt: "${event.imagePrompt}"`);
      }
    }

    return eventsToPost;

  } catch (error) {
    console.error("Error fetching and processing newsworthy events:", error);
    return [];
  }
}

/**
 * Generates an image for the event
 */
async function generateEventImage(event: ProcessedNewsworthyEvent): Promise<string | null> {
  try {
    // Generate market image using API
    const baseUrl = process.env.NEXT_PUBLIC_URL;
    const yesPrice = event.yesPrice;
    const noPrice = event.noPrice;
    const imageUrl = `${baseUrl}/api/og/market?question=${encodeURIComponent(event.marketQuestion)}&yesPrice=${encodeURIComponent(yesPrice)}&noPrice=${encodeURIComponent(noPrice)}`;
    console.log("Generated market image URL:", imageUrl);
    
    // Fetch the image
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error(`Failed to generate image: ${imageResponse.statusText}`);
    }
    
    // Get the image data
    const buffer = await imageResponse.arrayBuffer();
    const fileName = `market-${event.marketId}-${Date.now()}.png`;
    
    // Upload to Vercel Blob
    const { url } = await put(`truecast/market-images/${fileName}`, Buffer.from(buffer), {
      access: 'public',
      contentType: 'image/png'
    });
    console.log(`Market image uploaded to Vercel Blob: ${url}`);
    
    return url;
  } catch (error) {
    console.error("Error generating event image:", error);
    return null;
  }
}

/**
 * Posts an event to social media platforms
 */
async function postEvent(
  event: ProcessedNewsworthyEvent,
  walletProvider: any,
  walletAddress: string
): Promise<void> {
  let castHash: string | null = null;
  let zoraImageURI: string | null = null;
  let zoraTransactionHash: string | null = null;
  let zoraCoinAddress: string | null = null;
  let zoraMetadataURI: string | null = null;
  let zoraUrl: string | null = null;

  try {
    // Generate image for the event
    const imageUrl = await generateAIImage(event);
    if (!imageUrl) {
      console.error("Failed to generate image for event, skipping posts");
      return;
    }

    // Use newsDescription as the post content (ensure it exists)
    const postText = event.newsDescription || event.marketQuestion; // Fallback to question if description missing
    if (!event.newsDescription) {
        console.warn(`Event ${event.marketId} is missing generated newsDescription. Falling back to market question.`);
    }
    
    if (DISABLE_POSTS) {
      console.log("Social media posts are disabled. Would have posted:");
      console.log(`- Zora: Creating coin for "${event.marketQuestion}"`);
      console.log(`- Headline: ${event.headline}`);
      console.log(`- Farcaster: "${postText}" with Zora URL`);
      console.log(`- Twitter: "${postText}" with Zora URL`);
      if (event.imagePrompt) {
        console.log(`- Image was generated with prompt: "${event.imagePrompt}"`);
      }
      return;
    }
    
    // Post to Zora first
    console.log("Posting to Zora...");
    
    const zora = zoraActionProvider({
      pinataJwt: process.env.PINATA_JWT,
    });
        
    const zoraPost = await zora.createCoin(walletProvider, {
      name: event.headline || event.marketQuestion,
      symbol: "TrueCast:"+event.marketId+":"+new Date().toLocaleDateString('en-GB', {day: '2-digit', month: '2-digit', year: '2-digit'}).replace(/\//g, ''),
      description: postText,
      image: imageUrl,
      payoutRecipient: walletAddress,
      platformReferrer: walletAddress,
      initialPurchase: "0",
      category: "news",
    });
    console.log("Zora post:", zoraPost);
    
    // Parse Zora response to get imageURI
    try {
      const parsedZoraResponse = JSON.parse(zoraPost);
      if (parsedZoraResponse.success && parsedZoraResponse.imageUri) {
        zoraImageURI = parsedZoraResponse.imageUri;
        zoraTransactionHash = parsedZoraResponse.transactionHash;
        zoraCoinAddress = parsedZoraResponse.coinAddress;
        zoraMetadataURI = parsedZoraResponse.uri;
        console.log(
          `Extracted Zora data: imageURI=${zoraImageURI}, txHash=${zoraTransactionHash}, coinAddress=${zoraCoinAddress}, metadataURI=${zoraMetadataURI}`
        );
        
        // Create Zora URL
        if (zoraCoinAddress) {
          zoraUrl = `https://zora.co/coin/base:${zoraCoinAddress}?referrer=${walletAddress}`;
          console.log("Generated Zora URL:", zoraUrl);
        }
      }
    } catch (parseError) {
      console.error("Failed to parse Zora response:", parseError);
    }
    
    if (!zoraUrl) {
      console.warn("Could not generate Zora URL, skipping further posts");
      return;
    }
    
    // Wait 15 minutes for Zora feed to index the coin before posting to other platforms
    const timeoutMinutes = 15;
    console.log(`Waiting ${timeoutMinutes} minutes for Zora to index the coin before posting to other platforms...`);
    await new Promise(resolve => setTimeout(resolve, timeoutMinutes * 60 * 1000));
    console.log("Timeout complete, proceeding with social media posts");
    
    // Post to Farcaster with Zora URL
    console.log("Posting to Farcaster...");
    const farcaster = farcasterActionProvider();
    const farcasterPost = await farcaster.postCast({
      castText: postText,
      embeds: [{
        url: zoraUrl
      }]
    });
    console.log("Farcaster post:", farcasterPost);
    
    // Extract the cast hash from Farcaster response
    const jsonStr = farcasterPost.replace('Successfully posted cast to Farcaster:', '').trim();
    const farcasterResponse = JSON.parse(jsonStr);
    
    castHash = farcasterResponse?.cast?.hash;
    if (castHash) {
      console.log("Farcaster cast hash:", castHash);
    } else {
      console.warn("Could not extract cast hash from Farcaster response");
    }

    // Post to Twitter with Zora URL
    console.log("Posting to Twitter...");
    
    const twitter = twitterActionProvider();
    const twitterPost = await twitter.postTweet({
      tweet: `${postText}\n ${zoraUrl}`
    });
    console.log("Twitter post:", twitterPost);

    console.log(`Successfully posted event "${event.marketQuestion}" to all platforms`);

    // Mark event as posted in Redis with additional info
    const postedEventData = {
      ...event,
      farcasterCastHash: castHash,
      zoraImageURI: zoraImageURI,
      zoraTransactionHash: zoraTransactionHash,
      zoraCoinAddress: zoraCoinAddress,
      zoraMetadataURI: zoraMetadataURI,
      zoraUrl: zoraUrl,
      imageUrl: imageUrl
    };
    if (redis) {
      await redis.lpush(newsPostedKey, JSON.stringify(postedEventData));
      console.log(`Event ${event.marketId} marked as posted with additional data.`);
    } else {
        console.error("Redis client not available, cannot mark event as posted.");
    }

  } catch (error) {
    console.error(`Error posting event ${event.marketId}:`, error);
  }
}

/**
 * Main function to post newsworthy events
 * @param maxPosts Maximum number of events to post
 */
async function postNews(maxPosts: number = MAX_NEWS_POSTS) {
  console.log(`Starting to post newsworthy events (max: ${maxPosts})...`);

  try {
    // Initialize wallet provider
    const walletProvider = await initializeWalletProvider();
    const walletAddress = await walletProvider.getAddress();
    console.log("Wallet Address: ", walletAddress);
    
    // Get newsworthy events from Redis
    const events = await getNewsworthyEvents(maxPosts);
    if (events.length === 0) {
      console.log("No newsworthy events to post");
      return;
    }    
    console.log(`Found ${events.length} newsworthy events to post`);

    // Post each event to social media
    for (const event of events) {
      console.log(`Processing event: ${event.marketQuestion}`);
      await postEvent(event, walletProvider, walletAddress);
    }
    console.log("Finished posting all newsworthy events");
    
  } catch (error) {
    console.error("Error posting newsworthy events:", error);
  }
}

/**
 * Generates an AI image for a specific news event
 * @param event The processed newsworthy event to generate an image for
 * @returns Promise<string|null> URL to the uploaded image or null if failed
 */
async function generateAIImage(event: ProcessedNewsworthyEvent): Promise<string | null> {
  try {
    // Prepare the prompt
    const prompt = event.imagePrompt || `Create a visual representation of this market: ${event.marketQuestion}`;
    
    // Try to use market logo if market address exists
    if (event.marketAddress) {
      try {
        // Fetch the image from the URL
        const imageUrl = `https://res.truemarkets.org/image/market/${event.marketAddress.toLowerCase()}.png`;
        console.log(`Fetching image from: ${imageUrl}`);
        
        const imageResponse = await fetch(imageUrl);
        if (imageResponse.ok) {
          // Save the original image locally
          const buffer = await imageResponse.arrayBuffer();
          const originalFileName = `original-${event.marketId}-${Date.now()}.png`;
          fs.writeFileSync(originalFileName, Buffer.from(buffer));
          console.log(`Original image saved as ${originalFileName}`);
          
          // Convert the saved image to a File object for OpenAI
          const imageFile = await toFile(fs.createReadStream(originalFileName), null, {
            type: "image/png",
          });
          
          // Use OpenAI to edit the image
          console.log(`Editing image with prompt: "${prompt}"`);
          const response = await openaiClient.images.edit({
            model: "gpt-image-1",
            prompt: prompt + " Incorporate the attached image if suitable but do not use it repetitively.",
            image: imageFile,
            n: 1,
            size: "1024x1024"
          });
          
          const imageData = response.data[0]?.b64_json;
          if (imageData) {
            // Save the edited image locally
            const editedBuffer = Buffer.from(imageData, "base64");
            const editedFileName = `ai-image-${event.marketId}-${Date.now()}.png`;
            fs.writeFileSync(editedFileName, editedBuffer);
            console.log(`Edited image saved as ${editedFileName}`);
            
            // Upload to Vercel Blob
            const { url } = await put(`truecast/images/${editedFileName}`, editedBuffer, {
              access: 'public',
              contentType: 'image/png'
            });
            console.log(`Image uploaded to Vercel Blob: ${url}`);
            
            // Clean up local files
            fs.unlinkSync(originalFileName);
            fs.unlinkSync(editedFileName);
            
            return url;
          }
        }
        
        // If we reach here, something failed with the logo approach
        console.log("Logo approach failed, falling back to direct image generation");
      } catch (logoError) {
        console.error("Error with logo-based image generation, falling back to direct generation:", logoError);
      }
    }

    // Either no market address or the logo approach failed, so use direct generation
    console.log(`Generating AI image for event ${event.marketId} with prompt: "${prompt}"`);

    // Generate image using OpenAI
    const response = await openaiClient.images.generate({
      model: "gpt-image-1", 
      prompt: prompt,
      n: 1,
      size: "1024x1024",
    });

    const imageData = response.data[0]?.b64_json;
    if (!imageData) {
      console.error("No image data returned from OpenAI");
      return null;
    }

    // Save the image locally
    const buffer = Buffer.from(imageData, "base64");
    const fileName = `ai-image-${event.marketId}-${Date.now()}.png`;
    fs.writeFileSync(fileName, buffer);
    console.log(`AI image saved as ${fileName}`);
    
    // Upload to Vercel Blob
    const { url } = await put(`truecast/images/${fileName}`, buffer, {
      access: 'public',
      contentType: 'image/png'
    });
    console.log(`Image uploaded to Vercel Blob: ${url}`);
    
    // Clean up local file
    fs.unlinkSync(fileName);
    
    return url;
  } catch (error) {
    console.error("Error generating AI image:", error);
    return null;
  }
}

// Run the function if this file is executed directly
if (require.main === module) {
  postNews()
    .then(() => {
      console.log("News posting process completed");
      process.exit(0);
    })
    .catch(error => {
      console.error("News posting process failed:", error);
      process.exit(1);
    });
}

// Export for use in other modules
export { postNews };