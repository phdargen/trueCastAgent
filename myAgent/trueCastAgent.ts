import {
  AgentKit,
  CdpWalletProvider,
  defillamaActionProvider,
  truemarketsActionProvider,
  farcasterActionProvider,
  twitterActionProvider
} from "@coinbase/agentkit";
import { getVercelAITools } from "@coinbase/agentkit-vercel-ai-sdk";
import { openai } from "@ai-sdk/openai";
import { generateText, generateObject } from "ai";
import * as dotenv from "dotenv";
import * as fs from "fs";
import { z } from "zod";

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

// Configure a file to persist the agent's CDP MPC Wallet Data
const WALLET_DATA_FILE = "wallet_data.txt";

/**
 * Initialize the agent with CDP Agentkit and Vercel AI SDK tools
 *
 * @returns Object containing initialized tools
 * @throws Error if initialization fails
 */
export async function initializeAgent() {
  try {
    let walletDataStr: string | null = null;

    // Read existing wallet data if available
    if (fs.existsSync(WALLET_DATA_FILE)) {
      try {
        walletDataStr = fs.readFileSync(WALLET_DATA_FILE, "utf8");
      } catch (error) {
        console.error("Error reading wallet data:", error);
        // Continue without wallet data
      }
    }

    const walletProvider = await CdpWalletProvider.configureWithWallet({
      apiKeyName: process.env.CDP_API_KEY_NAME,
      apiKeyPrivateKey: process.env.CDP_API_KEY_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      cdpWalletData: walletDataStr || undefined,
      networkId: process.env.NETWORK_ID || "base-sepolia",
    });

    const agentKit = await AgentKit.from({
      walletProvider,
      actionProviders: [
        defillamaActionProvider(),
        truemarketsActionProvider({
          RPC_URL: process.env.RPC_URL,
        }),
      ],
    });

    const tools = getVercelAITools(agentKit)
    
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
 * Run the agent with direct search functionality
 * 
 * @returns Promise that resolves when search is complete
 */
async function run() {

  console.log("Starting TrueCast Agent...");
  const marketAddress = "0x2a1cf14e881983298195e60dfa2c227c99588e2f"; // Will Fluid Overtake Uniswap in DEX Volume in 2025?
  // const marketAddress = "0x71456ed788a71581c828e7848082a6d1dad50879"; // Will the #1 Box Office Film of 2025 Be an Animated Movie?

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
    - Other
    `,
  });
  console.log("Market Category: ", categorizeMarket.object.category);

  // Perform web search to get additional info about the market
  const webSearch = await generateText({
    model: openai.responses('gpt-4o'),
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
    model: openai.responses('o3-mini'),
    schema: z.object({
      yes: z.number().describe('Probability percentage of for market question to resolve in yes'),
      conf: z.number().describe('Confidence level of your prediction'),
      explanation: z.string().describe('Social media post with maximal 280 characters. In first person, no hashtags, no hyphens, no delves, no links, no mentions.'),
    }),
    prompt: `Make a final prediction for the binary market question. 
    Current market odds: ${marketInfo.prices.yes} (Yes) and ${marketInfo.prices.no} (No).
    Do you think the market is overpriced or underpriced?
    Then write a social media post advertising the market. 
    It should include your prediction and reasoning. 
    It should be engaging and go viral.
    Subtly invite the audience to make their own prediction without explicitly saying so,
    instead say something like "What's your guess?" or "What's your prediction?".
    `,
    providerOptions: {
      openai: {
        previousResponseId: webSearch.providerMetadata?.openai.responseId as string,
        reasoningEffort: 'low',
      },
    },
  });
  console.log(response.object);

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

  const twitterPost = await twitter.postTweet({
    tweet: response.object.explanation,
    mediaIds: [mediaIdNumber]
  });
  console.log(twitterPost);

  // Generate share URL
  const shareUrl = `${baseUrl}/api/frame/share?question=${encodeURIComponent(marketInfo.question)}&yesPrice=${encodeURIComponent(marketInfo.prices.yes)}&noPrice=${encodeURIComponent(marketInfo.prices.no)}&marketAddress=${marketAddress}`;
  console.log("Share URL:", shareUrl);
  
  const farcaster = farcasterActionProvider();
  const farcasterPost = await farcaster.postCast({
    castText: response.object.explanation,
    embeds: [{
      url: shareUrl
    }]
  });
  // const farcasterPostJson = JSON.parse(JSON.stringify(farcasterPost));
  console.log(farcasterPost);

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