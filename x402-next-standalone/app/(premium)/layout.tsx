'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider } from 'wagmi'
import { config } from '../../lib/wagmi'

const queryClient = new QueryClient()

export default function PremiumLayout({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config as any}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  )
} 