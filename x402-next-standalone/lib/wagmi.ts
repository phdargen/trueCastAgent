import { http, createConfig } from "wagmi";
import { base, baseSepolia } from "wagmi/chains";
import { injected, metaMask } from "wagmi/connectors";

const isTestnet = process.env.NEXT_PUBLIC_TESTNET === "true";
export const targetChain = isTestnet ? baseSepolia : base;

export const config = createConfig({
  chains: [targetChain],
  connectors: [injected(), metaMask()],
  transports: {
    [base.id]: http(),
    [baseSepolia.id]: http(),
  },
});
