import axios from 'axios';
import { withPaymentInterceptor } from 'x402-axios';
import { NeynarAPIClient, Configuration } from '@neynar/nodejs-sdk';
import { createSmartAccountClient, checkUsdcBalance } from '../lib/cdp.js';
import { Redis } from '@upstash/redis';

// Initialize Redis client
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// Helper function to create Neynar client
function createNeynarClient() {
  const apiKey = process.env.NEYNAR_API_KEY;
  if (!apiKey) {
    throw new Error('NEYNAR_API_KEY environment variable is required');
  }

  const config = new Configuration({
    apiKey: apiKey,
  });

  return new NeynarAPIClient(config);
}

// Helper function to cast a reply
async function castReply(parentHash, message, embedUrl = null) {
  try {
    const client = createNeynarClient();

    const signerUuid = process.env.NEYNAR_MANAGER_SIGNER;
    if (!signerUuid) {
      console.error('Missing NEYNAR_MANAGER_SIGNER environment variable');
      throw new Error('Neynar signer UUID not configured');
    }
    
    const castData = {
      text: message,
      parent: parentHash,
      signer_uuid: signerUuid,
      embeds: embedUrl ? [{ url: embedUrl }] : undefined,
    };
    console.log('Cast data being sent to Neynar:', JSON.stringify(castData, null, 2));
    console.log('Embed URL:', embedUrl);

    const publishResponse = await client.publishCast(castData);
    
    console.log('Successfully cast reply:', publishResponse);
    return publishResponse;
  } catch (error) {
    console.error('Error casting reply:', error);
    throw error;
  }
}

/**
 * Check if a cast is already being processed using Upstash Redis
 */
async function isProcessingCast(castHash) {
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
async function markCastAsProcessing(castHash) {
  try {
    await redis.setex(`webhook:processing:${castHash}`, 300, Date.now()); // 5 minutes
  } catch (error) {
    console.error('Error marking cast as processing in Redis:', error);
    // If Redis fails, continue anyway
  }
}

/**
 * Processes a Farcaster cast event by calling the TrueCast API and posting a reply.
 * This function handles the main logic including smart account creation,
 * API payment and cast reply
 */
async function processCastEvent(cast) {
  try {
    console.log(`Processing cast from @${cast.author.username} (FID: ${cast.author.fid}): ${cast.text}`);

    // Create smart account client using author's FID 
    console.log('Creating CDP smart account client for author FID: ', cast.author.fid);
    const { account } = await createSmartAccountClient(cast.author.fid);

    // Check if this is a balance check request
    if (cast.text.includes('/balance')) {
      console.log('Balance check requested, checking USDC balance...');
            
      // Check USDC balance
      const balance = await checkUsdcBalance(account.address);
      
      // Format balance message
      const replyMessage = `Your account ${account.address} has ${balance.toFixed(6)} USDC`;
      
      console.log('Balance check result:', replyMessage);
      
      // Cast reply with balance
      await castReply(cast.hash, replyMessage);
      console.log('Balance reply cast successfully!');
      return;
    }

    // Get the TrueCast API URL from environment variables
    const trueCastApiUrl = process.env.TRUECAST_API_URL;
    if (!trueCastApiUrl) {
      console.error('Missing TRUECAST_API_URL environment variable');
      return;
    }

    // Create axios instance with payment interceptor
    const api = withPaymentInterceptor(
      axios.create({
        baseURL: trueCastApiUrl,
      }),
      account,
    );

    // Call the protected API route with the cast text as message
    console.log('Calling protected TrueCast API with payment...');
    const requestData = {
      message: cast.text
    };
    
    // Only include castHash if this is a reply (parent_hash exists)
    if (cast.parent_hash != null) {
      requestData.castHash = cast.hash;
      console.log('Including castHash for reply:', cast.hash);
    }
    
    const response = await api.post('/api/trueCast', requestData);

    console.log('TrueCast API call successful!');
    console.log('Response:', JSON.stringify(response.data, null, 2));

    // Extract the 'reply' field from the API response
    const replyMessage = response.data.reply;
    
    // Only cast if there's a valid reply
    if (!replyMessage || replyMessage.trim() === '') {
      console.log('No valid reply message received, skipping cast');
      return;
    }
    
    // Check if there's a prediction market address for embed
    let embedUrl = null;
    if (response.data.marketSentiment?.marketAddress) {
      const marketAddress = response.data.marketSentiment.marketAddress;
      embedUrl = `https://true-cast.vercel.app/share/${marketAddress}`;
      console.log('Adding market embed URL:', embedUrl);
    }
    
    console.log('Casting reply to original cast...');
    await castReply(cast.hash, replyMessage, embedUrl);
    console.log('Reply cast successfully!');

  } catch (error) {
    console.error('Error processing webhook event:', error);
  }
}

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Process the webhook payload
  try {
    const webhookData = req.body;
    
    // Log the webhook event
    console.log('Received webhook event:', JSON.stringify(webhookData, null, 2));

    // Handle cast creation events (when someone mentions the bot or replies)
    if (webhookData.type === 'cast.created') {
      const castHash = webhookData.data.hash;
      
      // Check if we're already processing this cast
      if (await isProcessingCast(castHash)) {
        console.log(`Cast ${castHash} already being processed, skipping...`);
        return res.status(200).json({ message: 'Cast already processed' });
      }
      
      // Mark this cast as being processed
      await markCastAsProcessing(castHash);
      
      // Process the cast event synchronously
      await processCastEvent(webhookData.data);
      
      // Send success response after processing is complete
      return res.status(200).json({ message: 'Webhook processed successfully' });
    } else {
      // For non-cast events, just acknowledge receipt
      return res.status(200).json({ message: 'Webhook received' });
    }
    
  } catch (error) {
    // Handle errors in webhook processing
    console.error('Error processing webhook:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
} 