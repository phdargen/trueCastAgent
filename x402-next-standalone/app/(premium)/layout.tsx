'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider } from 'wagmi'
import { OnchainKitProvider } from '@coinbase/onchainkit'
import { config } from '../../lib/wagmi'
import { base } from 'wagmi/chains'

const queryClient = new QueryClient()

export default function PremiumLayout({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config as any}>
      <QueryClientProvider client={queryClient}>
        <OnchainKitProvider
          apiKey={process.env.NEXT_PUBLIC_ONCHAINKIT_API_KEY}
          chain={base}
          config={{
            appearance: {
              name: 'TrueCast API',
              logo: 'https://true-cast-agent.vercel.app/assets/trueCast.png',
              mode: 'auto',
              theme: 'default',
            },
            wallet: {
              display: 'modal',
              supportedWallets: { rabby: true},
            },
          }}
        >
          {children}
        </OnchainKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
} 