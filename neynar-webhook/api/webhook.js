import axios from 'axios';
import { createWalletClient, createPublicClient, http, publicActions, formatUnits } from 'viem';
import { toAccount } from 'viem/accounts';
import { base, baseSepolia } from 'viem/chains';
import { withPaymentInterceptor } from 'x402-axios';
import { CdpClient } from '@coinbase/cdp-sdk';
import { NeynarAPIClient, Configuration } from '@neynar/nodejs-sdk';
import { erc20Abi } from 'viem';

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

// Helper function to create CDP client and smart account
async function createSmartAccountClient(authorFid) {
 
  // Check for required CDP environment variables
  const cdpApiKeyId = process.env.CDP_API_KEY_ID;
  const cdpApiKeySecret = process.env.CDP_API_KEY_SECRET;
  const cdpWalletSecret = process.env.CDP_WALLET_SECRET;

  if (!cdpApiKeyId || !cdpApiKeySecret || !cdpWalletSecret) {
    console.error('Missing CDP environment variables');
    throw new Error('CDP credentials not configured');
  }

  // Initialize CDP client
  const cdp = new CdpClient({
    apiKeyId: process.env.CDP_API_KEY_ID,
    apiKeySecret: process.env.CDP_API_KEY_SECRET,
    walletSecret: process.env.CDP_WALLET_SECRET
  });

  // Create or get existing account using author's FID
  const account = await cdp.evm.getOrCreateAccount({
    name: `${authorFid}`,
  });
  console.log("EVM Account Address: ", account.address);

  // TODO: Use smart account + paymaster on mainnet
  // Get or create smart account
  // let smartAccount;
  // const existingSmartAccountAddress = process.env.SMART_ACCOUNT_ADDRESS;

  // if (existingSmartAccountAddress) {
  //   console.log("Using existing smart account:", existingSmartAccountAddress);
  //   smartAccount = await cdp.evm.getSmartAccount({
  //     address: existingSmartAccountAddress,
  //     owner: account,
  //   });
  //   console.log("Retrieved smart account:", smartAccount.address);
  // } else {
  //   console.log("Creating new smart account...");
  //   smartAccount = await cdp.evm.createSmartAccount({ owner: account });
  //   console.log("Created smart account:", smartAccount.address);
  // }

  // Determine network and chain
  const network = process.env.NETWORK || 'base-sepolia';
  const chain = network === "base" ? base : baseSepolia;

  if (chain === baseSepolia) {
    // Check USDC balance
    const usdcAddress = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
    const publicClient = createPublicClient({
      chain,
      transport: http(),
    });

    try {
      // Check USDC balance (USDC has 6 decimals)
      const usdcBalance = await publicClient.readContract({
        address: usdcAddress,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [account.address],
      });

      // Convert balance to human readable format (USDC has 6 decimals)
      const balanceInUsdc = parseFloat(formatUnits(usdcBalance, 6));
      console.log(`Current USDC balance: ${balanceInUsdc}`);

      // Only request from faucet if balance is less than 0.1 USDC
      if (balanceInUsdc < 0.1) {
        console.log("USDC balance is low, requesting testnet USDC from faucet...");
        const { transactionHash: faucetTransactionHash } = await cdp.evm.requestFaucet({
          address: account.address,
          network: "base-sepolia",
          token: "usdc",
        });

        console.log("Waiting for funds to arrive...");
        const faucetTxReceipt = await publicClient.waitForTransactionReceipt({
          hash: faucetTransactionHash,
        });
        console.log("Received testnet USDC");
      } else {
        console.log("USDC balance is sufficient, skipping faucet request");
      }
    } catch (balanceError) {
      console.error('Error checking USDC balance:', balanceError);
      // Fallback to requesting from faucet if balance check fails
      console.log("Fallback: Requesting testnet USDC from faucet...");
      const { transactionHash: faucetTransactionHash } = await cdp.evm.requestFaucet({
        address: account.address,
        network: "base-sepolia",
        token: "usdc",
      });

      console.log("Waiting for funds to arrive...");
      const faucetTxReceipt = await publicClient.waitForTransactionReceipt({
        hash: faucetTransactionHash,
      });
      console.log("Received testnet USDC");
    }
  }

  // Create wallet client
  const client = createWalletClient({
    account: toAccount({
      ...account,
      signTypedData: async (typedData) => {
        return await account.signTypedData({
          domain: typedData.domain,
          types: typedData.types,
          primaryType: typedData.primaryType,
          message: typedData.message,
        });
      },
    }),
    chain,
    transport: http(),
  }).extend(publicActions);

  return { client, account };
}

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const webhookData = req.body;
    
    // Log the webhook event
    console.log('Received webhook event:', JSON.stringify(webhookData, null, 2));

    // Get the TrueCast API URL from environment variables
    const trueCastApiUrl = process.env.TRUECAST_API_URL;
    if (!trueCastApiUrl) {
      console.error('Missing TRUECAST_API_URL environment variable');
      return res.status(200).json({ 
        message: 'Webhook received but TrueCast API URL not configured' 
      });
    }

    // Check if this is a cast.created event with a mention
    if (webhookData.type === 'cast.created') {
      const cast = webhookData.data;
      console.log(`New cast from @${cast.author.username} (FID: ${cast.author.fid}): ${cast.text}`);
      
      // Extract cast hash and lookup conversation summary
      const castHash = cast.hash;
      console.log('Cast hash:', castHash);
      
      // try {
      //   const client = createNeynarClient();
      //   const summary = await client.lookupCastConversationSummary({ identifier: castHash });
      //   console.log('Cast conversation summary:', JSON.stringify(summary, null, 2));
      // } catch (summaryError) {
      //   console.error('Error fetching cast conversation summary:', summaryError);
      // }
      
      try {
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

        // Cast a reply with the API response message
        try {
          // Extract the 'reply' field from the API response
          const replyMessage = response.data.reply || "I'm sorry, I was unable to process your request.";
          
          // Cast a reply to the original cast
          console.log('Casting reply to original cast...');
          await castReply(cast.hash, replyMessage);
          console.log('Reply cast successfully!');

        } catch (replyError) {
          console.error('Error casting reply:', replyError);
          // Continue execution even if reply fails
        }

        // Always return 200 to acknowledge receipt
        return res.status(200).json({ 
          message: 'Webhook processed and TrueCast API called successfully',
          trueCastResponse: response.data
        });

      } catch (apiError) {
        console.error('Error processing webhook:', apiError);
        
        // Handle CDP credentials error specifically
        if (apiError.message === 'CDP credentials not configured') {
          return res.status(200).json({ 
            message: 'Webhook received but CDP credentials not configured' 
          });
        }
        
        // Still return 200 to prevent webhook retries
        return res.status(200).json({ 
          message: 'Webhook received but processing failed',
          error: apiError.message
        });
      }
    }
    
    // For non-cast.created events, just acknowledge
    return res.status(200).json({ message: 'Webhook received successfully' });
    
  } catch (error) {
    console.error('Error processing webhook:', error);
    // Still return 200 to prevent webhook retries
    return res.status(200).json({ error: 'Error processing webhook' });
  }
} 