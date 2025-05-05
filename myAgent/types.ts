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

// Interface for newsworthy events (raw format from updateMarkets)
export interface RawNewsworthyEvent {
  marketId: number;
  marketAddress: string;
  marketQuestion: string;
  yesPrice: number;
  noPrice: number;
  timestamp: number;
  eventType: string;
  category?: string; // Added optional category from usage
  additionalInfo?: string; // Added optional additionalInfo from usage
  direction?: string; // Added optional direction from usage
  percentChange?: number; // Added optional percentChange from usage
  previousPrice?: number; // Added optional previousPrice from usage
  newPrice?: number; // Added optional newPrice from usage
  previousStatus?: string; // Added optional previousStatus from usage
  newStatus?: string; // Added optional newStatus from usage
  statusText?: string; // Added optional statusText from usage
  initialYesPrice?: number; // Added optional initialYesPrice from usage
  tvl?: number; // Added optional tvl from usage
  status?: number | string; // Added optional status from usage
  winningPositionString?: string; // Added optional winningPositionString from usage
  // Potential additional fields based on eventType
  [key: string]: any;
}

// Interface for events after processing and ranking
export interface ProcessedNewsworthyEvent extends RawNewsworthyEvent {
  interestScore?: number;
  newsDescription?: string; // This will be generated here now
  webSearchResults?: string; // Context from web search
  source?: any; // Source of the news - can be string or array of sources
  imagePrompt?: string; // Prompt for AI-generated image
}