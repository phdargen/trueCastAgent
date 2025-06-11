/**
 * TrueMarkets On-Chain Service
 * Fetches real-time prices from Uniswap V3 pools using viem
 */

import { createPublicClient, http, parseAbiItem, Hex } from "viem";
import { base } from "viem/chains";

// Constants
const USDC_DECIMALS = 6;
const YESNO_DECIMALS = 18;

// Minimal ABIs for required contract calls
const UniswapV3PoolABI = [
  parseAbiItem(
    "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
  ),
  parseAbiItem("function token0() view returns (address)"),
];

const TruthMarketABI = [parseAbiItem("function winningPosition() view returns (uint256)")];

// Interface for market price data
export interface MarketPrices {
  yesPrice: number;
  noPrice: number;
  winningPosition: number;
  winningPositionString: string;
  success: boolean;
  error?: string;
}

// Interface for market pool info
export interface MarketPoolInfo {
  yesLpPool: string;
  noLpPool: string;
  yesToken: string;
  noToken: string;
  marketAddress: string;
}

/**
 * Fetches real-time prices for YES/NO tokens from Uniswap V3 pools
 *
 * @param marketInfo - Market pool and token information
 * @returns Promise resolving to market prices
 */
export async function getMarketPrices(marketInfo: MarketPoolInfo): Promise<MarketPrices> {
  try {
    // Create public client for Base chain
    const publicClient = createPublicClient({
      chain: base,
      transport: process.env.RPC_URL ? http(process.env.RPC_URL) : http(),
    });

    const { yesLpPool, noLpPool, yesToken, noToken, marketAddress } = marketInfo;

    // Use multicall to fetch slot0 and token0 for both pools, plus winning position
    const poolCalls = [
      {
        address: yesLpPool as Hex,
        abi: UniswapV3PoolABI,
        functionName: "slot0",
      },
      {
        address: yesLpPool as Hex,
        abi: UniswapV3PoolABI,
        functionName: "token0",
      },
      {
        address: noLpPool as Hex,
        abi: UniswapV3PoolABI,
        functionName: "slot0",
      },
      {
        address: noLpPool as Hex,
        abi: UniswapV3PoolABI,
        functionName: "token0",
      },
      {
        address: marketAddress as Hex,
        abi: TruthMarketABI,
        functionName: "winningPosition",
      },
    ];

    const results = await publicClient.multicall({
      contracts: poolCalls,
    });

    // Check for failures
    if (results.some(result => result.status === "failure")) {
      return {
        yesPrice: 0,
        noPrice: 0,
        winningPosition: 0,
        winningPositionString: "Open",
        success: false,
        error: "Failed to fetch pool data from contracts",
      };
    }

    // Extract results
    const yesSlot0 = results[0].result as [bigint, number, number, number, number, number, boolean];
    const yesToken0 = results[1].result as string;
    const noSlot0 = results[2].result as [bigint, number, number, number, number, number, boolean];
    const noToken0 = results[3].result as string;
    const winningPosition = Number(results[4].result as bigint);

    // Determine token orientation in pools
    const isYesToken0 = yesToken0.toLowerCase() === yesToken.toLowerCase();
    const isNoToken0 = noToken0.toLowerCase() === noToken.toLowerCase();

    // Calculate prices
    const yesPrice = calculatePrice(yesSlot0[0], isYesToken0, USDC_DECIMALS, YESNO_DECIMALS);
    const noPrice = calculatePrice(noSlot0[0], isNoToken0, USDC_DECIMALS, YESNO_DECIMALS);

    // Map winning position to string
    let winningPositionString = "Open";
    switch (winningPosition) {
      case 1:
        winningPositionString = "Yes";
        break;
      case 2:
        winningPositionString = "No";
        break;
      case 3:
        winningPositionString = "Canceled";
        break;
      default:
        winningPositionString = "Open";
    }

    console.log("Onchain market prices:", {
      yesPrice,
      noPrice,
      winningPosition,
      winningPositionString,
    });

    return {
      yesPrice: parseFloat(yesPrice.toFixed(6)),
      noPrice: parseFloat(noPrice.toFixed(6)),
      winningPosition,
      winningPositionString,
      success: true,
    };
  } catch (error) {
    console.error("Error fetching market prices:", error);
    return {
      yesPrice: 0,
      noPrice: 0,
      winningPosition: 0,
      winningPositionString: "Open",
      success: false,
      error: `Price fetch error: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

/**
 * Calculates token price from Uniswap V3 sqrtPriceX96
 *
 * @param sqrtPriceX96 - Square root price from pool slot0
 * @param isTokenZero - Whether the target token is token0 in the pool
 * @param usdcDecimals - USDC token decimals
 * @param tokenDecimals - Target token decimals
 * @returns Calculated price
 */
function calculatePrice(
  sqrtPriceX96: bigint,
  isTokenZero: boolean,
  usdcDecimals: number,
  tokenDecimals: number,
): number {
  const Q96 = 2n ** 96n;
  const sqrtPrice = Number(sqrtPriceX96) / Number(Q96);
  const price = sqrtPrice * sqrtPrice;

  // Decimal adjustment between USDC and YES/NO tokens
  const decimalAdjustment = 10 ** (tokenDecimals - usdcDecimals);

  if (isTokenZero) {
    // If YES/NO token is token0, price = price * decimalAdjustment
    return price * decimalAdjustment;
  } else {
    // If YES/NO token is token1, price = 1/price * decimalAdjustment
    return (1 / price) * decimalAdjustment;
  }
}
