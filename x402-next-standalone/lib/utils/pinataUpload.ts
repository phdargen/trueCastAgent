/**
 * Pinata Upload Utility
 * Uploads TrueCast responses to Pinata IPFS using direct API or x402 paid requests
 */

import { CdpWalletProvider, x402ActionProvider } from "@coinbase/agentkit";
import { TrueCastResponse } from "../trueCastEngine";

// Define the Pinata API response types for direct uploads
interface PinataDirectUploadResponse {
  IpfsHash: string;
  PinSize: number;
  Timestamp: string;
  isDuplicate?: boolean;
}

// Define the Pinata API response type for getting presigned URL (x402)
interface PinataPreSignedResponse {
  url: string;
}

// Define the x402 wrapped response type
interface X402Response {
  success: boolean;
  data: PinataPreSignedResponse;
  status: number;
  url: string;
  method: string;
  paymentResponse?: {
    network: string;
    payer: string;
    success: boolean;
    transaction: string;
  };
}

// Define the final upload response from Pinata (for x402 presigned uploads)
interface PinataUploadResponse {
  data: {
    id: string;
    user_id: string;
    name: string;
    keyvalues: Record<string, unknown>;
    network: string;
    vectorized: boolean;
    created_at: string;
    updated_at: string;
    accept_duplicates: boolean;
    streamable: boolean;
    car: boolean;
    cid: string; // This is the IPFS hash
    mime_type: string;
    size: number;
    number_of_files: number;
  };
}

// Define the return type that includes both IPFS hash and payment info
export interface PinataUploadResult {
  ipfsHash: string;
  paymentResponse?: {
    network: string;
    payer: string;
    success: boolean;
    transaction: string;
  };
}

let walletProvider: CdpWalletProvider | null = null;

/**
 * Initializes the CDP wallet provider with configuration from environment variables
 * This is used for making paid requests through x402 when PINATA_JWT is not available
 */
async function initializeWalletProvider(): Promise<void> {
  try {
    // Configure CDP Wallet Provider
    walletProvider = await CdpWalletProvider.configureWithWallet({
      apiKeyId: process.env.CDP_API_KEY_ID,
      apiKeySecret: process.env.CDP_API_KEY_SECRET,
      mnemonicPhrase: process.env.MNEMONIC_PHRASE,
      networkId: "base-mainnet",
    });
  } catch (error) {
    console.error("Failed to initialize CDP wallet provider:", error);
  }
}

/**
 * Uploads JSON data directly to Pinata using the standard API
 *
 * @param responseJson - The JSON string to upload
 * @param fileName - The name for the uploaded file
 * @param pinataJwt - The Pinata JWT token
 * @returns Promise resolving to the upload result
 */
