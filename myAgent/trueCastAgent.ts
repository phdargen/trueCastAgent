import {
  AgentKit,
  CdpWalletProvider,
  erc20ActionProvider,
  defillamaActionProvider,
  truemarketsActionProvider,
  farcasterActionProvider,
  twitterActionProvider,
  safeApiActionProvider,
  zeroXActionProvider
} from "@coinbase/agentkit";
import { getVercelAITools } from "@coinbase/agentkit-vercel-ai-sdk";
import { openai } from "@ai-sdk/openai";
import { generateText, generateObject } from "ai";
import * as dotenv from "dotenv";
import * as fs from "fs";
import { z } from "zod";
import { exit } from "process";
import { formatEther } from "viem";

const USDC_ADDRESS = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const USDC_DECIMALS = 6;

const SAFE_ADDRESS = "0x14308D70c1786Ee80fD26027FD28f608e073af92";

// Add command line argument parsing
const args = process.argv.slice(2);
const DISABLE_POSTS = args.includes('--no-posts');

dotenv.config();

/**
 * Validates that required environment variables are set
 *
 * @throws {Error} - If required environment variables are missing
 * @returns {void}
 */
function validateEnvironment(): void {
  const missingVars: string[] = [];

  // Check required variables
  const requiredVars = ["OPENAI_API_KEY", "CDP_API_KEY_NAME", "CDP_API_KEY_PRIVATE_KEY", "NEXT_PUBLIC_URL"];
  requiredVars.forEach(varName => {
    if (!process.env[varName]) {
      missingVars.push(varName);
    }
  });

  // Exit if any required variables are missing
  if (missingVars.length > 0) {
    console.error("Error: Required environment variables are not set");
    missingVars.forEach(varName => {
      console.error(`${varName}=your_${varName.toLowerCase()}_here`);
    });
    process.exit(1);
  }

  // Warn about optional variables
  if (!process.env.NETWORK_ID) {
    console.warn("Warning: NETWORK_ID not set, defaulting to base-sepolia testnet");
  }
}

// Validate environment variables
validateEnvironment();

/**
 * Initialize the agent with CDP Agentkit and Vercel AI SDK tools
 *
 * @returns Object containing initialized tools
 * @throws Error if initialization fails
 */
export async function initializeAgent() {
  try {

    const walletProvider = await CdpWalletProvider.configureWithWallet({
      apiKeyName: process.env.CDP_API_KEY_NAME,
      apiKeyPrivateKey: process.env.CDP_API_KEY_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      networkId: process.env.NETWORK_ID || "base-sepolia",
      mnemonicPhrase: process.env.MNEMONIC_PHRASE,
    });

    const agentKit = await AgentKit.from({
      walletProvider,
      actionProviders: [
        erc20ActionProvider(),
        defillamaActionProvider(),
        truemarketsActionProvider({
          RPC_URL: process.env.RPC_URL,
        }),
        safeApiActionProvider({
          networkId: process.env.NETWORK_ID || "base-sepolia",
        }),
        zeroXActionProvider({
          apiKey: process.env.ZEROX_API_KEY,
        }),
      ],
    });

    const walletAddress = await walletProvider.getAddress();
    console.log("Wallet Address: ", walletAddress);
    console.log("Wallet Balance: ", formatEther(await walletProvider.getBalance()), " ETH");
    const erc20Action = erc20ActionProvider();
    console.log("USDC Balance: ", await erc20Action.getBalance(walletProvider, {contractAddress: USDC_ADDRESS}));

    // const safeApiAction = safeApiActionProvider({
    //   networkId: process.env.NETWORK_ID || "base-sepolia",
    // });
    // console.log("Safe info: ", await safeApiAction.safeInfo(walletProvider, {safeAddress: SAFE_ADDRESS}));
    // console.log("Safe allowance info: ", await safeApiAction.getAllowanceInfo(walletProvider, {safeAddress: SAFE_ADDRESS, delegateAddress: walletAddress}));
    //await new Promise(resolve => setTimeout(resolve, 10000));
    //console.log("Safe withdraw allowance: ", await safeApiAction.withdrawAllowance(walletProvider, {safeAddress: SAFE_ADDRESS, delegateAddress: walletAddress, tokenAddress: USDC_ADDRESS, amount: "0.0001"}));
    //exit(0);

    const tools = getVercelAITools(agentKit);
    
    
    return { tools, agentKit };
  } catch (error) {
    console.error("Failed to initialize agent:", error);
    throw error;
  }
}

