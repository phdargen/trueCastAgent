import { Address } from "viem";
import { paymentMiddleware, Network, Resource } from "x402-next";
import { facilitator } from "@coinbase/x402";

const facilitatorUrl = process.env.NEXT_PUBLIC_FACILITATOR_URL as Resource;
const payTo = process.env.RESOURCE_WALLET_ADDRESS as Address;
const network = process.env.NETWORK as Network;

// The CDP API key ID and secret are required to use the mainnet facilitator
if (!payTo || !process.env.CDP_API_KEY_ID || !process.env.CDP_API_KEY_SECRET) {
  console.error("Missing required environment variables");
  process.exit(1);
}

export const middleware = paymentMiddleware(
  payTo,
  {
    "/api/trueCast": {
      price: "$0.01",
      network,
      config: {
        description: "Access to TrueCast API",
      },
    },
  },
  network === "base-sepolia" ? { url: facilitatorUrl } : facilitator
);

// Configure which paths the middleware should run on
export const config = {
  matcher: ["/api/trueCast/:path*"],
  runtime: "nodejs",
};
