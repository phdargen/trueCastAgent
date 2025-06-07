'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAccount, useConnect, useDisconnect, useWalletClient, useSwitchChain } from 'wagmi';
import { wrapFetchWithPayment, decodeXPaymentResponse } from 'x402-fetch';
import { baseSepolia } from 'wagmi/chains';

export default function TrueCastPage() {
  const [message, setMessage] = useState('');
  const [response, setResponse] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentResponse, setPaymentResponse] = useState<any>(null);

  const { address, isConnected, chain } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { data: walletClient } = useWalletClient();
  const { switchChain, isPending: isSwitchingChain } = useSwitchChain();

  const isOnCorrectChain = chain?.id === baseSepolia.id;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    if (!isConnected) {
      setError('Please connect your wallet first');
      return;
    }

    if (!isOnCorrectChain) {
      setError(`Please switch to ${baseSepolia.name} network`);
      return;
    }

    if (!walletClient) {
      setError('Wallet client not available. Please ensure your wallet supports signing.');
      return;
    }

    setLoading(true);
    setError(null);
    setResponse(null);
    setPaymentResponse(null);

    try {
      const fetchWithPayment = wrapFetchWithPayment(fetch, walletClient);
      
      const response = await fetchWithPayment(`/api/trueCast?message=${encodeURIComponent(message)}`, {
        method: 'GET',
      });

      // Check if response is ok and content type is JSON
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Request failed (${response.status}): ${errorText}`);
      }

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const responseText = await response.text();
        throw new Error(`Expected JSON response but got: ${responseText.substring(0, 100)}...`);
      }

      const body = await response.json();
      setResponse({ type: 'GET', data: body });

      const paymentResponseHeader = response.headers.get('x-payment-response');
      if (paymentResponseHeader) {
        try {
          // Check if the header is already a JSON string
          if (paymentResponseHeader.startsWith('{') && paymentResponseHeader.endsWith('}')) {
            const decodedPaymentResponse = JSON.parse(paymentResponseHeader);
            setPaymentResponse(decodedPaymentResponse);
          } else {
            // Try the standard decoding function
            const decodedPaymentResponse = decodeXPaymentResponse(paymentResponseHeader);
            setPaymentResponse(decodedPaymentResponse);
          }
        } catch (decodeError) {
          console.warn('Failed to decode payment response header:', decodeError);
          setPaymentResponse({ 
            error: 'Failed to decode payment response', 
            rawHeader: paymentResponseHeader 
          });
        }
      }
    } catch (err: any) {
      console.error('Request failed:', err);
      setError(err.response?.data?.error || err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handlePostSubmit = async () => {
    if (!message.trim()) return;

    if (!isConnected) {
      setError('Please connect your wallet first');
      return;
    }

    if (!isOnCorrectChain) {
      setError(`Please switch to ${baseSepolia.name} network`);
      return;
    }

    if (!walletClient) {
      setError('Wallet client not available. Please ensure your wallet supports signing.');
      return;
    }

    setLoading(true);
    setError(null);
    setResponse(null);
    setPaymentResponse(null);

    try {
      const fetchWithPayment = wrapFetchWithPayment(fetch, walletClient);
      
      const response = await fetchWithPayment('/api/trueCast', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message }),
      });

      // Check if response is ok and content type is JSON
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Request failed (${response.status}): ${errorText}`);
      }

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const responseText = await response.text();
        throw new Error(`Expected JSON response but got: ${responseText.substring(0, 100)}...`);
      }

      const body = await response.json();
      setResponse({ type: 'POST', data: body });

      const paymentResponseHeader = response.headers.get('x-payment-response');
      if (paymentResponseHeader) {
        try {
          // Check if the header is already a JSON string
          if (paymentResponseHeader.startsWith('{') && paymentResponseHeader.endsWith('}')) {
            const decodedPaymentResponse = JSON.parse(paymentResponseHeader);
            setPaymentResponse(decodedPaymentResponse);
          } else {
            // Try the standard decoding function
            const decodedPaymentResponse = decodeXPaymentResponse(paymentResponseHeader);
            setPaymentResponse(decodedPaymentResponse);
          }
        } catch (decodeError) {
          console.warn('Failed to decode payment response header:', decodeError);
          setPaymentResponse({ 
            error: 'Failed to decode payment response', 
            rawHeader: paymentResponseHeader 
          });
        }
      }
    } catch (err: any) {
      console.error('Request failed:', err);
      setError(err.response?.data?.error || err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleSwitchChain = async () => {
    try {
      await switchChain({ chainId: baseSepolia.id });
    } catch (err: any) {
      console.error('Failed to switch chain:', err);
      setError(`Failed to switch to ${baseSepolia.name}: ${err.message}`);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 text-gray-900">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-8">
          <Link 
            href="/" 
            className="text-blue-600 hover:text-blue-700 font-mono"
          >
            ← Back to Home
          </Link>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-3xl font-bold mb-2">TrueCast API</h1>
          <p className="text-gray-600 mb-8 font-mono">
            Send messages to the protected TrueCast API endpoint ($0.01 per request)
          </p>

          {/* Wallet Connection Section */}
          <div className="mb-8 p-4 bg-gray-50 border border-gray-200 rounded-lg">
            <h3 className="text-lg font-semibold mb-4">Wallet Connection</h3>
            {isConnected ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Connected to:</p>
                    <p className="font-mono text-sm">{address}</p>
                    {walletClient ? (
                      <p className="text-xs text-green-600 mt-1">✓ Wallet supports signing</p>
                    ) : (
                      <p className="text-xs text-orange-600 mt-1">⚠ Wallet client loading...</p>
                    )}
                  </div>
                  <button
                    onClick={() => disconnect()}
                    className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-mono text-sm transition-colors"
                  >
                    Disconnect
                  </button>
                </div>
                
                {/* Network Status */}
                <div className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg">
                  <div>
                    <p className="text-sm text-gray-600">Network:</p>
                    <p className="font-mono text-sm">{chain?.name || 'Unknown'}</p>
                    {isOnCorrectChain ? (
                      <p className="text-xs text-green-600 mt-1">✓ Correct network</p>
                    ) : (
                      <p className="text-xs text-red-600 mt-1">✗ Wrong network - Please switch to {baseSepolia.name}</p>
                    )}
                  </div>
                  {!isOnCorrectChain && (
                    <button
                      onClick={handleSwitchChain}
                      disabled={isSwitchingChain}
                      className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white rounded-lg font-mono text-sm transition-colors"
                    >
                      {isSwitchingChain ? 'Switching...' : `Switch to ${baseSepolia.name}`}
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-gray-600 mb-3">Choose a wallet to connect:</p>
                {connectors.map((connector) => (
                  <button
                    key={connector.uid}
                    onClick={() => connect({ connector })}
                    disabled={isPending}
                    className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg font-mono text-sm transition-colors"
                  >
                    {isPending ? 'Connecting...' : `Connect ${connector.name}`}
                  </button>
                ))}
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-2">
                Your Message
              </label>
              <textarea
                id="message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                rows={4}
                placeholder="Enter your message for TrueCast..."
                required
              />
            </div>

            <div className="flex gap-4">
              <button
                type="submit"
                disabled={loading || !message.trim() || !isConnected || !walletClient || !isOnCorrectChain}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg font-mono transition-colors"
              >
                {loading ? 'Processing...' : 'Send GET Request'}
              </button>
              
              <button
                type="button"
                onClick={handlePostSubmit}
                disabled={loading || !message.trim() || !isConnected || !walletClient || !isOnCorrectChain}
                className="px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded-lg font-mono transition-colors"
              >
                {loading ? 'Processing...' : 'Send POST Request'}
              </button>
            </div>
          </form>

          {error && (
            <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <h3 className="text-red-800 font-semibold mb-2">Error</h3>
              <p className="text-red-700 font-mono text-sm">{error}</p>
            </div>
          )}

          {response && (
            <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
              <h3 className="text-green-800 font-semibold mb-2">
                API Response ({response.type} request)
              </h3>
              <pre className="text-green-700 font-mono text-sm whitespace-pre-wrap overflow-x-auto">
                {JSON.stringify(response.data, null, 2)}
              </pre>
            </div>
          )}

          {paymentResponse && (
            <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <h3 className="text-blue-800 font-semibold mb-2">Payment Response</h3>
              <pre className="text-blue-700 font-mono text-sm whitespace-pre-wrap overflow-x-auto">
                {JSON.stringify(paymentResponse, null, 2)}
              </pre>
            </div>
          )}

          <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h3 className="text-blue-800 font-semibold mb-2">How it works</h3>
            <ul className="text-blue-700 text-sm space-y-1">
              <li>• This API endpoint is protected by x402 payment middleware</li>
              <li>• Each request requires a $0.01 payment to access</li>
              <li>• Connect your wallet to enable payments</li>
              <li>• Make sure you're connected to the {baseSepolia.name} network</li>
              <li>• Payment is processed automatically using x402-fetch</li>
              <li>• The API returns premium content after payment verification</li>
              <li>• Your wallet must support EIP-712 signing for payment authorization</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
} 