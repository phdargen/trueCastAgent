'use client';

import { TrueCastClient } from '@/app/components/client/TrueCastClient';
import { base } from 'wagmi/chains';

export default function TrueCastPage() {
  return <TrueCastClient targetChain={base} pageType="premium" />;
} 