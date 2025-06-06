import { Address } from "viem";
import { paymentMiddleware, Resource, Network } from "x402-next";

const address = process.env.RESOURCE_WALLET_ADDRESS as Address;
const network = process.env.NETWORK as Network;
const facilitatorUrl = process.env.NEXT_PUBLIC_FACILITATOR_URL as Resource;

export const middleware = paymentMiddleware(
  address,
  {
    "/protected": {
      price: "$0.01",
      config: {
        description: "Access to protected content",
      },
      network,
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
