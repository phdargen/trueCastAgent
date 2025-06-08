import { http, cookieStorage, createConfig, createStorage } from "wagmi";
import { baseSepolia, base } from "wagmi/chains";
import { coinbaseWallet } from "wagmi/connectors";
import { parseEther, toHex } from "viem";

/**
 * Creates and returns a wagmi configuration
 *
 * @returns The wagmi configuration object
 */
export function getConfig() {
  return createConfig({
    chains: [baseSepolia, base],
    connectors: [
      coinbaseWallet({
        appName: "TrueCast",
        preference: {
          keysUrl: "https://keys-dev.coinbase.com/connect",
          options: "smartWalletOnly",
        },
        subAccounts: {
          enableAutoSubAccounts: true,
          defaultSpendLimits: {
            84532: [
              // Base Sepolia Chain ID
              {
                token: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
                allowance: toHex(parseEther("0.01")), // 0.01 ETH
                period: 86400, // 24h
              },
            ],
          },
        },
      }),
    ],
    storage: createStorage({
      storage: cookieStorage,
    }),
    ssr: true,
    transports: {
      [baseSepolia.id]: http(),
      [base.id]: http(),
    },
  });
}

export const config = getConfig();

declare module "wagmi" {
  interface Register {
    config: ReturnType<typeof getConfig>;
  }
}
