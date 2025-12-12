'use client';

import { TrueCastClient } from '@/app/components/client/TrueCastClient';
import { targetChain } from '@/lib/wagmi';

export default function TrueCastPage() {
  return <TrueCastClient targetChain={targetChain} />;
} 