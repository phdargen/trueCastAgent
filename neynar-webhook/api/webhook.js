import axios from 'axios';
import { withPaymentInterceptor } from 'x402-axios';
import { NeynarAPIClient, Configuration } from '@neynar/nodejs-sdk';
import { createCdpAccount, checkUsdcBalance, withdrawUsdcBalance, getAdminAccount } from '../lib/cdp.js';
import { trackRequest } from '../lib/analytics.js';
import { 
  getFreeTrialsUsed, 
  incrementFreeTrialsUsed, 
  isEligibleForFreeTrial, 
  storeUserAddress,
  isProcessingCast,
  markCastAsProcessing
} from '../lib/redis.js';
import { formatUnits } from 'viem';
import { createHmac } from 'crypto';

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

// Helper function to get BaseScan base URL based on network
function getBaseScanBaseUrl() {
  const network = process.env.NETWORK || 'base-sepolia';
  return network === 'base' ? 'https://basescan.org' : 'https://sepolia.basescan.org';
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
 * Verify webhook signature to ensure the request is from Neynar
 */
function verifyWebhookSignature(body, signature, secret) {
  if (!signature) {
    throw new Error('Neynar signature missing from request headers');
  }

  if (!secret) {
    throw new Error('NEYNAR_WEBHOOK_SECRET environment variable is required');
  }

  const hmac = createHmac('sha512', secret);
  hmac.update(body);
  const generatedSignature = hmac.digest('hex');

  return generatedSignature === signature;
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
    const { account, cdp } = await createCdpAccount(cast.author.fid);

    // Store the FID to address mapping
    await storeUserAddress(cast.author.fid, account.address);

    // Check USDC balance
    const balance = await checkUsdcBalance(account.address);

    // Check if this is a balance check request
    if (cast.text.includes('!balance')) {
      console.log('Balance check requested, checking USDC balance...');
      
      // Format balance for display (USDC has 6 decimals)
      const balanceFormatted = parseFloat(formatUnits(balance, 6)).toFixed(2);
      
      // Format balance message
      const replyMessage = `Your account ${account.address} has ${balanceFormatted} USDC`;
      
      // Create BaseScan address URL
      const baseScanUrl = `${getBaseScanBaseUrl()}/address/${account.address}`;
      
      console.log('Balance check result:', replyMessage);
      
      // Track balance request analytics
      await trackRequest('balance', cast.author.fid, cast, replyMessage);
      
      // Cast reply with balance and BaseScan embed
      await castReply(cast.hash, replyMessage, baseScanUrl);
      console.log('Balance reply cast successfully!');
      return;
    }

    // Check if this is a withdraw request
    if (cast.text.includes('!withdraw')) {
      console.log('Withdraw requested, processing withdrawal...');
      
      // Check if user has a verified primary ETH address
      const primaryEthAddress = cast.author.verified_addresses?.primary?.eth_address;
      
      if (!primaryEthAddress) {
        const errorMessage = 'No verified primary ETH address found. Please verify an ETH address to use withdrawal.';
        console.log('Withdrawal failed:', errorMessage);
        
        // Track failed withdrawal request analytics
        await trackRequest('withdrawal', cast.author.fid, cast, errorMessage);
        
        await castReply(cast.hash, errorMessage);
        return;
      }
      
      try {
        // Withdraw full USDC balance to verified primary ETH address (pass raw balance)
        const { withdrawnBalance, transactionHash, toAddress } = await withdrawUsdcBalance(cast.author.fid, primaryEthAddress, balance);
        
        // Format withdrawal confirmation message (format raw withdrawnBalance for display)
        const withdrawnBalanceFormatted = parseFloat(formatUnits(withdrawnBalance, 6));
        const replyMessage = `Successfully withdrew ${withdrawnBalanceFormatted.toFixed(2)} USDC to ${toAddress}\n\nTx: ${transactionHash}`;
        
        // Create BaseScan transaction URL
        const txUrl = `${getBaseScanBaseUrl()}/tx/${transactionHash}`;
        
        console.log('Withdrawal successful:', replyMessage);
        
        // Track withdrawal request analytics
        await trackRequest('withdrawal', cast.author.fid, cast, replyMessage);
        
        // Cast reply with withdrawal details and transaction embed
        await castReply(cast.hash, replyMessage, txUrl);
        console.log('Withdrawal reply cast successfully!');
        return;
      } catch (withdrawError) {
        console.error('Withdrawal failed:', withdrawError);
        const errorMessage = `Withdrawal failed: ${withdrawError.message}`;
        
        // Track failed withdrawal request analytics
        await trackRequest('withdrawal', cast.author.fid, cast, errorMessage);
        
        await castReply(cast.hash, errorMessage);
        return;
      }
    }

    // Check if user is eligible for free trial
    const trialsUsed = await getFreeTrialsUsed(cast.author.fid);
    const isFirstTimeUser = trialsUsed === 0;
    const hasFreeTrial = await isEligibleForFreeTrial(cast.author.fid);
    const maxTrials = parseInt(process.env.N_FREE_TRIALS || '1');

    console.log(`User FID ${cast.author.fid} - Trials used: ${trialsUsed}/${maxTrials}, Has free trial: ${hasFreeTrial}, First time: ${isFirstTimeUser}`);

    // If this is a first-time user, send welcome message first
    if (isFirstTimeUser && hasFreeTrial) {
      console.log('Sending welcome message to first-time user...');
      const welcomeMessage = `Welcome to TrueCast! 🎉\n\nYou have ${maxTrials} free AI-powered fact-checks to get started. Just mention me in any cast you want fact-checked!\n\nAfter your free trials, you'll need USDC in your wallet to continue using the service.`;
      
      // Track welcome message
      await trackRequest('welcome', cast.author.fid, cast, welcomeMessage);
      
      // Cast welcome reply
      await castReply(cast.hash, welcomeMessage);
      console.log('Welcome message sent successfully!');
      
      // Small delay to ensure welcome message is processed before the fact-check
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Check if balance is sufficient (only if user doesn't have free trial)
    if (!hasFreeTrial) {
      const MIN_USDC_BALANCE = parseFloat(process.env.MIN_USDC_BALANCE || '0.01');
      const balanceFormatted = parseFloat(formatUnits(balance, 6));

      if (balanceFormatted < MIN_USDC_BALANCE) {
        console.log(`Balance too low (${balanceFormatted.toFixed(2)} USDC < ${MIN_USDC_BALANCE} USDC), sending balance warning...`);
        
        // Determine network for the message
        const network = process.env.NETWORK || 'base-sepolia';
        const networkName = network === 'base' ? 'Base' : 'Base Sepolia';
        
        const replyMessage = `Balance too low. Please send USDC to ${account.address} on ${networkName} to use this service.`;
        
        // Create BaseScan address URL
        const baseScanUrl = `${getBaseScanBaseUrl()}/address/${account.address}`;
        
        console.log('Balance warning:', replyMessage);
        
        // Track low balance warning as a balance request
        await trackRequest('balance', cast.author.fid, cast, replyMessage);
        
        // Cast reply with balance warning and BaseScan embed
        await castReply(cast.hash, replyMessage, baseScanUrl);
        console.log('Balance warning reply cast successfully!');
        return;
      }
    }

    // Get the TrueCast API URL from environment variables
    const trueCastApiUrl = process.env.TRUECAST_API_URL;
    if (!trueCastApiUrl) {
      console.error('Missing TRUECAST_API_URL environment variable');
      return;
    }

    // Determine which account to use for payment
    let paymentAccount;
    if (hasFreeTrial) {
      console.log('Using admin account to sponsor free trial API call...');
      const { account: adminAccount } = await getAdminAccount(cdp);
      paymentAccount = adminAccount;
    } else {
      console.log('Using user account for paid API call...');
      paymentAccount = account;
    }

    // Create axios instance with payment interceptor
    const api = withPaymentInterceptor(
      axios.create({
        baseURL: trueCastApiUrl,
      }),
      paymentAccount,
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
    let replyMessage = response.data.reply;
    
    // Only cast if there's a valid reply
    if (!replyMessage || replyMessage.trim() === '') {
      console.log('No valid reply message received, skipping cast');
      // Track API request even if no reply
      const requestType = hasFreeTrial ? 'freeTrial' : 'api';
      await trackRequest(requestType, cast.author.fid, cast, 'No reply generated');
      return;
    }

    // Add trials remaining message if this was a free trial
    if (hasFreeTrial) {
      const newTrialsUsed = trialsUsed + 1;
      const remainingTrials = maxTrials - newTrialsUsed;
      if (remainingTrials > 0) {
        replyMessage += `\n\n🎁 You have ${remainingTrials} free trials remaining!`;
      } else {
        replyMessage += `\n\n🎁 That was your last free trial! Add USDC to your wallet to continue using TrueCast.`;
      }
    }
    
    // If this was a free trial, increment the counter after successful API call
    if (hasFreeTrial) {
      await incrementFreeTrialsUsed(cast.author.fid);
      const newTrialsUsed = trialsUsed + 1;
      const remainingTrials = maxTrials - newTrialsUsed;
      console.log(`Free trial used! User now has ${remainingTrials} trials remaining.`);
    }

    // Track successful API request analytics
    const requestType = hasFreeTrial ? 'freeTrial' : 'api';
    await trackRequest(requestType, cast.author.fid, cast, replyMessage);
    
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

  // Verify webhook signature
  try {
    const signature = req.headers['x-neynar-signature'];
    const webhookSecret = process.env.NEYNAR_WEBHOOK_SECRET;
    const rawBody = JSON.stringify(req.body);
    
    const isValid = verifyWebhookSignature(rawBody, signature, webhookSecret);
    
    if (!isValid) {
      console.error('Invalid webhook signature');
      return res.status(401).json({ error: 'Invalid webhook signature' });
    }
    
    console.log('Webhook signature verified successfully');
  } catch (error) {
    console.error('Error verifying webhook signature:', error.message);
    return res.status(401).json({ error: error.message });
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