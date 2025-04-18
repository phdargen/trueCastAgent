export interface SwapTransaction {
  txHash: string;
  tokenType: 'YES' | 'NO';
  marketAddress: string;
  marketQuestion?: string;
  timestamp: number;
  username?: string | null;
  address?: string | null;
  fid?: number;
  pfpURL?: string | null;
  buyAmount?: string;
  buyToken?: string;
  minBuyAmount?: string;
  sellAmount?: string;
  sellToken?: string;
  totalNetworkFee?: string;
  yesTokenPrice?: string | null;
  noTokenPrice?: string | null;
}