async function uploadJsonDirectly(
  responseJson: string,
  fileName: string,
  pinataJwt: string,
): Promise<PinataDirectUploadResponse> {
  const requestBody = {
    pinataOptions: {
      cidVersion: 1,
    },
    pinataMetadata: {
      name: fileName,
    },
    pinataContent: JSON.parse(responseJson),
  };

  const response = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${pinataJwt}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Failed to upload JSON to IPFS: ${error.message || response.statusText}`);
  }

  const data = await response.json();
  return {
    IpfsHash: data.IpfsHash,
    PinSize: data.PinSize,
    Timestamp: data.Timestamp,
    isDuplicate: data.isDuplicate || false,
  };
}

/**
 * Uploads TrueCast response to Pinata IPFS
 *
 * @param response - The TrueCast response to upload
 * @param network - IPFS network to use ("public" or "private") - only used for x402 fallback
 * @returns Promise resolving to the upload result with IPFS hash and payment info, or null if failed
 */
export async function uploadToPinata(
  response: TrueCastResponse,
  network: "public" | "private" = "public",
): Promise<PinataUploadResult | null> {
  try {
    console.log("📌 Uploading TrueCast response to Pinata IPFS...");

    // Convert response to JSON string
    const responseJson = JSON.stringify(response, null, 2);
    const uuid = crypto.randomUUID();
    const fileName = `truecast-response-${uuid}.json`;

    // Check if PINATA_JWT is available for direct upload
    if (process.env.PINATA_JWT) {
      console.log("Using direct Pinata API call with JWT token");

      try {
        // Use direct JSON upload to Pinata
        const uploadResult = await uploadJsonDirectly(
          responseJson,
          fileName,
          process.env.PINATA_JWT,
        );

        console.log("✅ Successfully uploaded to Pinata IPFS (direct):", {
          hash: uploadResult.IpfsHash,
          size: uploadResult.PinSize,
          isDuplicate: uploadResult.isDuplicate,
        });

        return {
          ipfsHash: uploadResult.IpfsHash,
        };
      } catch (error) {
        console.error("❌ Direct Pinata upload failed:", error);
        console.log("🔄 Falling back to x402 paid request...");
        // Fall through to x402 fallback
      }
    }

    // Fallback to x402 paid request
    console.log("Using x402 paid request for Pinata upload");

    // Ensure wallet provider is initialized for x402 fallback
    if (!walletProvider) {
      await initializeWalletProvider();
      if (!walletProvider) {
        console.error("Failed to initialize CDP wallet provider and no valid PINATA_JWT provided");
        return null;
      }
    }

    // Calculate file size for x402 request
    const fileSize = new Blob([responseJson]).size;
    const pinataApiUrl = `https://402.pinata.cloud/v1/pin/${network}`;

    // Make paid request using x402 provider
    const x402Provider = x402ActionProvider();
    const rawX402Response = await x402Provider.paidRequest(walletProvider, {
      url: pinataApiUrl,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fileSize }),
    });

    // Handle x402 response - it wraps the Pinata API response in a data field
    console.log("📋 Raw x402 response:", rawX402Response);

    let x402Response: X402Response;
    if (typeof rawX402Response === "string") {
      x402Response = JSON.parse(rawX402Response) as X402Response;
    } else {
      x402Response = rawX402Response as X402Response;
    }

    // Extract the payment response for the UI
    let paymentResponse:
      | { network: string; payer: string; success: boolean; transaction: string }
      | undefined;
    if (x402Response.paymentResponse) {
      paymentResponse = x402Response.paymentResponse;
      console.log("📋 Payment response extracted:", paymentResponse);
    }

    // Extract the actual presigned response from the x402 wrapper
    const preSignedResponse = x402Response.data;
    console.log("📋 Parsed presigned response:", preSignedResponse);

    // Validate presigned URL response
    if (!preSignedResponse.url) {
      console.error("No presigned URL received from Pinata API");
      return null;
    }

    // Create file and upload using presigned URL
    const file = new File([responseJson], fileName, { type: "application/json" });

    const formData = new FormData();
    formData.append("network", network);
    formData.append("file", file);

    const uploadResponse = await fetch(preSignedResponse.url, {
      method: "POST",
      body: formData,
    });

    if (!uploadResponse.ok) {
      throw new Error(
        `Pinata upload failed: ${uploadResponse.status} ${uploadResponse.statusText}`,
      );
    }

    const uploadResult = (await uploadResponse.json()) as PinataUploadResponse;

    console.log("📋 Raw Pinata upload response:", uploadResult);

    // Extract IPFS hash from response
    const ipfsHash = uploadResult.data.cid;
    const uploadedSize = uploadResult.data.size;

    // Check if we got a valid IPFS hash
    if (!ipfsHash) {
      console.error("❌ No IPFS hash in Pinata response:", uploadResult);
      return null;
    }

    console.log("✅ Successfully uploaded to Pinata IPFS (x402):", {
      hash: ipfsHash,
      size: uploadedSize,
      network,
      paymentUsed: !!paymentResponse,
    });

    return {
      ipfsHash,
      paymentResponse,
    };
  } catch (error) {
    console.error("❌ Error uploading to Pinata:", error);
    return null;
  }
}

/**
 * Gets the public IPFS URL for a given hash
 *
 * @param ipfsHash - The IPFS hash
 * @returns The public gateway URL
 */
export function getPinataGatewayUrl(ipfsHash: string): string {
  return `https://gateway.pinata.cloud/ipfs/${ipfsHash}`;
}
