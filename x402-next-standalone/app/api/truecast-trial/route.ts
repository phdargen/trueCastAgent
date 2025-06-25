import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { createWalletClient, http, publicActions } from "viem";
import { toAccount } from "viem/accounts";
import { base } from "viem/chains";
import { withPaymentInterceptor } from "x402-axios";
import { CdpClient } from "@coinbase/cdp-sdk";

import { checkAndConsumeTrialUsage } from "@/lib/trial-storage";

// Helper function to create CDP client and smart account
/**
 * Creates a smart account client using CDP SDK and viem
 *
 * @returns Promise containing the wallet client and account
 */
async function createSmartAccountClient() {
  // Initialize CDP client
  const cdp = new CdpClient({
    apiKeyId: process.env.CDP_API_KEY_ID,
    apiKeySecret: process.env.CDP_API_KEY_SECRET,
    walletSecret: process.env.CDP_WALLET_SECRET,
  });

  // Create or get existing account
  const account = await cdp.evm.getOrCreateAccount({
    name: process.env.SMART_ACCOUNT_OWNER_NAME || "X402PaymentAccount",
  });
  console.log("EVM Account Address: ", account.address);

  // Create wallet client using the account with viem compatibility
  const client = createWalletClient({
    account: toAccount({
      ...account,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      signTypedData: async (typedData: any) => {
        // Convert viem format to CDP format
        return await account.signTypedData({
          domain: typedData.domain,
          types: typedData.types,
          primaryType: typedData.primaryType,
          message: typedData.message,
        });
      },
    }),
    chain: base,
    transport: http(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }).extend(publicActions) as any; // Type assertion needed for compatibility between CDP and viem types

  return { client, account };
}

/**
 * Handles POST requests to the TrueCast trial API endpoint
 *
 * @param request - The incoming NextRequest object
 * @returns Promise containing the NextResponse with API result
 */
export async function POST(request: NextRequest) {
  try {
    // Check for required CDP environment variables
    const cdpApiKeyId = process.env.CDP_API_KEY_ID;
    const cdpApiKeySecret = process.env.CDP_API_KEY_SECRET;
    const cdpWalletSecret = process.env.CDP_WALLET_SECRET;

    if (!cdpApiKeyId || !cdpApiKeySecret || !cdpWalletSecret) {
      return NextResponse.json(
        {
          error:
            "CDP_API_KEY_ID, CDP_API_KEY_SECRET, and CDP_WALLET_SECRET environment variables are required",
        },
        { status: 500 },
      );
    }

    const body = await request.json();
    const { message, transactionHash, walletAddress, storeToPinata, runGuardrail } = body;

    if (!message) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    if (!walletAddress) {
      return NextResponse.json({ error: "Wallet address is required" }, { status: 400 });
    }

    // Check trial usage limit
    const usageCheck = await checkAndConsumeTrialUsage(walletAddress);
    if (!usageCheck.allowed) {
      return NextResponse.json(
        {
          error: usageCheck.error || "Trial limit exceeded. You have used all free prompts.",
          trialExhausted: true,
          totalTrials: parseInt(process.env.TRIAL_LIMIT || "3"),
        },
        { status: 429 },
      );
    }

    console.log("Trial request received:", {
      message: message.substring(0, 50) + "...",
      transactionHash,
      walletAddress,
      remainingTrials: usageCheck.remaining,
    });

    // Create smart account client
    const { client } = await createSmartAccountClient();

    // Get the base URL from the request
    const baseURL = `${request.nextUrl.protocol}//${request.nextUrl.host}`;

    // Create axios instance with payment interceptor
    const api = withPaymentInterceptor(
      axios.create({
        baseURL,
      }),
      client,
    );

    console.log("Calling protected TrueCast API route with payment (POST)...");

    // Call the protected API route with POST data
    const response = await api.post("/api/trueCast", {
      message,
      storeToPinata: storeToPinata === true, // Pass through the storeToPinata flag
      runGuardrail: runGuardrail === true, // Pass through the runGuardrail flag (defaults to false)
    });

    console.log("Payment successful! TrueCast response received.");

    // Extract payment response from headers if available
    let paymentResponse = null;
    const paymentResponseHeader = response.headers["x-payment-response"];
    if (paymentResponseHeader) {
      try {
        // Check if the header is already a JSON string
        if (
          typeof paymentResponseHeader === "string" &&
          paymentResponseHeader.startsWith("{") &&
          paymentResponseHeader.endsWith("}")
        ) {
          paymentResponse = JSON.parse(paymentResponseHeader);
        } else if (typeof paymentResponseHeader === "object") {
          paymentResponse = paymentResponseHeader;
        } else {
          // Try to decode if it's encoded
          paymentResponse = JSON.parse(paymentResponseHeader);
        }
      } catch (decodeError) {
        console.warn("Failed to decode payment response header:", decodeError);
        paymentResponse = {
          error: "Failed to decode payment response",
          rawHeader: paymentResponseHeader,
        };
      }
    }

    return NextResponse.json({
      success: true,
      data: response.data,
      paymentVerified: true,
      message: "Successfully called TrueCast API with automatic payment",
      userMessage: message,
      transactionHash,
      paymentResponse,
      trialInfo: {
        remainingTrials: usageCheck.remaining,
        totalTrials: parseInt(process.env.TRIAL_LIMIT || "3"),
        currentUsage: parseInt(process.env.TRIAL_LIMIT || "3") - usageCheck.remaining,
      },
    });
  } catch (error: unknown) {
    console.error("Error calling protected TrueCast API:", error);

    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const errorDetails =
      error && typeof error === "object" && "response" in error
        ? (error as { response?: { data?: unknown } }).response?.data
        : null;

    return NextResponse.json(
      {
        error: "Failed to call protected TrueCast API",
        message: errorMessage,
        details: errorDetails,
      },
      { status: 500 },
    );
  }
}