/**
 * Get only DeFiLlama tools from the full set of tools
 * 
 * @returns Object containing only DeFiLlama tools
 */
export function getDefiLlamaToolsOnly(allTools: any) {
  const defiLlamaTools: Record<string, any> = {};
  
  // Filter only DeFiLlama tools by checking tool names
  Object.entries(allTools).forEach(([key, value]) => {
    if (key.startsWith('DefiLlamaActionProvider_get_protocol')) {
      defiLlamaTools[key] = value;
    }
  });
  
  return defiLlamaTools;
}

/**
 * Fetches the featured market from the API
 * 
 * @returns Promise that resolves to the featured market data
 */
async function getFeaturedMarket() {
  const response = await fetch('https://true-cast.vercel.app/api/market');
  if (!response.ok) {
    throw new Error(`Failed to fetch featured market: ${response.statusText}`);
  }
  const data = await response.json();
  return data.featuredMarket;
}

/**
 * Run the agent with direct search functionality
 * 
 * @returns Promise that resolves when search is complete
 */
async function run() {
  console.log("Starting TrueCast Agent...");
  console.log(`Social media posts ${DISABLE_POSTS ? 'disabled' : 'enabled'}`);
  
  // Fetch the featured market
  const featuredMarket = await getFeaturedMarket();
  const marketAddress = featuredMarket.marketAddress;
  
  const { agentKit, tools } = await initializeAgent();
  const actions = agentKit.getActions();
  //console.log("Tools: ", tools);
    
  // Direct tool call to get market details and feed to agent
  console.log("\nFetching market details...\n");    
  const getMarketDetailsAction = actions.find(action => action.name === "TrueMarketsActionProvider_get_market_details");
  if (!getMarketDetailsAction) throw new Error("TrueMarketsActionProvider_get_market_details action not found");
  const marketDetails = await getMarketDetailsAction.invoke({marketAddress});
  const marketInfo = JSON.parse(JSON.stringify(marketDetails));
  console.log("Market Question: ", marketInfo.question);

  // Generate market image using API
  const baseUrl = process.env.NEXT_PUBLIC_URL;
  const yesPrice = marketInfo.prices.yes;
  const noPrice = marketInfo.prices.no;
  const imageUrl = `${baseUrl}/api/og/market?question=${encodeURIComponent(marketInfo.question)}&yesPrice=${encodeURIComponent(yesPrice)}&noPrice=${encodeURIComponent(noPrice)}`;
  console.log("Generated market image URL:", imageUrl);
  
  // Fetch the image
  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) {
    throw new Error(`Failed to generate image: ${imageResponse.statusText}`);
  }
  
  // Save the image locally
  const buffer = await imageResponse.arrayBuffer();
  const fileName = `market-${Date.now()}.png`;
  fs.writeFileSync(fileName, Buffer.from(buffer));
  console.log(`Market image saved as ${fileName}`);

  // Categorize the market 
  const categorizeMarket = await generateObject({
    model: openai.responses('gpt-4o-mini'),
    schema: z.object({
      category: z.string().describe('Category of the market'),
    }),
    prompt: `Categorize the prediction market ${marketInfo.question} into one of the following categories:
    - Crypto
    - Politics
    - Sports
    - Entertainment
    - Technology
    - Finance
    - Other
    `,
  });
  console.log("Market Category: ", categorizeMarket.object.category);

  // Perform web search to get additional info about the market
  const webSearch = await generateText({
    model: openai.responses('gpt-4.1'),
    prompt: `Prediction market question: ${marketInfo.question} with rules: ${marketInfo.additionalInfo}. 
    You have to make a binary prediction about the question, either yes or no. 
    You also have to provide your estimate of the probability of the question to resolve in yes with your confidence level.
    Research relevant info using web search, take them into consideration but do not take them at face value. 
    Make up your own mind.
    `,
    tools: {
      web_search_preview: openai.tools.webSearchPreview({
        searchContextSize: 'high',
      }),
    },
    maxSteps: 5,
  });
  console.log(webSearch.text);
  console.log(webSearch.sources);

  // If crypto related, use defillama action to get additional info about the project in question. 
  // if (categorizeMarket.object.category === "Crypto") {
  //   const getDefiLlamaDetailsAction = actions.find(action => action.name === "DefiLlamaActionProvider_find_protocol");
  //   if (!getDefiLlamaDetailsAction) throw new Error("DefiLlamaActionProvider_find_protocol action not found");
  //   const defiLlamaDetails = await getDefiLlamaDetailsAction.invoke({query: "5317"});
  //   const defiLlamaInfo = JSON.parse(JSON.stringify(defiLlamaDetails));
  //   console.log("DefiLlama Info: ", defiLlamaDetails);
  // }

  // Generate structured output from agent with prediction and social media post
  const response = await generateObject({
    model: openai.responses('gpt-4.1'),
    schema: z.object({
      yes: z.number().describe('Probability percentage of for market question to resolve in yes'),
      conf: z.number().describe('Confidence level of your prediction'),
      explanation: z.string().describe('Social media post with maximal 255 characters. In first person, no hashtags, no hyphens, no delves, no links, no mentions.'),
      takeBet: z.boolean().describe('Whether to take a bet on your prediction'),
    }),
    prompt: `Make a final prediction for the binary market question. 
    Current market odds: ${marketInfo.prices.yes} (Yes) and ${marketInfo.prices.no} (No).
    Do you think the market is overpriced or underpriced?
    Depending on the confidence level of your prediction and considering the market odds,
    decide whether to take a bet on your prediction or not.
    Then write a social media post advertising the market. 
    It should include your prediction, reasoning and key insights of your analysis. 
    It should be engaging and go viral.
    Subtly invite the audience to make their own prediction without explicitly saying so,
    instead say something like "What's your guess?" or "What's your prediction?".
    `,
    providerOptions: {
      openai: {
        previousResponseId: webSearch.providerMetadata?.openai.responseId as string,
        //reasoningEffort: 'high',
      },
    },
  });
  console.log(response.object);

  // Post to social media unless disabled
  if (!DISABLE_POSTS) {
    // Post to Farcaster
    const farcaster = farcasterActionProvider();

    // Generate share URL for embedding in Farcaster post
    const shareUrl = `${baseUrl}/api/frame/share?question=${encodeURIComponent(marketInfo.question)}&yesPrice=${encodeURIComponent(marketInfo.prices.yes)}&noPrice=${encodeURIComponent(marketInfo.prices.no)}&marketAddress=${marketAddress}`;
    console.log("Share URL:", shareUrl);
    
    const farcasterPost = await farcaster.postCast({
      castText: response.object.explanation,
      embeds: [{
        url: shareUrl
      }]
    });
    console.log("Farcaster post:", farcasterPost);
    
    // Extract the cast hash from Farcaster response
    let farcasterResponse;
    if (typeof farcasterPost === 'string') {
      // Remove the prefix 
      const jsonStr = farcasterPost.replace('Successfully posted cast to Farcaster:', '').trim();
      farcasterResponse = JSON.parse(jsonStr);
    } else {
      farcasterResponse = farcasterPost;
    }
    
    const castHash = farcasterResponse?.cast?.hash;
    if (castHash) {
      console.log("Farcaster cast hash:", castHash);
    } else {
      console.warn("Could not extract cast hash from Farcaster response");
    }

    // Post to Twitter
    const twitter = twitterActionProvider();
    const mediaId = await twitter.uploadMedia({
      filePath: fileName
    });
    console.log("Media ID: ", mediaId);
    // Extract just the numeric ID from the response
    const mediaIdMatch = mediaId.match(/Successfully uploaded media to Twitter: (\d+)/);
    const mediaIdNumber = mediaIdMatch ? mediaIdMatch[1] : null;
    
    if (!mediaIdNumber) {
      throw new Error("Failed to extract media ID from upload response");
    }

    // Append Warpcast conversation URL to tweet text
    const warpcastUrl = castHash ? `\n\n👉 https://warpcast.com/~/conversations/${castHash}` : '';
    const tweetText = response.object.explanation + warpcastUrl;

    const twitterPost = await twitter.postTweet({
      tweet: tweetText,
      mediaIds: [mediaIdNumber]
    });
    console.log("Twitter post:", twitterPost);

  } else {
    console.log("Skipping social media posts due to --no-posts flag");
  }
}

/**
 * Main entry point for the TrueCast agent
 *
 * @throws Error if execution fails
 */
async function main() {
  try {
    await run();
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

main();