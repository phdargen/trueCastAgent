import { createWalletClient, createPublicClient, http, publicActions, formatUnits, erc20Abi } from 'viem';
import { toAccount } from 'viem/accounts';
import { base, baseSepolia } from 'viem/chains';
import { CdpClient } from '@coinbase/cdp-sdk';

/**
 * Helper function to create CDP client and smart account
 * @param {number} authorFid - The Farcaster ID of the author
 * @returns {Object} Object containing the wallet client and account
 */
export async function createSmartAccountClient(authorFid) {
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