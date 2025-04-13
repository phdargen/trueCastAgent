import {
  AgentKit,
  cdpApiActionProvider,
  erc721ActionProvider,
  pythActionProvider,
  walletActionProvider,
  CdpWalletProvider,
  defillamaActionProvider,
  messariActionProvider,
  truemarketsActionProvider
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
  const requiredVars = ["OPENAI_API_KEY", "CDP_API_KEY_NAME", "CDP_API_KEY_PRIVATE_KEY"];
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

  // Warn about optional NETWORK_ID
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
async function initializeAgent() {
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
        cdpApiActionProvider({
          apiKeyName: process.env.CDP_API_KEY_NAME,
          apiKeyPrivateKey: process.env.CDP_API_KEY_PRIVATE_KEY,
        }),
        erc721ActionProvider(),
        pythActionProvider(),
        walletActionProvider(),
        defillamaActionProvider(),
        truemarketsActionProvider({
          RPC_URL: process.env.RPC_URL,
        }),
      ],
    });

    // Get AgentKit tools and add web search
    const tools = {
      ...getVercelAITools(agentKit),
      web_search_preview: openai.tools.webSearchPreview(),
    };
    
    return { tools };
  } catch (error) {
    console.error("Failed to initialize agent:", error);
    throw error;
  }
}

/**
 * Run the agent with direct search functionality
 * 
 * @returns Promise that resolves when search is complete
 */
async function run() {
  console.log("Starting TrueCast Agent...");
  
  try {
    const result1 = await generateText({
      model: openai.responses('gpt-4o'),
      prompt: 'Whats the probability of Will the #1 Box Office Film of 2025 Be an Animated Movie?. Research relevant info using web search to find odds on Polymarket, take them into consideration but do not take them at face value. Make up your own mind. Output should be estimated probability for yes and your confidence level. Then 2 sentences to explain.',
      tools: {
        web_search_preview: openai.tools.webSearchPreview({
          searchContextSize: 'high',
        }),
      },
      maxSteps: 5,
    });

    console.log("\nSearch Results:\n");
    console.log(result1.text);
    console.log("\nSources:\n");
    console.log(result1.sources);
    console.log("\n-------------------");

    const result2 = await generateObject({
      model: openai.responses('gpt-4o-mini'),
      schema: z.object({
        yes: z.number().describe('Extracted probability percentage of yes/winning'),
        conf: z.number().describe('Confidence level'),
        explanation: z.string().describe('Write an enaging social media post with your prediction and reasoning with maximal 280 characters'),
      }),
      prompt: 'Extract the probability and confidence from this analysis',
      providerOptions: {
        openai: {
          previousResponseId: result1.providerMetadata?.openai.responseId as string,
        },
      },
    });

    console.log("\nExtracted Data:\n");
    console.log(result2.object);
    console.log("\n-------------------");

  } catch (error) {
    console.error("Error during search:", error);
    process.exit(1);
  }
}

/**
 * Main entry point for the TrueCast agent
 * Runs the search functionality directly
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