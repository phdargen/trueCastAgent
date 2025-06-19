import { Redis } from "@upstash/redis";

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

// Platform statistics tracking
const platformStatsKey = `${notificationServiceKey}:platform_stats`;

/**
 * Save user email to Redis
 * @param email User's email address
 * @param fid Optional Farcaster ID for user-specific tracking
 */
export async function saveUserEmail(email: string, fid?: string): Promise<void> {
  const redisClient = redis || getRedisClient();
  
  if (!redisClient) {
    console.error("Redis client not available - cannot save email");
    return;
  }

  if (!email || !email.includes('@')) {
    console.error("Invalid email provided");
    return;
  }

  try {
    const timestamp = Date.now();
    const emailData = {
      email,
      timestamp,
      fid: fid || null,
    };

    // Save to global email list
    const emailsKey = `${notificationServiceKey}:emails:all`;
    await redisClient.lpush(emailsKey, JSON.stringify(emailData));
    await redisClient.ltrim(emailsKey, 0, 9999); // Keep last 10,000 emails

    // Save to email set for uniqueness checking
    const uniqueEmailsKey = `${notificationServiceKey}:emails:unique`;
    await redisClient.sadd(uniqueEmailsKey, email);

    // If FID exists, save user-specific email
    if (fid) {
      const userEmailKey = `${notificationServiceKey}:user:${fid}:email`;
      await redisClient.set(userEmailKey, email);
    }

    // Update email subscription count
    await incrementEmailSubscriptions();
    
    console.log(`Successfully saved email to Redis: ${email}`);

  } catch (error) {
    console.error("Error saving user email:", error);
  }
}

/**
 * Increment total email subscriptions counter
 */
export async function incrementEmailSubscriptions(): Promise<void> {
  const redisClient = redis || getRedisClient();
  if (!redisClient) return;
  await redisClient.hincrby(platformStatsKey, 'totalEmailSubscriptions', 1);
}

/**
 * Get total unique email count
 */
export async function getUniqueEmailCount(): Promise<number> {
  const redisClient = redis || getRedisClient();
  if (!redisClient) return 0;
  
  try {
    const uniqueEmailsKey = `${notificationServiceKey}:emails:unique`;
    return await redisClient.scard(uniqueEmailsKey);
  } catch (error) {
    console.error("Error getting unique email count:", error);
    return 0;
  }
}

/**
 * Check if email already exists
 */
export async function emailExists(email: string): Promise<boolean> {
  const redisClient = redis || getRedisClient();
  if (!redisClient) return false;
  
  try {
    const uniqueEmailsKey = `${notificationServiceKey}:emails:unique`;
    const exists = await redisClient.sismember(uniqueEmailsKey, email);
    return Boolean(exists);
  } catch (error) {
    console.error("Error checking if email exists:", error);
    return false;
  }
}

/**
 * Unsubscribe user email from Redis
 * @param email User's email address to unsubscribe
 */
export async function unsubscribeUserEmail(email: string): Promise<boolean> {
  const redisClient = redis || getRedisClient();
  
  if (!redisClient) {
    console.error("Redis client not available - cannot unsubscribe email");
    return false;
  }

  if (!email || !email.includes('@')) {
    console.error("Invalid email provided for unsubscribe");
    return false;
  }

  try {
    // Check if email exists before trying to remove
    const exists = await emailExists(email);
    if (!exists) {
      console.log(`Email not found in subscription list: ${email}`);
      return false;
    }

    // Remove from unique email set
    const uniqueEmailsKey = `${notificationServiceKey}:emails:unique`;
    await redisClient.srem(uniqueEmailsKey, email);

    // Add to unsubscribed list with timestamp
    const unsubscribedKey = `${notificationServiceKey}:emails:unsubscribed`;
    const unsubscribeData = {
      email,
      timestamp: Date.now(),
    };
    await redisClient.lpush(unsubscribedKey, JSON.stringify(unsubscribeData));
    await redisClient.ltrim(unsubscribedKey, 0, 9999); // Keep last 10,000 unsubscribes

    // Decrement email subscription count
    await decrementEmailSubscriptions();
    
    console.log(`Successfully unsubscribed email: ${email}`);
    return true;

  } catch (error) {
    console.error("Error unsubscribing user email:", error);
    return false;
  }
}

/**
 * Decrement total email subscriptions counter
 */
export async function decrementEmailSubscriptions(): Promise<void> {
  const redisClient = redis || getRedisClient();
  if (!redisClient) return;
  await redisClient.hincrby(platformStatsKey, 'totalEmailSubscriptions', -1);
}

/**
 * Check if email is unsubscribed
 */
export async function isEmailUnsubscribed(email: string): Promise<boolean> {
  const redisClient = redis || getRedisClient();
  if (!redisClient) return false;
  
  try {
    const uniqueEmailsKey = `${notificationServiceKey}:emails:unique`;
    const exists = await redisClient.sismember(uniqueEmailsKey, email);
    return !Boolean(exists); // If not in active list, consider it unsubscribed
  } catch (error) {
    console.error("Error checking if email is unsubscribed:", error);
    return false;
  }
} 