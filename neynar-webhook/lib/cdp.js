import { createWalletClient, createPublicClient, http, publicActions, formatUnits, erc20Abi, keccak256, encodePacked } from 'viem';
import { toAccount } from 'viem/accounts';
import { base, baseSepolia } from 'viem/chains';
import { CdpClient } from '@coinbase/cdp-sdk';
import { randomBytes } from 'crypto';
import usdcAbi from './constants.js';

/**
 * Helper function to check USDC balance for an address
 */
export async function checkUsdcBalance(address) {
  try {
    // Determine network and chain
    const network = process.env.NETWORK || 'base-sepolia';
    const chain = network === "base" ? base : baseSepolia;
    
    // USDC contract addresses
    const usdcAddress = network === "base" 
      ? '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'  // Base mainnet
      : '0x036CbD53842c5426634e7929541eC2318f3dCF7e'; // Base Sepolia

    const publicClient = createPublicClient({
      chain,
      transport: http(),
    });

    // Check USDC balance 
    const usdcBalance = await publicClient.readContract({
      address: usdcAddress,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [address],
    });

    return usdcBalance;
  } catch (error) {
    console.error('Error checking USDC balance:', error);
    throw error;
  }
}

/**
 * Helper function to create CDP account
 * @param {number} authorFid - The Farcaster ID of the author
 * @returns {Object} Object containing the account
 */
export async function createCdpAccount(authorFid) {
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

  return { account };
}



/**
 * Helper function to withdraw USDC balance using gasless transferWithAuthorization
 * @param {number} authorFid - The Farcaster ID of the author
 * @param {string} toAddress - The address to send USDC to
 * @param {number} balance - The USDC balance to withdraw
 * @returns {Object} Object containing the withdrawn balance and transaction hash
 */
export async function withdrawUsdcBalance(authorFid, toAddress, balance) {
  try {
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

    // Get the user's account using author's FID
    const userAccount = await cdp.evm.getOrCreateAccount({
      name: `${authorFid}`,
    });

    // Get the admin account for relaying (paying gas)
    const adminAccount = await cdp.evm.getOrCreateAccount({
      name: process.env.SMART_ACCOUNT_OWNER_NAME || "X402PaymentAccount",
    });

    console.log("User Account Address: ", userAccount.address);
    console.log("Admin Account Address: ", adminAccount.address);
    console.log("Withdrawing to Address: ", toAddress);

    // Determine network and chain
    const network = process.env.NETWORK || 'base-sepolia';
    const chain = network === "base" ? base : baseSepolia;
    
    // USDC contract address
    const usdcAddress = network === "base" 
      ? '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'  // Base mainnet
      : '0x036CbD53842c5426634e7929541eC2318f3dCF7e'; // Base Sepolia

    const balanceFormatted = parseFloat(formatUnits(balance, 6));
    console.log(`Withdrawing USDC balance: ${balanceFormatted} USDC (${balance} raw units)`);

    if (balance <= 0n) {
      throw new Error('No USDC balance to withdraw');
    }

    // Generate a unique nonce for this authorization
    const nonce = `0x${randomBytes(32).toString('hex')}`;
    
    // Set validity window (5 minutes from now)
    const validAfter = 0;
    const validBefore = Math.floor(Date.now() / 1000) + 300; // 5 minutes

    // Prepare EIP-712 domain data
    const domain = {
      name: 'USD Coin',
      version: '2',
      chainId: chain.id,
      verifyingContract: usdcAddress,
    };

    // Prepare the message data for transferWithAuthorization
    const types = {
      TransferWithAuthorization: [
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'validAfter', type: 'uint256' },
        { name: 'validBefore', type: 'uint256' },
        { name: 'nonce', type: 'bytes32' },
      ],
    };

    const message = {
      from: userAccount.address,
      to: toAddress,
      value: balance.toString(),
      validAfter: validAfter,
      validBefore: validBefore,
      nonce: nonce,
    };

    console.log('Signing authorization message...');
    
    // Sign the EIP-712 message with the user's account
    const signature = await userAccount.signTypedData({
      domain,
      types,
      primaryType: 'TransferWithAuthorization',
      message,
    });

    console.log('Authorization signed, now relaying transaction...');

    // Create viem wallet client using the admin account
    const adminWalletClient = createWalletClient({
      account: toAccount(adminAccount),
      chain,
      transport: http(),
    });

    // Send the transaction using viem wallet client
    const transactionHash = await adminWalletClient.writeContract({
      address: usdcAddress,
      abi: usdcAbi,
      functionName: 'transferWithAuthorization',
      args: [
        userAccount.address,  // from
        toAddress,            // to
        balance,              // value (as bigint)
        validAfter,           // validAfter
        validBefore,          // validBefore
        nonce,                // nonce
        signature,            // signature
      ],
    });

    console.log('Transaction submitted:', transactionHash);

    // Create public client for waiting for transaction confirmation
    const publicClient = createPublicClient({
      chain,
      transport: http(),
    });

    // Wait for transaction confirmation
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: transactionHash,
    });

    console.log('Transaction confirmed:', receipt);

    return {
      withdrawnBalance: balance,
      transactionHash: transactionHash,
      toAddress: toAddress,
      signature: signature,
      nonce: nonce
    };

  } catch (error) {
    console.error('Error withdrawing USDC balance:', error);
    throw error;
  }
} 