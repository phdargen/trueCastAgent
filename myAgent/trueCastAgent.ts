import * as dotenv from "dotenv";
dotenv.config();

import {
  AgentKit,
  CdpWalletProvider,
  erc20ActionProvider,
  defillamaActionProvider,
  truemarketsActionProvider,
  farcasterActionProvider,
  twitterActionProvider,
  safeApiActionProvider,
  zeroXActionProvider,
  zoraActionProvider
} from "@coinbase/agentkit";
import type { SwapTransaction } from "./types";
import { recordTradeTransaction } from "./redisClient";

import { getVercelAITools } from "@coinbase/agentkit-vercel-ai-sdk";
import { openai } from "@ai-sdk/openai";
import { generateText, generateObject } from "ai";

import * as fs from "fs";
import { z } from "zod";
import { formatEther, parseUnits } from "viem";

const USDC_ADDRESS = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";

// Settings
const DISABLE_POSTS = process.env.DISABLE_POSTS === 'true';
const DONT_BET = process.env.DONT_BET === 'true';

const BET_AMOUNT = process.env.BET_AMOUNT ? parseFloat(process.env.BET_AMOUNT) : 1; // defaults to 1 USDC
const MAX_PRICE_IMPACT = process.env.MAX_PRICE_IMPACT ? parseFloat(process.env.MAX_PRICE_IMPACT) : 5; // defaults to 5%

/**
 * Validates that required environment variables are set
 *
 * @throws {Error} - If required environment variables are missing
 * @returns {void}
 */
