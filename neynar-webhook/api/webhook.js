import axios from 'axios';
import { withPaymentInterceptor } from 'x402-axios';
import { NeynarAPIClient, Configuration } from '@neynar/nodejs-sdk';
import { createSmartAccountClient } from '../lib/cdp.js';

// Global Map to track recently processed casts (in-memory deduplication)
const processedCasts = new Map();

// Cleanup interval to remove old entries (5 minutes)
const CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes
const CAST_TTL = 5 * 60 * 1000; // 5 minutes

// Periodic cleanup of old entries
setInterval(() => {
  const now = Date.now();
  for (const [hash, timestamp] of processedCasts.entries()) {
    if (now - timestamp > CAST_TTL) {
      processedCasts.delete(hash);
    }
  }
}, CLEANUP_INTERVAL);

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
async function castReply(parentHash, message) {
  try {
    const client = createNeynarClient();

    const signerUuid = process.env.NEYNAR_MANAGER_SIGNER;
    if (!signerUuid) {
      console.error('Missing NEYNAR_MANAGER_SIGNER environment variable');
      throw new Error('Neynar signer UUID not configured');
    }
    
    const publishResponse = await client.publishCast({
      text: message,
      parent: parentHash,
      signer_uuid: signerUuid,
    });
    
    console.log('Successfully cast reply:', publishResponse);
    return publishResponse;
  } catch (error) {
    console.error('Error casting reply:', error);
    throw error;
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

    // Get the TrueCast API URL from environment variables
    const trueCastApiUrl = process.env.TRUECAST_API_URL;
    if (!trueCastApiUrl) {
      console.error('Missing TRUECAST_API_URL environment variable');
      return;
    }

    // Create smart account client using author's FID
    console.log('Creating CDP smart account client for author FID: ', cast.author.fid);
    const { client } = await createSmartAccountClient(cast.author.fid);

    // Create axios instance with payment interceptor
    const api = withPaymentInterceptor(
      axios.create({
        baseURL: trueCastApiUrl,
      }),
      client,
    );

    // Call the protected API route with the cast text as message
    console.log('Calling protected TrueCast API with payment...');
    const response = await api.post('/api/trueCast', {
      message: cast.text,
      author: cast.author.username,
      cast_hash: cast.hash,
      timestamp: cast.timestamp
    });

    console.log('TrueCast API call successful!');
    console.log('Response:', JSON.stringify(response.data, null, 2));

    // Extract the 'reply' field from the API response and cast it
    const replyMessage = response.data.reply || "I'm sorry, I was unable to process your request.";
    console.log('Casting reply to original cast...');
    await castReply(cast.hash, replyMessage);
    console.log('Reply cast successfully!');

  } catch (error) {
    console.error('Error processing webhook event:', error);

    // If processing fails, cast an error message as a reply
    try {
      let errorMessage = "I'm sorry, an error occurred while processing your request.";
      if (error.message === 'CDP credentials not configured') {
        errorMessage = "I can't process this right now due to a temporary configuration issue.";
      }
      await castReply(cast.hash, errorMessage);
    } catch (replyError) {
      console.error('Failed to cast error reply:', replyError);
    }
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
      
      // Check if we've already processed this cast recently
      if (processedCasts.has(castHash)) {
        console.log(`Cast ${castHash} already being processed or recently processed, skipping...`);
        return res.status(200).json({ message: 'Cast already processed' });
      }
      
      // Mark this cast as being processed
      processedCasts.set(castHash, Date.now());
      
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