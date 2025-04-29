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

// Interface for newsworthy events
interface NewsworthyEvent {
  marketId: number;
  marketAddress: string;
  marketQuestion: string;
  yesPrice: number;
  noPrice: number;
  newsDescription: string;
  timestamp: number;
  eventType: string;
  [key: string]: any; // For additional properties
}

// Keys for Redis sorted sets
const notificationServiceKey = process.env.NEXT_PUBLIC_ONCHAINKIT_PROJECT_NAME ?? "trueCast";
const newsworthyEventsKey = `${notificationServiceKey}:newsworthyEvents`;

// Settings
const DISABLE_POSTS = process.env.DISABLE_POSTS === 'true';
const DEFAULT_MAX_POSTS = process.env.MAX_NEWS_POSTS ? parseInt(process.env.MAX_NEWS_POSTS) : 1;

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
async function getNewsworthyEvents(maxPosts: number = DEFAULT_MAX_POSTS): Promise<NewsworthyEvent[]> {
  if (!redis) {
    console.error("Redis client not available");
    return [];
  }

  try {
    // Get newsworthy events (sorted by interest - 0 is most interesting)
    const events = await redis.zrange(newsworthyEventsKey, 0, maxPosts - 1, { 
      withScores: true,
      rev: false // Get in ascending order of score (most interesting first)
    });
    
    if (events.length === 0) {
      console.log("No newsworthy events found in Redis");
      return [];
    }
    
    console.log(`Found ${events.length / 2} newsworthy events in Redis`);
    const parsedEvents: NewsworthyEvent[] = [];
    
    // Process events in pairs (member, score)
    for (let i = 0; i < events.length; i += 2) {
      try {
        let eventData;
        const eventItem = events[i];
        
        // Check if the data is already an object or needs to be parsed
        if (typeof eventItem === 'string') {
          // If it's a string, try to parse it as JSON
          eventData = JSON.parse(eventItem);
        } else if (typeof eventItem === 'object' && eventItem !== null) {
          // If it's already an object, use it directly
          eventData = eventItem;
        } else {
          console.warn(`Unexpected event data type: ${typeof eventItem}`);
          continue;
        }
        
        const score = events[i+1]; // This is the position/rank
        
        // Only include events with newsDescription
        if (eventData && eventData.newsDescription) {
          parsedEvents.push({
            ...eventData,
            rank: score
          });
        } else {
          console.log(`Event without newsDescription: ${JSON.stringify(eventData).substring(0, 100)}...`);
        }
      } catch (error) {
        console.error("Error parsing event data:", error);
      }
    }
    
    return parsedEvents;
  } catch (error) {
    console.error("Error fetching newsworthy events:", error);
    return [];
  }
}

/**
 * Generates an image for the event
 */
async function generateEventImage(event: NewsworthyEvent): Promise<string | null> {
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
    
    // Save the image locally
    const buffer = await imageResponse.arrayBuffer();
    const fileName = `market-${event.marketId}-${Date.now()}.png`;
    fs.writeFileSync(fileName, Buffer.from(buffer));
    console.log(`Market image saved as ${fileName}`);
    
    return fileName;
  } catch (error) {
    console.error("Error generating event image:", error);
    return null;
  }
}

/**
 * Posts an event to social media platforms
 */
async function postEvent(
  event: NewsworthyEvent, 
  walletProvider: any, 
  walletAddress: string
): Promise<void> {
  try {
    // Generate image for the event
    const imageFileName = await generateEventImage(event);
    if (!imageFileName) {
      console.error("Failed to generate image for event, skipping posts");
      return;
    }

    // Use newsDescription as the post content
    const postText = event.newsDescription;
    
    // Generate share URL for embedding in Farcaster post
    const baseUrl = process.env.NEXT_PUBLIC_URL;
    const shareUrl = `${baseUrl}/api/frame/share?question=${encodeURIComponent(event.marketQuestion)}&yesPrice=${encodeURIComponent(event.yesPrice)}&noPrice=${encodeURIComponent(event.noPrice)}&marketAddress=${event.marketAddress}`;
    console.log("Generated share URL:", shareUrl);
    
    if (DISABLE_POSTS) {
      console.log("Social media posts are disabled. Would have posted:");
      console.log(`- Farcaster: "${postText}" with embed URL: ${shareUrl}`);
      console.log(`- Twitter: Image file: ${imageFileName}`);
      console.log(`- Zora: Creating coin for "${event.marketQuestion}"`);
      return;
    }
    
    // Post to Farcaster
    console.log("Posting to Farcaster...");
    const farcaster = farcasterActionProvider();
    const farcasterPost = await farcaster.postCast({
      castText: postText,
      embeds: [{
        url: shareUrl
      }]
    });
    console.log("Farcaster post:", farcasterPost);
    
    // Extract the cast hash from Farcaster response
    const jsonStr = farcasterPost.replace('Successfully posted cast to Farcaster:', '').trim();
    const farcasterResponse = JSON.parse(jsonStr);
    
    const castHash = farcasterResponse?.cast?.hash;
    let warpcastUrl = '';
    if (castHash) {
      console.log("Farcaster cast hash:", castHash);
      warpcastUrl = `\n\n👉 https://warpcast.com/~/conversations/${castHash}`;
    } else {
      console.warn("Could not extract cast hash from Farcaster response");
    }

    // Post to Twitter
    console.log("Posting to Twitter...");
    const twitter = twitterActionProvider();
    const mediaId = await twitter.uploadMedia({
      filePath: imageFileName
    });
    console.log("Media ID: ", mediaId);
    
    // Extract just the numeric ID from the response
    const mediaIdMatch = mediaId.match(/Successfully uploaded media to Twitter: (\d+)/);
    const mediaIdNumber = mediaIdMatch && mediaIdMatch[1] ? mediaIdMatch[1] : null;
    
    if (!mediaIdNumber) {
      throw new Error("Failed to extract media ID from upload response");
    }

    // Append Warpcast conversation URL to tweet text
    const tweetText = postText + warpcastUrl;

    const twitterPost = await twitter.postTweet({
      tweet: tweetText,
      mediaIds: [mediaIdNumber]
    });
    console.log("Twitter post:", twitterPost);

    // Post to Zora
    console.log("Posting to Zora...");
    const zora = zoraActionProvider({
      privateKey: await (await walletProvider.getWallet().getDefaultAddress()).export(),
      pinataJwt: process.env.PINATA_JWT,
    });
    const zoraPost = await zora.createCoin(walletProvider, {
      name: event.marketQuestion,
      symbol: "TrueCast",
      description: postText,
      imageFileName: imageFileName,
      payoutRecipient: walletAddress,
      platformReferrer: walletAddress,
      initialPurchase: "0",
    });
    console.log("Zora post:", zoraPost);
    
    console.log(`Successfully posted event "${event.marketQuestion}" to all platforms`);
    
    // Wait a bit between posts to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 3000));
    
  } catch (error) {
    console.error(`Error posting event ${event.marketId}:`, error);
  }
}

/**
 * Main function to post newsworthy events
 * @param maxPosts Maximum number of events to post
 */
async function postNews(maxPosts: number = DEFAULT_MAX_POSTS) {
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