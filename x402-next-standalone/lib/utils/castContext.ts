/**
 * Cast Context Fetcher Utility
 * Fetches Farcaster cast conversation summaries from Neynar API
 */

import { CdpWalletProvider, x402ActionProvider } from "@coinbase/agentkit";

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

let walletProvider: CdpWalletProvider | null = null;

/**
 * Initializes the CDP wallet provider with configuration from environment variables
 * This is used for making paid requests through x402 when NEYNAR_API_KEY is not available
 */
async function initializeWalletProvider(): Promise<void> {
  try {
    // Configure CDP Wallet Provider
    walletProvider = await CdpWalletProvider.configureWithWallet({
      apiKeyId: process.env.CDP_API_KEY_ID,
      apiKeySecret: process.env.CDP_API_KEY_SECRET,
      mnemonicPhrase: process.env.MNEMONIC_PHRASE,
      networkId: "base-mainnet",
    });
  } catch (error) {
    console.error("Failed to initialize CDP wallet provider:", error);
  }
}

/**
 * Fetches Farcaster cast conversation context from Neynar API
 *
 * @param castHash - The Farcaster cast hash
 * @returns Promise resolving to the conversation summary text or null if failed
 */
export async function fetchCastContext(castHash: string): Promise<string | null> {
  try {
    console.log("🔍 Fetching cast context for castHash:", castHash);

    const neynarApiUrl = `https://api.neynar.com/v2/farcaster/cast/conversation/summary/?limit=20&identifier=${castHash}`;

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
      if (!walletProvider) {
        await initializeWalletProvider();
        if (!walletProvider) {
          console.error("Failed to initialize CDP wallet provider and no NEYNAR_API_KEY provided");
          return null;
        }
      }

      // Make paid request using x402 provider
      const x402Provider = x402ActionProvider();
      const rawX402Response = await x402Provider.paidRequest(walletProvider, {
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
        console.error("Invalid x402 response structure: missing data property");
        return null;
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

    // Extract summary text from response with fallback logic
    let summaryText = apiResponse?.summary?.text;

    // Additional fallback checks for different response structures
    if (!summaryText && (apiResponse as NestedNeynarApiResponse)?.data?.summary?.text) {
      summaryText = (apiResponse as NestedNeynarApiResponse).data.summary.text;
    }

    if (!summaryText) {
      console.error("No summary text found in Neynar API response");
      return null;
    }

    console.log("Neynar cast context:", summaryText);
    return summaryText;
  } catch (error) {
    console.error("❌ Error fetching cast context:", error);
    return null;
  }
}
