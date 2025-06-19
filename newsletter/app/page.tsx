"use client";

import { useEffect, useState } from "react";
import { encodeFunctionData, erc20Abi, parseUnits } from "viem";
import { useConnect, useSendCalls } from "wagmi";

interface DataRequest {
  email: boolean;
  address: boolean;
}

interface ProfileResult {
  success: boolean;
  email?: string;
  address?: string;
  error?: string;
}

export default function Home() {
  const [dataToRequest, setDataToRequest] = useState<DataRequest>({
    email: true,
    address: true
  });
  const [result, setResult] = useState<ProfileResult | null>(null);

  const { sendCalls, data, error, isPending } = useSendCalls();
  const { connect, connectors } = useConnect()

  // Function to get callback URL - uses environment variable
  function getCallbackURL() {
    const baseUrl = process.env.NEXT_PUBLIC_URL || "http://localhost:3000";
    return `${baseUrl}/api/data-validation`;
  }

  // Handle response data when sendCalls completes
  useEffect(() => {
    if (data?.capabilities?.dataCallback) {
      const callbackData = data.capabilities.dataCallback;
      const newResult: ProfileResult = { success: true };

      // Extract email if provided
      if (callbackData.email) newResult.email = callbackData.email;

      // Extract address if provided
      if (callbackData.physicalAddress) {
        const addr = callbackData.physicalAddress;
        newResult.address = [
          addr.address1,
          addr.address2,
          addr.city,
          addr.state,
          addr.postalCode,
          addr.countryCode
        ].filter(Boolean).join(", ");
      }

      setResult(newResult);
    } else if (data && !data.capabilities?.dataCallback) {
      setResult({ success: false, error: "Invalid response - no data callback" });
    }
  }, [data]);

  // Handle errors
  useEffect(() => {
    if (error) {
      setResult({
        success: false,
        error: error.message || "Transaction failed"
      });
    }
  }, [error]);

  // Handle form submission
  async function handleSubmit() {
    try {
      setResult(null);

      // Build requests array based on checkboxes
      const requests = [];
      if (dataToRequest.email) requests.push({ type: "email", optional: false });
      if (dataToRequest.address) requests.push({ type: "physicalAddress", optional: false });

      if (requests.length === 0) {
        setResult({ success: false, error: "Select at least one data type" });
        return;
      }

      // Send calls using wagmi hook
      sendCalls({
        connector: connectors[0],
        account: null,
        calls: [
          {
            to: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // USDC contract address on Base Sepolia
            data: encodeFunctionData({
              abi: erc20Abi,
              functionName: "transfer",
              args: [
                "0xd8da6bf26964af9d7eed9e03e53415d37aa96045",
                parseUnits("0.01", 6),
              ],
            }),
          },
        ],
        chainId: 84532, // Base Sepolia
        capabilities: {
          dataCallback: {
            requests: requests,
            callbackURL: getCallbackURL(),
          },
        },
      });
    } catch (err) {
      setResult({
        success: false,
        error: err instanceof Error ? err.message : "Unknown error occurred"
      });
    }
  }

  return (
    <div className="flex flex-col min-h-screen font-sans dark:bg-background dark:text-white bg-white text-black">
      <div style={{ maxWidth: "600px", margin: "0 auto", padding: "20px" }}>
        <h1 className="text-3xl font-bold mb-6">Smart Wallet Profiles Demo</h1>



        {/* Data Request Form */}
        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-4">Checkout (Transfer 0.01 USDC)</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Select the profile information you'd like to request:
          </p>

          <div className="space-y-3 mb-4">
            <div>
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={dataToRequest.email}
                  onChange={() => setDataToRequest(prev => ({ ...prev, email: !prev.email }))}
                  className="form-checkbox h-4 w-4 text-blue-600"
                />
                <span>Email Address</span>
              </label>
            </div>

            <div>
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={dataToRequest.address}
                  onChange={() => setDataToRequest(prev => ({ ...prev, address: !prev.address }))}
                  className="form-checkbox h-4 w-4 text-blue-600"
                />
                <span>Physical Address</span>
              </label>
            </div>
          </div>

          <button
            onClick={handleSubmit}
            disabled={isPending}
            className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-bold py-2 px-4 rounded transition-colors"
          >
            {isPending ? "Processing..." : "Checkout"}
          </button>
        </div>

        {/* Results Display */}
        {result && (
          <div className={`p-4 rounded-lg ${
            result.success 
              ? "bg-green-100 dark:bg-green-900 border border-green-300 dark:border-green-700" 
              : "bg-red-100 dark:bg-red-900 border border-red-300 dark:border-red-700"
          }`}>
            {result.success ? (
              <>
                <h3 className="text-lg font-semibold mb-2 text-green-800 dark:text-green-200">
                  Profile Data Received
                </h3>
                {result.email && (
                  <p className="mb-1">
                    <strong>Email:</strong> <span className="font-mono">{result.email}</span>
                  </p>
                )}
                {result.address && (
                  <p>
                    <strong>Address:</strong> <span className="font-mono">{result.address}</span>
                  </p>
                )}
              </>
            ) : (
              <>
                <h3 className="text-lg font-semibold mb-2 text-red-800 dark:text-red-200">
                  Error
                </h3>
                <p className="text-red-700 dark:text-red-300">{result.error}</p>
              </>
            )}
          </div>
        )}


      </div>
    </div>
  );
}
