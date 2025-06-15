/**
 * Neynar Data Source
 * Uses AgentKit with x402ActionProvider to fetch Farcaster cast conversation summaries
 */

import { CdpWalletProvider, x402ActionProvider } from "@coinbase/agentkit";
import {
  IDataSource,
  DataSourceResult,
  DataSourceOptions,
  createSuccessResult,
  createErrorResult,
} from "./types";

// Define the Neynar API response type
interface NeynarApiResponse {
  summary?: {
    text: string;
  };
}

// Define nested response structure
interface NestedNeynarApiResponse {
  data: {
    summary: {
      text: string;
    };
  };
}

// Define the x402 wrapped response type
interface X402Response {
  success: boolean;
  data: NeynarApiResponse;
  status: number;
  url: string;
  method: string;
  paymentResponse?: {
    network: string;
    payer: string;
    success: boolean;
    transaction: string;
  };
}

/**
 * Neynar Data Source implementation
 */
export class NeynarDataSource implements IDataSource {
  name = "neynar";
  description =
    "Farcaster cast conversation summaries from Neynar API. Requires a castHash parameter to fetch conversation data. Use this when you have a specific Farcaster cast hash and need to analyze the conversation around it.";

  private walletProvider: CdpWalletProvider | null = null;

  /**
   * Initializes the NeynarDataSource instance
   * Creates a new instance of the data source
   */
  constructor() {
    // Wallet provider will be initialized lazily when needed for x402 fallback
  }

  /**
   * Fetches Farcaster cast conversation data from Neynar API using AgentKit with x402ActionProvider
   *
   * @param prompt - The search query prompt
   * @param options - Optional parameters including castHash (required for this data source)
   * @returns Promise resolving to data source result
   */
  async fetch(prompt: string, options?: DataSourceOptions): Promise<DataSourceResult> {
    try {
      // Check if castHash is provided
      if (!options?.castHash) {
        return createErrorResult(
          this.name,
          "castHash is required for Neynar data source but was not provided",
        );
      }

      console.log("Using Neynar for Farcaster data with castHash:", options.castHash);

      const neynarApiUrl = `https://api.neynar.com/v2/farcaster/cast/conversation/summary/?limit=20&identifier=${options.castHash}`;

      let apiResponse: NeynarApiResponse;

      // Check if NEYNAR_API_KEY is available
      if (process.env.NEYNAR_API_KEY) {
        console.log("Using direct Neynar API call with API key");

        // Use direct API call with API key
        const fetchOptions = {
          method: "GET",
          headers: {
            "x-api-key": process.env.NEYNAR_API_KEY,
          },
        };

        const response = await fetch(neynarApiUrl, fetchOptions);

        if (!response.ok) {
          throw new Error(`Neynar API returned ${response.status}: ${response.statusText}`);
        }

        apiResponse = (await response.json()) as NeynarApiResponse;
      } else {
        console.log("NEYNAR_API_KEY not found, falling back to x402 paid request");

        // Ensure wallet provider is initialized for x402 fallback
        if (!this.walletProvider) {
          await this.initializeWalletProvider();
          if (!this.walletProvider) {
            return createErrorResult(
              this.name,
              "Failed to initialize CDP wallet provider and no NEYNAR_API_KEY provided",
            );
          }
        }

        // Make paid request using x402 provider
        const x402Provider = x402ActionProvider();
        const rawX402Response = await x402Provider.paidRequest(this.walletProvider, {
          url: neynarApiUrl,
          method: "GET",
        });

        // Handle different possible response formats
        let x402Response: X402Response;
        if (typeof rawX402Response === "string") {
          x402Response = JSON.parse(rawX402Response) as X402Response;
        } else {
          x402Response = rawX402Response as X402Response;
        }

        // Validate x402 response structure
        if (!x402Response.data) {
          return createErrorResult(
            this.name,
            "Invalid x402 response structure: missing data property",
          );
        }

        // Log payment response for tracking
        if (x402Response.paymentResponse) {
          console.log("Payment successful:", {
            network: x402Response.paymentResponse.network,
            transaction: x402Response.paymentResponse.transaction,
            payer: x402Response.paymentResponse.payer,
          });
        }

        // Extract the actual API response from the x402 wrapper
        apiResponse = x402Response.data;
      }

      console.log("Extracted Neynar API response:", apiResponse);

      // Extract summary text from response with fallback logic
      let summaryText = apiResponse?.summary?.text;

      // Additional fallback checks for different response structures
      if (!summaryText && (apiResponse as NestedNeynarApiResponse)?.data?.summary?.text) {
        summaryText = (apiResponse as NestedNeynarApiResponse).data.summary.text;
      }

      if (!summaryText) {
        return createErrorResult(this.name, "No summary text found in Neynar API response");
      }

      console.log("Retrieved conversation summary:", summaryText.substring(0, 100) + "...");

      const data = {
        query: prompt,
        castHash: options.castHash,
        result: summaryText,
      };

      return createSuccessResult(this.name, data);
    } catch (error) {
      console.error(`Neynar data source error:`, error);
      return createErrorResult(
        this.name,
        `Neynar API error: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Initializes the CDP wallet provider with configuration from environment variables
   * This is used for making paid requests through x402 when NEYNAR_API_KEY is not available
   */
  private async initializeWalletProvider() {
    try {
      // Configure CDP Wallet Provider
      this.walletProvider = await CdpWalletProvider.configureWithWallet({
        apiKeyId: process.env.CDP_API_KEY_ID,
        apiKeySecret: process.env.CDP_API_KEY_SECRET,
        mnemonicPhrase: process.env.MNEMONIC_PHRASE,
        networkId: "base-mainnet",
      });
    } catch (error) {
      console.error("Failed to initialize CDP wallet provider:", error);
    }
  }
}