function validateEnvironment(): void {
  const missingVars: string[] = [];

  // Check required variables
  const requiredVars = ["OPENAI_API_KEY", "CDP_API_KEY_NAME", "CDP_API_KEY_PRIVATE_KEY", "NEXT_PUBLIC_URL", "REDIS_URL", "REDIS_TOKEN", "PINATA_JWT"];
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

    const tools = getVercelAITools(agentKit);

    return { walletProvider, tools, agentKit };
  } catch (error) {
    console.error("Failed to initialize agent:", error);
    throw error;
  }
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
  console.log(`Bets ${DONT_BET ? 'disabled' : 'enabled'}`);

  // Fetch the featured market
  const featuredMarket = await getFeaturedMarket();
  const marketAddress = featuredMarket.marketAddress;
  
  const { walletProvider, agentKit, tools } = await initializeAgent();
  const actions = agentKit.getActions();
  const walletAddress = await walletProvider.getAddress();
  console.log("Wallet Address: ", walletAddress);
  console.log("Wallet Balance: ", formatEther(await walletProvider.getBalance()), " ETH");

  //console.log("Tools: ", tools);
    
  // Direct tool call to get market details and feed to agent
  console.log("\nFetching market details...\n");    
  const trueMarketsAction = truemarketsActionProvider({RPC_URL: process.env.RPC_URL});
  const marketDetails = await trueMarketsAction.getMarketDetails(walletProvider, {marketAddress});
  
  // Ensure marketDetails is properly parsed
  let marketInfo;
  try {
    // If marketDetails is already an object, don't parse it
    marketInfo = typeof marketDetails === 'string' ? JSON.parse(marketDetails) : marketDetails;
    
    // Validate that the required properties exist
    if (!marketInfo || !marketInfo.question || !marketInfo.prices) {
      throw new Error(`Invalid market data: ${JSON.stringify(marketInfo)}`);
    }
    
    console.log("Market Info: ", JSON.stringify(marketInfo, null, 2));
    console.log("Market Question: ", marketInfo.question);
  } catch (error) {
    console.error("Failed to parse market details:", error);
    console.error("Raw market details:", marketDetails);
    process.exit(1);
  }

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
  //if (categorizeMarket.object.category === "Crypto") {
    // const defillamaAction = defillamaActionProvider();
    // const defiLlamaDetails = await defillamaAction.searchProtocols({query: "Uniswap"});
    // const defiLlamaInfo = JSON.parse(JSON.stringify(defiLlamaDetails));
    // console.log("DefiLlama Info: ", defiLlamaDetails);
  //}

  // Generate structured output from agent with prediction and social media post
  const response = await generateObject({
    model: openai.responses('o4-mini'),
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
        reasoningEffort: 'high',
      },
    },
  });
  console.log(response.object);

  // Social media posts
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
    const jsonStr = farcasterPost.replace('Successfully posted cast to Farcaster:', '').trim();
    const farcasterResponse = JSON.parse(jsonStr);
    
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
    const mediaIdNumber = mediaIdMatch && mediaIdMatch[1] ? mediaIdMatch[1] : null;
    
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

    // Post to Zora
    const zora = zoraActionProvider({
      pinataJwt: process.env.PINATA_JWT,
    });
    const zoraPost = await zora.createCoin(walletProvider, {
      name: marketInfo.question,
      symbol: "TrueCast",
      description: tweetText,
      image: fileName,
      payoutRecipient: walletAddress,
      platformReferrer: walletAddress,
      initialPurchase: "0",
      category: "news",
    });
    console.log("Zora post:", zoraPost);
  } else {
    console.log("Skipping social media posts due to --no-posts flag");
  }

  // Bet on market
  if (!DONT_BET && response.object.takeBet){
    console.log(`Taking a bet on ${response.object.yes > 50 ? "Yes" : "No"}`);
    const buyToken = response.object.yes > 50 ? marketInfo.tokens.yes.tokenAddress : marketInfo.tokens.no.tokenAddress;

    // Check balance
    const erc20Action = erc20ActionProvider();
    const usdcBalanceResponse = await erc20Action.getBalance(walletProvider, {contractAddress: USDC_ADDRESS});
    const balanceMatch = usdcBalanceResponse.match(/Balance of .* is ([\d.]+)/);
    const usdcBalance = balanceMatch ? balanceMatch[1] : "0";
    console.log("USDC Balance: ", usdcBalance);

    // If not enough USDC, withdraw from safe allowance
    if (parseFloat(usdcBalance) < BET_AMOUNT && process.env.SAFE_ADDRESS) {
      console.log("Not enough USDC to take a bet, withdrawing 10 USDC from safe allowance ...");
      const safeApiAction = safeApiActionProvider({ networkId: process.env.NETWORK_ID});
      //console.log("Safe allowance info: ", await safeApiAction.getAllowanceInfo(walletProvider, {safeAddress: SAFE_ADDRESS, delegateAddress: address}));
      await new Promise(resolve => setTimeout(resolve, 10000)); // Wait for 10 seconds to avoid RPC rate limit
      console.log(await safeApiAction.withdrawAllowance(walletProvider, {safeAddress: process.env.SAFE_ADDRESS, delegateAddress: walletAddress, tokenAddress: USDC_ADDRESS, amount: "10"}));
    }

    // Get price quote
    const zeroXAction = zeroXActionProvider({apiKey: process.env.ZEROX_API_KEY});
    const priceQuote = await zeroXAction.getSwapPrice(walletProvider, {
      sellToken: USDC_ADDRESS,
      sellAmount: BET_AMOUNT.toString(), 
      buyToken: buyToken,
      slippageBps: 100,
    });
    console.log("Price Quote: ", priceQuote);

    // Check price impact
    const marketPrice = response.object.yes > 50 ? marketInfo.prices.yes : marketInfo.prices.no;
    const priceQuoteData = JSON.parse(priceQuote);
    const quotePrice = parseFloat(priceQuoteData.priceOfBuyTokenInSellToken);
    const priceImpact = Math.abs((quotePrice - marketPrice) / marketPrice * 100);
    
    if (priceImpact > MAX_PRICE_IMPACT) {
      console.warn(`Warning: High price impact detected (${priceImpact.toFixed(2)}%). Market price: ${marketPrice}, Quote price: ${quotePrice}`);
      process.exit(0);
    }

    if(priceQuoteData.issues.balance !== null){
      console.warn(`Warning: Insufficient balance for swap. ${JSON.stringify(priceQuoteData.issues.balance)}`);
      process.exit(0);
    }

    // Execute swap
    await new Promise(resolve => setTimeout(resolve, 10000)); // Wait for 10 seconds to avoid RPC rate limit
    const tradeResponse = await zeroXAction.executeSwap(walletProvider, {
      sellToken: USDC_ADDRESS,
      sellAmount: BET_AMOUNT.toString(), 
      buyToken: buyToken,
      slippageBps: 100,
    });
    console.log("Trade Response: ", tradeResponse);
    const tradeResponseData = JSON.parse(tradeResponse);

    // Record trade in Redis DB
    if (tradeResponseData.success) {
      const swapTransaction: SwapTransaction = {
        txHash: tradeResponseData.swapTxHash,
        tokenType: response.object.yes > 50 ? 'YES' : 'NO',
        marketAddress: marketAddress,
        marketQuestion: marketInfo.question,
        timestamp: Date.now(),
        fid: Number(process.env.AGENT_FID),
        pfpURL: process.env.AGENT_PFP_URL,
        username: process.env.AGENT_USERNAME,
        address: walletAddress,
        buyAmount: parseUnits(tradeResponseData.buyAmount, 18).toString(),
        buyToken: tradeResponseData.buyToken,
        sellAmount: parseUnits(tradeResponseData.sellAmount, 6).toString(),
        sellToken: tradeResponseData.sellToken,
        totalNetworkFee: parseUnits(tradeResponseData.totalNetworkFeeInETH, 18).toString(),
        yesTokenPrice: marketInfo.prices.yes,
        noTokenPrice: marketInfo.prices.no
      };

      await recordTradeTransaction(swapTransaction);
    }

  }
  else {
    console.log("Skipping bets due to --no-bet flag");
  }
  process.exit(0);
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