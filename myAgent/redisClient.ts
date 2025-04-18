import { Redis } from "@upstash/redis";
import type { SwapTransaction } from "./types";

const notificationServiceKey = process.env.NEXT_PUBLIC_ONCHAINKIT_PROJECT_NAME ?? "trueCast";

// Initialize Redis client
export const getRedisClient = () => {
  if (!process.env.REDIS_URL || !process.env.REDIS_TOKEN) {
    console.warn("Redis environment variables not properly set");
    return null;
  }
  
  try {
    return new Redis({
      url: process.env.REDIS_URL,
      token: process.env.REDIS_TOKEN,
    });
  } catch (error) {
    console.error("Failed to initialize Redis client:", error);
    return null;
  }
};

export const redis = getRedisClient();

/**
 * Records a trade transaction in Redis
 * @param transaction SwapTransaction object containing trade details
 */
export async function recordTradeTransaction(
  transaction: SwapTransaction
): Promise<void> {
  // Try to get a fresh Redis client if the existing one is null
  const redisClient = redis || getRedisClient();
  
  if (!redisClient) {
    console.error("Redis client not available - Environment variables:");
    console.error(`REDIS_URL set: ${Boolean(process.env.REDIS_URL)}`);
    console.error(`REDIS_TOKEN set: ${Boolean(process.env.REDIS_TOKEN)}`);
    console.error("Check REDIS_URL and REDIS_TOKEN env variables");
    return;
  }

  try {
    // Record in global transaction list
    const allTransactionsKey = `${notificationServiceKey}:transactions:all`;
    await redisClient.lpush(allTransactionsKey, JSON.stringify(transaction));
    await redisClient.ltrim(allTransactionsKey, 0, 999); // Keep last 1000 transactions

    // If FID exists, record in user-specific list
    if (transaction.fid) {
      const userTransactionsKey = `${notificationServiceKey}:transactions:${transaction.fid}`;
      await redisClient.lpush(userTransactionsKey, JSON.stringify(transaction));
      await redisClient.ltrim(userTransactionsKey, 0, 999);
    }

    // Update platform statistics
    if(transaction.buyToken && transaction.buyAmount){
        // await incrementTotalTrades();
        // await addTokenVolume(transaction.buyToken, parseFloat(transaction.buyAmount));
    }
    
    console.log("Successfully recorded transaction in Redis");

  } catch (error) {
    console.error("Error recording trade transaction:", error);
  }
}

// Platform statistics tracking
const platformStatsKey = `${notificationServiceKey}:platform_stats`;
const tokenVolumeKey = `${notificationServiceKey}:token_volumes`;

export async function incrementTotalTrades(): Promise<void> {
  const redisClient = redis || getRedisClient();
  if (!redisClient) return;  
  await redisClient.hincrby(platformStatsKey, 'totalTrades', 1);
}

export async function addTokenVolume(token: string, amount: number): Promise<void> {
  const redisClient = redis || getRedisClient();
  if (!redisClient || !amount) {
    return;
  }
  await redisClient.hincrby(tokenVolumeKey, token, amount);
}