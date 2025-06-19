'use client';

import { http, cookieStorage, createConfig, createStorage } from "wagmi";
import { baseSepolia } from "wagmi/chains";
import { coinbaseWallet } from "wagmi/connectors";
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OnchainKitProvider } from '@coinbase/onchainkit';
import type { ReactNode } from 'react';

const cbWalletConnector = coinbaseWallet({
  appName: "TrueCast Newsletter",
  appLogoUrl: `${process.env.NEXT_PUBLIC_URL || "http://localhost:3000"}/trueCast.png`,
  preference: {
    keysUrl: "https://keys.coinbase.com/connect",
    options: "smartWalletOnly",
  },
});

const config = createConfig({
  chains: [baseSepolia],
  connectors: [cbWalletConnector],
  storage: createStorage({
    storage: cookieStorage,
  }),
  ssr: true,
  transports: {
    [baseSepolia.id]: http(),
  },
});

const queryClient = new QueryClient();

export function Providers(props: { children: ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <OnchainKitProvider
          apiKey={process.env.NEXT_PUBLIC_ONCHAINKIT_API_KEY}
          chain={baseSepolia}
          config={{ appearance: { 
            name: "TrueCast Newsletter",
            logo: `${process.env.NEXT_PUBLIC_URL || "http://localhost:3000"}/trueCast.png`,
            mode: 'auto',
          },
          wallet: { 
            termsUrl: `${process.env.NEXT_PUBLIC_URL || "http://localhost:3000"}/privacy`, 
            privacyUrl: `${process.env.NEXT_PUBLIC_URL || "http://localhost:3000"}/privacy`, 
            },
        }}
        >
          {props.children}
        </OnchainKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

