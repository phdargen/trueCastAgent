# x402-next Standalone Example App

This is a standalone Next.js application that demonstrates how to use the `x402-next` middleware to implement paywall functionality in your Next.js routes. This project uses the published npm package instead of workspace dependencies, making it easy to build and deploy.

## Prerequisites

- Node.js v20+ (install via [nvm](https://github.com/nvm-sh/nvm))
- npm, yarn, or pnpm
- A valid Ethereum address for receiving payments

## Setup

1. Clone or download this project
2. Install dependencies:

```bash
npm install
# or
yarn install
# or
pnpm install
```

3. Copy `.env.local` to `.env` and update your Ethereum address to receive payments:

```bash
cp .env.local .env
```

Edit the `.env` file and replace the `RESOURCE_WALLET_ADDRESS` with your own wallet address.

4. Start the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Example Routes

The app includes protected routes that require payment to access:

### Protected Page Route
The `/protected` route requires a payment of $0.01 to access. The route is protected using the x402-next middleware:

```typescript
// middleware.ts
import { Address } from "viem";
import { paymentMiddleware, Network, Resource } from "x402-next";

const facilitatorUrl = process.env.NEXT_PUBLIC_FACILITATOR_URL as Resource;
const payTo = process.env.RESOURCE_WALLET_ADDRESS as Address;
const network = process.env.NETWORK as Network;

export const middleware = paymentMiddleware(
  payTo,
  {
    "/protected": {
      price: "$0.01",
      network,
      config: {
        description: "Access to protected content",
      },
    },
  },
  {
    url: facilitatorUrl,
  },
);

// Configure which paths the middleware should run on
export const config = {
  matcher: ["/protected/:path*"],
};
```

## Environment Variables

- `NEXT_PUBLIC_FACILITATOR_URL`: The x402 facilitator service URL (default: https://x402.org/facilitator)
- `NETWORK`: The blockchain network to use (e.g., "base-sepolia", "base")
- `RESOURCE_WALLET_ADDRESS`: Your Ethereum address to receive payments

## Response Format

### Payment Required (402)
```json
{
  "error": "X-PAYMENT header is required",
  "paymentRequirements": {
    "scheme": "exact",
    "network": "base",
    "maxAmountRequired": "1000",
    "resource": "http://localhost:3000/protected",
    "description": "Access to protected content",
    "mimeType": "",
    "payTo": "0xYourAddress",
    "maxTimeoutSeconds": 60,
    "asset": "0x...",
    "outputSchema": null,
    "extra": null
  }
}
```

### Successful Response
```ts
// Headers
{
  "X-PAYMENT-RESPONSE": "..." // Encoded response object
}
```

## Extending the Example

To add more protected routes, update the middleware configuration:

```typescript
export const middleware = paymentMiddleware(
  payTo,
  {
    "/protected": {
      price: "$0.01",
      network,
      config: {
        description: "Access to protected content",
      },
    },
    "/api/premium": {
      price: "$0.10",
      network,
      config: {
        description: "Premium API access",
      },
    },
  }
);

export const config = {
  matcher: ["/protected/:path*", "/api/premium/:path*"],
};
```

## Building for Production

```bash
npm run build
npm start
```

## Learn More

- [x402 Protocol Documentation](https://docs.cdp.coinbase.com/x402)
- [Next.js Documentation](https://nextjs.org/docs)
- [x402-next npm package](https://www.npmjs.com/package/x402-next)