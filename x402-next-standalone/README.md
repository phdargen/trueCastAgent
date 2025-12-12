# TrueCast - x402 v2 Next.js Application

A Next.js application demonstrating how to protect API routes with x402 v2 payments using the `@x402/next` package with the `withX402` wrapper.

## Prerequisites

- Node.js v20+ (install via [nvm](https://github.com/nvm-sh/nvm))
- pnpm (install via [pnpm.io/installation](https://pnpm.io/installation))
- Valid EVM address for receiving payments (required)
- Valid Solana address for receiving payments (optional)
- URL of a facilitator supporting the desired payment network

## Setup

1. Clone or download this project
2. Install dependencies:

```bash
pnpm install
```

3. Create a `.env` file with the required environment variables:

```bash
# Required
FACILITATOR_URL=https://x402.org/facilitator
EVM_ADDRESS=0xYourEthereumAddress
CDP_API_KEY_ID=your_cdp_api_key_id
CDP_API_KEY_SECRET=your_cdp_api_key_secret

# Optional - for Solana support
SVM_ADDRESS=YourSolanaAddress

# Network configuration
NETWORK=base-sepolia  # or "base" for mainnet
# TESTNET=true  # Alternative way to enable testnet mode
```

4. Start the development server:

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Architecture

This project uses x402 v2 with the `withX402` wrapper pattern for API route protection:

```
┌─────────────────────────────────────────────────────────────┐
│                    x402 v2 Architecture                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Client Request                                              │
│       │                                                      │
│       ▼                                                      │
│  ┌─────────────────┐                                         │
│  │ withX402 Wrapper│ ──── Payment Required? ──► 402 Response │
│  └────────┬────────┘                                         │
│           │ Payment Valid                                    │
│           ▼                                                  │
│  ┌─────────────────┐                                         │
│  │  API Handler    │                                         │
│  └────────┬────────┘                                         │
│           │ Success?                                         │
│           ▼                                                  │
│  ┌─────────────────┐                                         │
│  │ Settle Payment  │ ──── Only on status < 400              │
│  └────────┬────────┘                                         │
│           │                                                  │
│           ▼                                                  │
│      200 Response                                            │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

The `withX402` wrapper guarantees payment settlement only AFTER the handler returns a successful response (status < 400), ensuring clients are not charged for failed API calls.

## API Routes

### TrueCast API (`POST /api/trueCast`)

Protected endpoint requiring payment. Returns fact-checked analysis of claims and statements.

**Request:**
```json
{
  "prompt": "Is Bitcoin above $100,000?",
  "castHash": "optional-farcaster-cast-hash",
  "storeToPinata": false,
  "runGuardrail": false
}
```

**Response:**
```json
{
  "query": "Is Bitcoin above $100,000?",
  "reply": "Based on current market data...",
  "assessment": "TRUE",
  "confidenceScore": 95,
  "data_sources": [...],
  "metadata": {
    "timestamp": "2025-01-01T00:00:00.000Z",
    "promptType": "market_data",
    "sourcesUsed": ["Pyth", "DeFiLlama"],
    "totalSources": 2,
    "processingTimeSec": 3.5
  }
}
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `FACILITATOR_URL` | Yes | x402 facilitator endpoint URL |
| `EVM_ADDRESS` | Yes | Ethereum address to receive payments |
| `SVM_ADDRESS` | No | Solana address to receive payments |
| `CDP_API_KEY_ID` | Yes | CDP API key ID for mainnet facilitator |
| `CDP_API_KEY_SECRET` | Yes | CDP API key secret for mainnet facilitator |
| `NETWORK` | No | Network identifier (`base-sepolia` or `base`) |
| `TESTNET` | No | Set to `true` for testnet mode |

## Network Identifiers (CAIP-2)

x402 v2 uses [CAIP-2](https://github.com/ChainAgnostic/CAIPs/blob/main/CAIPs/caip-2.md) format for network identifiers:

| Network | CAIP-2 Identifier |
|---------|-------------------|
| Base Mainnet | `eip155:8453` |
| Base Sepolia | `eip155:84532` |
| Solana Mainnet | `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` |
| Solana Devnet | `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1` |

## Response Format

### Payment Required (402)

```
HTTP/1.1 402 Payment Required
Content-Type: application/json
PAYMENT-REQUIRED: <base64-encoded JSON>
```

The `PAYMENT-REQUIRED` header contains base64-encoded JSON with payment requirements:

```json
{
  "x402Version": 2,
  "error": "Payment required",
  "resource": {
    "url": "http://localhost:3000/api/trueCast",
    "description": "TrueCast API - News aggregator and fact-checking service...",
    "mimeType": "application/json"
  },
  "accepts": [
    {
      "scheme": "exact",
      "network": "eip155:84532",
      "amount": "100000",
      "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      "payTo": "0x...",
      "maxTimeoutSeconds": 300
    }
  ]
}
```

### Successful Response

```
HTTP/1.1 200 OK
Content-Type: application/json
PAYMENT-RESPONSE: <base64-encoded JSON>

{"query": "...", "reply": "...", ...}
```

## Code Structure

```
lib/
├── x402.ts              # x402 v2 configuration (server, paywall, addresses)
├── trueCastEngine.ts    # Core fact-checking engine
└── redis.ts             # Redis client for response storage

app/
└── api/
    └── trueCast/
        └── route.ts     # API route with withX402 wrapper
```

### Key Files

**`lib/x402.ts`** - Centralized x402 v2 configuration:
```typescript
import { x402ResourceServer, HTTPFacilitatorClient } from "@x402/core/server";
import { registerExactEvmScheme } from "@x402/evm/exact/server";
import { registerExactSvmScheme } from "@x402/svm/exact/server";
import { createPaywall } from "@x402/paywall";
import { evmPaywall } from "@x402/paywall/evm";
import { svmPaywall } from "@x402/paywall/svm";

export const facilitatorClient = new HTTPFacilitatorClient({ url: facilitatorUrl });
export const server = new x402ResourceServer(facilitatorClient);
registerExactEvmScheme(server);
registerExactSvmScheme(server);
export const paywall = createPaywall()
  .withNetwork(evmPaywall)
  .withNetwork(svmPaywall)
  .withConfig({ appName: "TrueCast", testnet: true })
  .build();
```

**`app/api/trueCast/route.ts`** - Protected API route:
```typescript
import { withX402 } from "@x402/next";
import { server, paywall, evmAddress, svmAddress } from "@/lib/x402";

const handler = async (request: NextRequest) => {
  // Your API logic here
};

export const POST = withX402(
  handler,
  {
    accepts: [
      { scheme: "exact", price: "$0.1", network: "eip155:8453", payTo: evmAddress },
      { scheme: "exact", price: "$0.1", network: "solana:...", payTo: svmAddress },
    ],
    description: "TrueCast API",
    mimeType: "application/json",
  },
  server,
  undefined,
  paywall,
);
```

## Building for Production

```bash
pnpm build
pnpm start
```

## Learn More

- [x402 Protocol Documentation](https://docs.cdp.coinbase.com/x402)
- [x402 Migration Guide (v1 → v2)](https://docs.cdp.coinbase.com/x402/migration-guide)
- [Next.js Documentation](https://nextjs.org/docs)
- [@x402/next npm package](https://www.npmjs.com/package/@x402/next)
