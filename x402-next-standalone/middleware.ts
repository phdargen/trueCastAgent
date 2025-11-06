import { Address } from "viem";
import { paymentMiddleware, Network, Resource } from "x402-next";
import { facilitator } from "@coinbase/x402";

const facilitatorUrl = process.env.NEXT_PUBLIC_FACILITATOR_URL as Resource;
const payTo = process.env.RESOURCE_WALLET_ADDRESS as Address;
const network = process.env.NETWORK as Network;

// The CDP API key ID and secret are required to use the mainnet facilitator
if (!payTo || !process.env.CDP_API_KEY_ID || !process.env.CDP_API_KEY_SECRET) {
  throw new Error("Missing required environment variables: RESOURCE_WALLET_ADDRESS, CDP_API_KEY_ID, and CDP_API_KEY_SECRET must be set");
}

const baseMiddleware = paymentMiddleware(
  payTo,
  {
    "POST /api/trueCast": {
      price: "$0.1",
      network,
      config: {
        discoverable: true,
        description:
          "TrueCast API - News aggregator and fact-checking service grounded by prediction markets. Real-time data sources include Perplexity, X AI, Tavily, Neynar, Pyth, DeFiLlama, Truemarkets, Zerion, Allora and more.",
        mimeType: "application/json",
        maxTimeoutSeconds: 300,
        inputSchema: {
          bodyType: "json",
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
        outputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "The original user query that was processed",
            },
            reply: {
              type: "string",
              description: "The fact-checked response with analysis and conclusions",
            },
            assessment: {
              type: "string",
              enum: ["TRUE", "FALSE", "PARTIALLY_TRUE", "UNVERIFIABLE", "MARKET_SENTIMENT"],
              description: "The final truth assessment of the query",
            },
            confidenceScore: {
              type: "number",
              minimum: 0,
              maximum: 100,
              description: "Confidence level in the assessment (0-100)",
            },
            data_sources: {
              type: "array",
              description: "Information from data sources used in verification",
              items: {
                type: "object",
                properties: {
                  name: { type: "string", description: "Name of the data source" },
                  prompt: { type: "string", description: "Prompt sent to this data source" },
                  reply: { type: "string", description: "Response from this data source" },
                  source: { type: "string", description: "Source URL or identifier" },
                },
              },
            },
            metadata: {
              type: "object",
              properties: {
                timestamp: { type: "string", description: "ISO timestamp of processing" },
                promptType: { type: "string", description: "Categorized type of the prompt" },
                needsExternalData: {
                  type: "boolean",
                  description: "Whether external data was needed",
                },
                sourcesUsed: {
                  type: "array",
                  items: { type: "string" },
                  description: "Names of data sources used",
                },
                totalSources: {
                  type: "number",
                  description: "Total number of data sources queried",
                },
                processingTimeSec: {
                  type: "number",
                  description: "Time taken to process in seconds",
                },
              },
            },
            ipfs: {
              type: "object",
              description: "IPFS storage information (if storeToPinata was true)",
              properties: {
                hash: { type: "string", description: "IPFS hash of stored response" },
                gatewayUrl: {
                  type: "string",
                  description: "Public gateway URL for the stored response",
                },
                network: {
                  type: "string",
                  enum: ["public", "private"],
                  description: "IPFS network used",
                },
                paymentResponse: {
                  type: "object",
                  description: "Payment transaction details if x402 was used",
                  properties: {
                    network: { type: "string" },
                    payer: { type: "string" },
                    success: { type: "boolean" },
                    transaction: { type: "string" },
                  },
                },
              },
            },
            guardrail: {
              type: "object",
              description: "AWS Bedrock Guardrails validation results (if runGuardrail was true)",
              properties: {
                input: { type: "object", description: "Input validation results" },
                output: { type: "object", description: "Output validation results" },
              },
            },
          },
          required: ["query", "reply", "assessment", "confidenceScore", "metadata"],
        },
      },
    },
  },
  facilitatorUrl ? { url: facilitatorUrl } : facilitator,
);

export async function middleware(request: any) {
  // Only run payment middleware for POST requests
  if (request.method === "POST") {
    return baseMiddleware(request);
  }

  // For non-POST requests, continue without payment middleware
  return;
}

// Configure which paths the middleware should run on
export const config = {
  matcher: ["/api/trueCast/:path*"],
};
