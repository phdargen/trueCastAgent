
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
  import { generateId, Message, streamText, ToolSet, generateText, generateObject, Output } from "ai";
  import * as dotenv from "dotenv";
  import * as readline from "readline";
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
  
  // Add this right after imports and before any other code
  validateEnvironment();
  
  // Configure a file to persist the agent's CDP MPC Wallet Data
  const WALLET_DATA_FILE = "wallet_data.txt";
  
  const system = `You are a helpful agent that can interact onchain using the Coinbase Developer Platform AgentKit. You are
  empowered to interact onchain using your tools. You can also search the web to provide up-to-date information.
  If you ever need funds, you can request them from the
  faucet if you are on network ID 'base-sepolia'. If not, you can provide your wallet details and request
  funds from the user. Before executing your first action, get the wallet details to see what network
  you're on. If there is a 5XX (internal) HTTP error code, ask the user to try again later. If someone
  asks you to do something you can't do with your currently available tools, you must say so, and
  encourage them to implement it themselves using the CDP SDK + Agentkit, recommend they go to
  docs.cdp.coinbase.com for more information. Be concise and helpful with your responses. Refrain from
  restating your tools' descriptions unless it is explicitly requested.`;
  
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
   * Run the chatbot in interactive mode
   *
   * @param tools - Record of Vercel AI SDK tools from AgentKit
   * @returns Promise that resolves when chat session ends
   */
  async function runChatMode(tools: ToolSet) {
    console.log("Starting chat mode... Type 'exit' to end.");
  
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  
    const question = (prompt: string): Promise<string> =>
      new Promise(resolve => rl.question(prompt, resolve));
  
    const messages: Message[] = [];
    let running = true;
  
    try {
      while (running) {
        const userInput = await question("\nPrompt: ");
  
        if (userInput.toLowerCase() === "exit") {
          running = false;
          continue;
        }
  
        messages.push({ id: generateId(), role: "user", content: userInput });
  
        const stream = streamText({
          model: openai("gpt-4o-mini"),
          messages,
          tools,
          system,
          maxSteps: 10,
        });
  
        let assistantMessage = "";
        for await (const chunk of stream.textStream) {
          process.stdout.write(chunk);
          assistantMessage += chunk;
        }
        console.log("\n-------------------");
  
        messages.push({ id: generateId(), role: "assistant", content: assistantMessage });
      }
    } catch (error) {
      console.error("Error:", error);
    } finally {
      rl.close();
    }
  }
  
  /**
   * Run the agent autonomously with specified intervals
   *
   * @param tools - Record of Vercel AI SDK tools from AgentKit
   * @param interval - Time interval between actions in seconds
   */
  async function runAutonomousMode(tools: ToolSet, interval = 10) {
    console.log("Starting autonomous mode...");
  
    const messages: Message[] = [];
  
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        const thought =
          "Be creative and do something interesting on the blockchain. " +
          "You can also use web search to find relevant information. " +
          "Choose an action or set of actions and execute it that highlights your abilities.";
  
        messages.push({ id: generateId(), role: "user", content: thought });
  
        const stream = streamText({
          model: openai("gpt-4o-mini"),
          messages,
          tools,
          system,
          maxSteps: 10,
        });
  
        let assistantMessage = "";
        for await (const chunk of stream.textStream) {
          process.stdout.write(chunk);
          assistantMessage += chunk;
        }
        console.log("\n-------------------");
  
        messages.push({ id: generateId(), role: "assistant", content: assistantMessage });
  
        await new Promise(resolve => setTimeout(resolve, interval * 1000));
      } catch (error) {
        if (error instanceof Error) {
          console.error("Error:", error.message);
        }
        process.exit(1);
      }
    }
  }
  
  /**
   * Choose whether to run in autonomous or chat mode based on user input
   *
   * @returns Selected mode
   */
  async function chooseMode(): Promise<"chat" | "auto" | "object" | "search"> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  
    const question = (prompt: string): Promise<string> =>
      new Promise(resolve => rl.question(prompt, resolve));
  
    // eslint-disable-next-line no-constant-condition
    while (true) {
      console.log("\nAvailable modes:");
      console.log("1. chat    - Interactive chat mode");
      console.log("2. auto    - Autonomous action mode");
      console.log("3. object  - Generate structured objects");
      console.log("4. search  - Direct web search mode");
  
      const choice = (await question("\nChoose a mode (enter number or name): "))
        .toLowerCase()
        .trim();
  
      if (choice === "1" || choice === "chat") {
        rl.close();
        return "chat";
      } else if (choice === "2" || choice === "auto") {
        rl.close();
        return "auto";
      } else if (choice === "3" || choice === "object") {
        rl.close();
        return "object";
      } else if (choice === "4" || choice === "search") {
        rl.close();
        return "search";
      }
      console.log("Invalid choice. Please try again.");
    }
  }
  
  /**
   * Run the object generation mode
   * 
   * Generates structured objects based on user prompts
   */
  async function runObjectMode() {
    console.log("Starting object generation mode... Type 'exit' to end.");
  
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  
    const question = (prompt: string): Promise<string> =>
      new Promise(resolve => rl.question(prompt, resolve));
  
    let running = true;
    
    const { tools } = await initializeAgent();
  
    try {
      while (running) {
        const userInput = await question("\nPrompt: ");
  
        if (userInput.toLowerCase() === "exit") {
          running = false;
          continue;
        }
  
        const { experimental_output } = await generateText({
          model: openai("gpt-4o"),
          tools,
          system: "Answer binary yes/no questions with a probability percentage. Research relevant info using web search, take them into consideration but do not take them at face value. Make up your own mind. ",
          prompt: userInput,
          //   experimental_output: Output.object({
          //   schema: z.object({
          //     probability: z.number().min(0).max(100).describe("Probability of 'yes' answer as a percentage (0-100)"),
          //     explanation: z.string().describe("Brief explanation for the probability assessment"),
          //   }),
          // }),
        });
  
        console.log(JSON.stringify(experimental_output, null, 2));
        console.log("\n-------------------");
      }
    } catch (error) {
      console.error("Error:", error);
    } finally {
      rl.close();
    }
  }
  
  /**
   * Run the search mode
   * 
   * Directly runs a web search without user input
   */
  async function runSearchMode() {
    console.log("Starting direct search mode...");
    
    try {
      const result1 = await generateText({
        model: openai.responses('gpt-4o'),
        prompt: 'Whats the probability of Will the #1 Box Office Film of 2025 Be an Animated Movie?. Research relevant info using web search to find odds on Polymarket, take them into consideration but don’t take them at face value. Make up your own mind. Output should be estimated probability for yes and your confidence level. Then 2 sentences to explain.',
        tools: {
          web_search_preview: openai.tools.webSearchPreview({
            searchContextSize: 'high',
            // userLocation: {
            //   type: 'approximate',
            //   city: 'San Francisco',
            //   region: 'California',
            // },
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
          explanation: z.string().describe('Brief explanation'),
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
    }
  }
  
  /**
   * Main entry point for the chatbot application
   * Initializes the agent and starts chat mode
   *
   * @throws Error if initialization or chat mode fails
   */
  async function main() {
    try {
      const { tools } = await initializeAgent();
      const mode = await chooseMode();
      if (mode === "chat") {
        await runChatMode(tools);
      } else if (mode === "auto") {
        await runAutonomousMode(tools);
      } else if (mode === "object") {
        await runObjectMode();
      } else if (mode === "search") {
        await runSearchMode();
      }
    } catch (error) {
      console.error("Error:", error);
      process.exit(1);
    }
  }
  
  if (require.main === module) {
    console.log("Starting Agent...");
    main().catch(error => {
      console.error("Fatal error:", error);
      process.exit(1);
    });
  }
  
  