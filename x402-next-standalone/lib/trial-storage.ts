// Production-ready trial storage with Redis support
import Redis from "ioredis";

const TRIAL_LIMIT = parseInt(process.env.TRIAL_LIMIT || "3");
const TRIAL_KEY_PREFIX = "trial:";

// Initialize Redis client
const redis = process.env.REDIS_URL ? new Redis(process.env.REDIS_URL) : null;

// Fallback in-memory storage for development
const memoryStore = new Map<string, number>();

export interface TrialInfo {
  remainingTrials: number;
  totalTrials: number;
  currentUsage: number;
}

/**
 * Get trial usage for a wallet address
 *
 * @param walletAddress - The wallet address to get trial usage for
 * @returns Promise that resolves to the current usage count for the wallet address
 */
export async function getTrialUsage(walletAddress: string): Promise<number> {
  const key = `${TRIAL_KEY_PREFIX}${walletAddress}`;

  if (redis) {
    const usage = await redis.get(key);
    return typeof usage === "number" ? usage : 0;
  }

  return memoryStore.get(walletAddress) || 0;
}

/**
 * Increment trial usage for a wallet address
 *
 * @param walletAddress - The wallet address to increment trial usage for
 * @returns Promise that resolves to the new usage count after incrementing
 */
export async function incrementTrialUsage(walletAddress: string): Promise<number> {
  const key = `${TRIAL_KEY_PREFIX}${walletAddress}`;

  if (redis) {
    return await redis.incr(key);
  }

  const current = memoryStore.get(walletAddress) || 0;
  const newUsage = current + 1;
  memoryStore.set(walletAddress, newUsage);
  return newUsage;
}

/**
 * Get trial status without consuming a trial
 *
 * @param walletAddress - The wallet address to get trial status for
 * @returns Promise that resolves to trial information including remaining trials and usage
 */
export async function getTrialStatus(walletAddress: string): Promise<TrialInfo> {
  const currentUsage = await getTrialUsage(walletAddress);
  const remainingTrials = Math.max(0, TRIAL_LIMIT - currentUsage);

  return {
    remainingTrials,
    totalTrials: TRIAL_LIMIT,
    currentUsage,
  };
}

/**
 * Check if a wallet can use a trial and consume it if allowed
 *
 * @param walletAddress - The wallet address to check and consume trial usage for
 * @returns Promise that resolves to an object indicating if the trial is allowed and remaining count
 */
export async function checkAndConsumeTrialUsage(walletAddress: string): Promise<{
  allowed: boolean;
  remaining: number;
  error?: string;
}> {
  const currentUsage = await getTrialUsage(walletAddress);

  if (currentUsage >= TRIAL_LIMIT) {
    return {
      allowed: false,
      remaining: 0,
      error: `Trial limit exceeded. You have used all ${TRIAL_LIMIT} free prompts.`,
    };
  }

  // Consume a trial
  await incrementTrialUsage(walletAddress);
  const remaining = TRIAL_LIMIT - currentUsage - 1;

  return { allowed: true, remaining };
}
