'use client';

import { TrueCastClient } from '@/app/components/client/TrueCastClient';
import { baseSepolia } from 'wagmi/chains';

export default function TrueCastTrialPage() {
  return <TrueCastClient targetChain={baseSepolia} pageType="trial" />;
} 