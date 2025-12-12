import { x402ResourceServer, HTTPFacilitatorClient } from "@x402/core/server";
import { registerExactEvmScheme } from "@x402/evm/exact/server";
import { registerExactSvmScheme } from "@x402/svm/exact/server";
import { generateJwt } from "@coinbase/cdp-sdk/auth";

// Environment variables
const facilitatorUrl = process.env.FACILITATOR_URL;

export const evmAddress = process.env.RESOURCE_EVM_WALLET_ADDRESS as `0x${string}`;
export const svmAddress = process.env.RESOURCE_SVM_WALLET_ADDRESS;

// Network configuration 
const isTestnet = process.env.NEXT_PUBLIC_TESTNET === "true";
export const evmNetwork: `${string}:${string}` = isTestnet ? "eip155:84532" : "eip155:8453";
export const svmNetwork: `${string}:${string}` = isTestnet
  ? "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1"
  : "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";


if (!evmAddress) {
  console.error("❌ RESOURCE_EVM_WALLET_ADDRESS environment variable is required");
}

// CDP API credentials for mainnet facilitator authentication
const cdpApiKeyId = process.env.CDP_API_KEY_ID;
const cdpApiKeySecret = process.env.CDP_API_KEY_SECRET;

// Create CDP auth headers for mainnet facilitator
async function createCdpAuthHeaders(): Promise<{
  verify: Record<string, string>;
  settle: Record<string, string>;
  supported: Record<string, string>;
}> {
  if (!cdpApiKeyId || !cdpApiKeySecret) {
    console.warn("⚠️ CDP_API_KEY_ID and CDP_API_KEY_SECRET not set - mainnet facilitator will not work");
    return {
      verify: {} as Record<string, string>,
      settle: {} as Record<string, string>,
      supported: {} as Record<string, string>,
    };
  }

  const baseHost = "api.cdp.coinbase.com";
  const basePath = "/platform/v2/x402";

  const [verifyToken, settleToken, supportedToken] = await Promise.all([
    generateJwt({
      apiKeyId: cdpApiKeyId,
      apiKeySecret: cdpApiKeySecret,
      requestMethod: "POST",
      requestHost: baseHost,
      requestPath: `${basePath}/verify`,
    }),
    generateJwt({
      apiKeyId: cdpApiKeyId,
      apiKeySecret: cdpApiKeySecret,
      requestMethod: "POST",
      requestHost: baseHost,
      requestPath: `${basePath}/settle`,
    }),
    generateJwt({
      apiKeyId: cdpApiKeyId,
      apiKeySecret: cdpApiKeySecret,
      requestMethod: "GET",
      requestHost: baseHost,
      requestPath: `${basePath}/supported`,
    }),
  ]);

  return {
    verify: { Authorization: `Bearer ${verifyToken}` },
    settle: { Authorization: `Bearer ${settleToken}` },
    supported: { Authorization: `Bearer ${supportedToken}` },
  };
}

// Create HTTP facilitator client
const url = facilitatorUrl ?? (isTestnet ? "https://x402.org/facilitator" : "https://api.cdp.coinbase.com/platform/v2/x402");
const needsAuth = url === "https://api.cdp.coinbase.com/platform/v2/x402";

export const facilitatorClient = new HTTPFacilitatorClient({
  url,
  ...(needsAuth && { createAuthHeaders: createCdpAuthHeaders }),
});
console.log("facilitatorUrl", url, needsAuth ? "(with CDP auth)" : "(no auth)");

// Create x402 resource server
export const server = new x402ResourceServer(facilitatorClient);

// Register payment schemes for all supported networks
registerExactEvmScheme(server);
registerExactSvmScheme(server);