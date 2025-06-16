import { Redis } from '@upstash/redis';

// Initialize Redis client
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// Redis key for free trials tracking
const FREE_TRIALS_KEY = 'trueCastAgent:freeTrials';

/**
 * Get the number of free trials used by a user
 * @param {number} fid - The Farcaster ID of the user
 * @returns {Promise<number>} Number of trials used (0 if user hasn't used any)
 */
export async function getFreeTrialsUsed(fid) {
  try {
    const trialsUsed = await redis.hget(FREE_TRIALS_KEY, fid.toString());
    return parseInt(trialsUsed || '0');
  } catch (error) {
    console.error('Error getting free trials used:', error);
    // Return 0 on error to fail open (allow trial)
    return 0;
  }
}

/**
 * Increment the number of free trials used by a user
 * @param {number} fid - The Farcaster ID of the user
 * @returns {Promise<number>} New number of trials used
 */
export async function incrementFreeTrialsUsed(fid) {
  try {
    const newCount = await redis.hincrby(FREE_TRIALS_KEY, fid.toString(), 1);
    console.log(`Incremented free trials for FID ${fid} to ${newCount}`);
    return newCount;
  } catch (error) {
    console.error('Error incrementing free trials used:', error);
    throw error;
  }
}

/**
 * Check if a user is eligible for a free trial
 * @param {number} fid - The Farcaster ID of the user
 * @returns {Promise<boolean>} True if user has free trials remaining
 */
export async function isEligibleForFreeTrial(fid) {
  try {
    const maxTrials = parseInt(process.env.N_FREE_TRIALS || '1');
    const trialsUsed = await getFreeTrialsUsed(fid);
    return trialsUsed < maxTrials;
  } catch (error) {
    console.error('Error checking free trial eligibility:', error);
    // Return false on error to fail safe (require payment)
    return false;
  }
} 