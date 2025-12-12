import { NextRequest, NextResponse } from "next/server";
import { withX402 } from "@x402/next";
import { declareDiscoveryExtension } from "@x402/extensions/bazaar";
import { decodePaymentSignatureHeader } from "@x402/core/http";
import {
  decodeTransactionFromPayload,
  getTokenPayerFromTransaction,
} from "@x402/svm";
import type { ExactSvmPayloadV2 } from "@x402/svm";
import { processPrompt } from "@/lib/trueCastEngine";
import { redis } from "@/lib/redis";
import {
  server,
  evmAddress,
  svmAddress,
  evmNetwork,
  svmNetwork,
} from "@/lib/x402";

/**
 * POST handler for TrueCast API - Main truth verification endpoint
 *
 * @param request - The incoming request
 * @returns JSON response with fact-check results
 */
const handler = async (request: NextRequest) => {
  try {
    const body = await request.json();
    const prompt = body.prompt || body.message || body.text || "";
    const castHash = body.castHash || "";
    const storeToPinata = body.storeToPinata === true;
    const runGuardrail = body.runGuardrail === true;

    if (!prompt.trim()) {
      return NextResponse.json(
        {
          error: "Input prompt is required. Please provide a 'prompt' field in your request body.",
        },
        { status: 400 },
      );
    }

    // Check for payment header to determine if request is paid
    const paymentHeader = request.headers.get("PAYMENT-SIGNATURE");
    let buyerAddress = "anonymous";

    if (paymentHeader) {
      try {
        const paymentData = decodePaymentSignatureHeader(paymentHeader);

        // EVM exact scheme: payload.authorization.from
        const evmPayload = paymentData.payload as {
          authorization?: { from?: string };
        };
        if (evmPayload?.authorization?.from) {
          buyerAddress = evmPayload.authorization.from;
        } else {
          // SVM exact scheme: decode transaction to extract payer
          const svmPayload = paymentData.payload as ExactSvmPayloadV2;
          if (svmPayload?.transaction) {
            const tx = decodeTransactionFromPayload(svmPayload);
            const svmPayer = getTokenPayerFromTransaction(tx);
            buyerAddress = svmPayer || "paid-user";
          } else {
            buyerAddress = "paid-user";
          }
        }

        console.log("TrueCast request from buyer:", buyerAddress);
      } catch (error) {
        console.warn("Failed to decode payment header, marking as paid-user:", error);
        buyerAddress = "paid-user";
      }
    }

    // Process the prompt through the TrueCast engine
    const result = await processPrompt(
      prompt.trim(),
      castHash.trim() || undefined,
      storeToPinata,
      runGuardrail,
    );

    // Save response to Redis with buyer address and timestamp
    if (redis) {
      const redisKey = "truecast:responses";
      const timestamp = new Date().toISOString();
      const humanReadableTimestamp = new Date().toLocaleString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        timeZoneName: "short",
      });

      const redisEntry = {
        buyerAddress: buyerAddress || "anonymous",
        timestamp,
        humanReadableTimestamp,
        response: result,
      };

      try {
        // Use lpush to add newest responses to the beginning
        await redis.lpush(redisKey, JSON.stringify(redisEntry));
        console.log(`✅ Response saved to Redis for ${buyerAddress || "anonymous"}`);
      } catch (error) {
        console.error("Failed to save response to Redis:", error);
      }
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("TrueCast API Error:", error);

    return NextResponse.json(
      {
        error: "An internal server error occurred while processing your request.",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
};

// Build accepts array based on configured addresses
const accepts: Array<{
  scheme: "exact";
  price: string;
  network: `${string}:${string}`;
  payTo: string;
}> = [];

// Always add EVM if address is configured
if (evmAddress) {
  accepts.push({
    scheme: "exact",
    price: "$0.1",
    network: evmNetwork,
    payTo: evmAddress,
  });
}

// Add SVM if address is configured
if (svmAddress) {
  accepts.push({
    scheme: "exact",
    price: "$0.1",
    network: svmNetwork,
    payTo: svmAddress,
  });
}


// TrueCast API discovery extension configuration
const trueCastDiscoveryConfig = {
  input: {
    bodyType: "json" as const,
    bodyFields: {
      prompt: {
        type: "string",
        description: "The statement, claim, or question to fact-check and verify",
        required: true,
      },
      castHash: {
        type: "string",
        description: "Optional Farcaster cast hash for context-specific verification",
      },
      storeToPinata: {
        type: "boolean",
        description: "Whether to store the response to IPFS via Pinata (default: false)",
      },
      runGuardrail: {
        type: "boolean",
        description: "Whether to run AWS Bedrock Guardrails validation (default: false)",
      },
    },
  },
  output: {
    example: {
      query: "Is Bitcoin above $100,000?",
      reply: "Based on current market data...",
      assessment: "TRUE",
      confidenceScore: 95,
      data_sources: [
        {
          name: "Pyth",
          prompt: "Get current BTC price",
          reply: "BTC/USD: $102,500",
          source: "https://pyth.network",
        },
      ],
      metadata: {
        timestamp: "2025-01-01T00:00:00.000Z",
        promptType: "market_data",
        needsExternalData: true,
        sourcesUsed: ["Pyth", "DeFiLlama"],
        totalSources: 2,
        processingTimeSec: 3.5,
      },
    },
  },
};

/**
 * Protected TrueCast API endpoint using withX402 wrapper
 *
 * This uses the v2 withX402 wrapper which guarantees payment settlement
 * only AFTER the handler returns a successful response (status < 400).
 */
export const POST = withX402(
  handler as unknown as Parameters<typeof withX402>[0],
  {
    accepts,
    description:
      "TrueCast API - News aggregator and fact-checking service grounded by prediction markets. Real-time data sources include Perplexity, X AI, Tavily, Neynar, Pyth, DeFiLlama, Truemarkets, Zerion, Allora and more.",
    mimeType: "application/json",
    extensions: {
      ...declareDiscoveryExtension(trueCastDiscoveryConfig),
    },
  },
  server,
  undefined,
);

/**
 * GET handler for TrueCast API - Returns 405 Method Not Allowed
 *
 * @returns 405 Method Not Allowed
 */
export async function GET() {
  return NextResponse.json(
    { error: "Method Not Allowed. Use POST /api/truecast." },
    { status: 405 },
  );
}
