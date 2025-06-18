import { Redis } from '@upstash/redis';
import { isAddress } from 'viem';

// Initialize Redis client
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// Redis keys
const FREE_TRIALS_KEY = 'trueCastAgent:freeTrials';
const USER_ADDRESSES_KEY = 'trueCastAgent:userAddresses';

/**
 * Check if a cast is already being processed using Upstash Redis
 */
export async function isProcessingCast(castHash) {
  try {
    const existing = await redis.get(`webhook:processing:${castHash}`);
    return existing !== null;
  } catch (error) {
    console.error('Error checking Redis for cast processing status:', error);
    // If Redis fails, allow processing to continue (fail open)
    return false;
  }
}

/**
 * Mark a cast as being processed (with 5 minute expiration)
 */
export async function markCastAsProcessing(castHash) {
  try {
    await redis.setex(`webhook:processing:${castHash}`, 300, Date.now()); // 5 minutes
  } catch (error) {
    console.error('Error marking cast as processing in Redis:', error);
    // If Redis fails, continue anyway
  }
}

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

/**
 * Store the mapping between user FID and their wallet address
 * @param {number} fid - The Farcaster ID of the user
 * @param {string} address - The wallet address of the user
 * @returns {Promise<void>}
 */
export async function storeUserAddress(fid, address) {
  try {
    // Aggressive, temporary debugging to diagnose data corruption.
    console.log('[DEBUG] storeUserAddress called. Preparing to write to Redis.');
    console.log(`[DEBUG] Received FID: ${JSON.stringify(fid)}, TYPE: ${typeof fid}`);
    console.log(`[DEBUG] Received Address: ${JSON.stringify(address)}, TYPE: ${typeof address}`);

    if (!isAddress(address)) {
      console.error(
        `[CRITICAL] Attempted to store invalid address for FID ${fid}: "${address}". Aborting.`
      );
      // Log a stack trace to find exactly where this invalid call is coming from.
      console.error('Stack trace:', new Error('Invalid address stack trace').stack);
      return;
    }
    await redis.hset(USER_ADDRESSES_KEY, fid.toString(), address);
    console.log(`Stored address mapping: FID ${fid} -> ${address}`);
  } catch (error) {
    console.error('Error storing user address mapping:', error);
    // Don't throw error to avoid breaking main functionality
  }
}

/**
 * Get the wallet address for a user FID
 * @param {number} fid - The Farcaster ID of the user
 * @returns {Promise<string|null>} The wallet address or null if not found
 */
export async function getUserAddress(fid) {
  try {
    const address = await redis.hget(USER_ADDRESSES_KEY, fid.toString());
    return address;
  } catch (error) {
    console.error('Error getting user address:', error);
    return null;
  }
}

/**
 * Get all user FID to address mappings
 * @returns {Promise<Object>} Object with FID as key and address as value
 */
export async function getAllUserAddresses() {
  try {
    const mappings = await redis.hgetall(USER_ADDRESSES_KEY);
    return mappings || {};
  } catch (error) {
    console.error('Error getting all user addresses:', error);
    return {};
  }
} 