import { Redis } from '@upstash/redis';

// Initialize Redis client
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// Redis keys
const STATS_KEY = 'trueCastAgent:stats';
const USERS_KEY = 'trueCastAgent:users';
const EVENTS_KEY = 'trueCastAgent:events';

/**
 * Track various types of requests in Redis analytics
 */
export async function trackRequest(type, fid, castData = null, replyData = null) {
  try {
    // Increment the appropriate counter in the stats hash
    let statKey;
    switch (type) {
      case 'balance':
        statKey = 'totalBalanceRequests';
        break;
      case 'withdrawal':
        statKey = 'totalWithdrawalRequests';
        break;
      case 'api':
        statKey = 'totalApiRequests';
        break;
      case 'freeTrial':
        statKey = 'totalFreeTrialRequests';
        break;
      case 'welcome':
        statKey = 'totalWelcomeMessages';
        break;
      default:
        statKey = 'totalRequests';
    }

    // Use pipeline for atomic operations
    const pipeline = redis.pipeline();
    
    // Increment total requests and specific request type
    pipeline.hincrby(STATS_KEY, 'totalRequests', 1);
    if (statKey !== 'totalRequests') {
      pipeline.hincrby(STATS_KEY, statKey, 1);
    }
    
    // Add user FID to unique users set
    pipeline.sadd(USERS_KEY, fid);
    
    // Create event log entry
    const eventData = {
      fid: fid,
      type: type,
      timestamp: new Date().toISOString(),
      cast: castData ? {
        hash: castData.hash,
        text: castData.text,
        author: castData.author?.username
      } : null,
      reply: replyData
    };
    
    // Add event to the beginning of the list and trim to keep only 1000 most recent
    pipeline.lpush(EVENTS_KEY, JSON.stringify(eventData));
    pipeline.ltrim(EVENTS_KEY, 0, 999); // Keep only the 1000 most recent events
    
    // Execute all operations atomically
    await pipeline.exec();
    
    console.log(`Analytics tracked: ${type} request from FID ${fid}`);
    
  } catch (error) {
    console.error('Error tracking analytics:', error);
    // Don't throw error to avoid breaking main functionality
  }
}

/**
 * Get current analytics stats
 */
export async function getStats() {
  try {
    const [stats, totalUsers] = await Promise.all([
      redis.hgetall(STATS_KEY),
      redis.scard(USERS_KEY)
    ]);
    
    return {
      totalRequests: parseInt(stats.totalRequests || '0'),
      totalBalanceRequests: parseInt(stats.totalBalanceRequests || '0'),
      totalWithdrawalRequests: parseInt(stats.totalWithdrawalRequests || '0'),
      totalApiRequests: parseInt(stats.totalApiRequests || '0'),
      totalFreeTrialRequests: parseInt(stats.totalFreeTrialRequests || '0'),
      totalWelcomeMessages: parseInt(stats.totalWelcomeMessages || '0'),
      totalUsers: totalUsers || 0
    };
  } catch (error) {
    console.error('Error getting analytics stats:', error);
    return {
      totalRequests: 0,
      totalBalanceRequests: 0,
      totalWithdrawalRequests: 0,
      totalApiRequests: 0,
      totalUsers: 0
    };
  }
}

/**
 * Get recent events (with optional limit)
 */
export async function getRecentEvents(limit = 50) {
  try {
    const events = await redis.lrange(EVENTS_KEY, 0, limit - 1);
    return events.map(event => JSON.parse(event));
  } catch (error) {
    console.error('Error getting recent events:', error);
    return [];
  }
}

/**
 * Get analytics dashboard data
 */
export async function getDashboardData() {
  try {
    const [stats, recentEvents] = await Promise.all([
      getStats(),
      getRecentEvents(10) // Get 10 most recent events for dashboard
    ]);
    
    return {
      stats,
      recentEvents
    };
  } catch (error) {
    console.error('Error getting dashboard data:', error);
    return {
      stats: {
        totalRequests: 0,
        totalBalanceRequests: 0,
        totalWithdrawalRequests: 0,
        totalApiRequests: 0,
        totalFreeTrialRequests: 0,
        totalWelcomeMessages: 0,
        totalUsers: 0
      },
      recentEvents: []
    };
  }
} 