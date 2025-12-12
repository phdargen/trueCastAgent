'use client';

import { useState, useEffect } from 'react';
import { useAccount, useWalletClient, useSwitchChain } from 'wagmi';
import { x402Client, wrapFetchWithPayment } from '@x402/fetch';
import { registerExactEvmScheme } from '@x402/evm/exact/client';
import type { ClientEvmSigner } from '@x402/evm';
import type { WalletClient, Account } from 'viem';
import { Chain } from 'wagmi/chains';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import Image from 'next/image';

import { PageHeader } from './PageHeader';
import { TrueCastForm } from './TrueCastForm';
import { DataSourceInfo } from './DataSourceInfo';
import { ErrorDisplay } from './ErrorDisplay';
import { AnalysisResponse } from './AnalysisResponse';
import { PaymentResponseDisplay } from './PaymentResponseDisplay';
import { HowItWorks } from './HowItWorks';

/**
 * Converts a wagmi/viem WalletClient to a ClientEvmSigner for x402Client
 */
function wagmiToClientSigner(walletClient: WalletClient): ClientEvmSigner {
  if (!walletClient.account) {
    throw new Error('Wallet client must have an account');
  }

  return {
    address: walletClient.account.address,
    signTypedData: async (message) => {
      const signature = await walletClient.signTypedData({
        account: walletClient.account as Account,
        domain: message.domain,
        types: message.types,
        primaryType: message.primaryType,
        message: message.message,
      });
      return signature;
    },
  };
}

interface TrueCastClientProps {
  targetChain: Chain;
}

export function TrueCastClient({ targetChain }: TrueCastClientProps) {
  const [message, setMessage] = useState('');
  const [response, setResponse] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentResponse, setPaymentResponse] = useState<any>(null);
  const [isHowItWorksOpen, setIsHowItWorksOpen] = useState(false);
  const [isResponseOpen, setIsResponseOpen] = useState(false);
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [isRawDataOpen, setIsRawDataOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [storeToPinata, setStoreToPinata] = useState(false);

  const filterDescriptions: { [key: string]: string } = {
    GROUNDING: "Response strictly grounded in data sources?",
    RELEVANCE: "Response relevant for input query?",
  };

  const { isConnected, chain } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { switchChain, isPending: isSwitchingChain } = useSwitchChain();

  const isOnCorrectChain = chain?.id === targetChain.id;

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isMounted) return;
    if (response) setIsResponseOpen(true);
    if (paymentResponse) setIsPaymentOpen(true);
  }, [response, paymentResponse, isMounted]);

  const handlePostSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    if (!isConnected) {
      setError('Please connect your wallet first');
      return;
    }

    if (!isOnCorrectChain) {
      setError(`Please switch to ${targetChain.name} network`);
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
      // Create x402 client and register EVM scheme with wagmi signer
      const client = new x402Client();
      const signer = wagmiToClientSigner(walletClient);
      registerExactEvmScheme(client, { signer });

      // Wrap fetch with payment handling
      const fetchWithPayment = wrapFetchWithPayment(fetch, client);
      
      const response = await fetchWithPayment('/api/trueCast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, storeToPinata, runGuardrail: true }),
      });

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
          // Try parsing as JSON (direct or base64-encoded)
          let decodedPaymentResponse;
          if (paymentResponseHeader.startsWith('{') && paymentResponseHeader.endsWith('}')) {
            decodedPaymentResponse = JSON.parse(paymentResponseHeader);
          } else {
            // Try base64 decode
            const decoded = atob(paymentResponseHeader);
            decodedPaymentResponse = JSON.parse(decoded);
          }
          setPaymentResponse(decodedPaymentResponse);
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
      await switchChain({ chainId: targetChain.id as any });
    } catch (err: any) {
      console.error('Failed to switch chain:', err);
      setError(`Failed to switch to ${targetChain.name}: ${err.message}`);
    }
  };

  const pageTitle = 'TrueCast API';
  const pageDescription = 'Real-time news aggregator grounded by prediction markets';

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <PageHeader
          targetChain={targetChain}
          isConnected={isConnected}
          isOnCorrectChain={isOnCorrectChain}
          isSwitchingChain={isSwitchingChain}
          handleSwitchChain={handleSwitchChain}
        />

        <Card className="border-primary/20">
          <CardHeader>
            <CardTitle className="text-3xl flex items-center gap-3">
              <Image 
                src="/assets/trueCast.png" 
                alt="TrueCast Logo" 
                width={48} 
                height={48} 
                className="rounded-lg"
              />
              {pageTitle}
              <Badge 
                variant="default" 
                className="font-mono text-xs bg-primary/90 hover:bg-primary"
              >
                $0.10 per request
              </Badge>
            </CardTitle>
            <CardDescription className="font-mono">
              {pageDescription}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <TrueCastForm
              message={message}
              setMessage={setMessage}
              handlePostSubmit={handlePostSubmit}
              loading={loading}
              isConnected={isConnected}
              isOnCorrectChain={isOnCorrectChain}
              walletClient={walletClient}
              storeToPinata={storeToPinata}
              setStoreToPinata={setStoreToPinata}
            />

            <DataSourceInfo />

            {/* Pinata IPFS URL Display */}
            {storeToPinata && response?.data?.ipfs && (
              <Card className="border-blue-200 bg-blue-50/50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Image 
                      src="/assets/pinata.png" 
                      alt="Pinata Logo" 
                      width={24} 
                      height={24} 
                      className="rounded"
                    />
                    IPFS Storage
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm text-muted-foreground mb-2">
                        Response uploaded to {response.data.ipfs.network === 'public' ? 'Public' : 'Private'} IPFS Network
                      </p>
                      <div className="flex items-center gap-2">
                        <code className="text-xs bg-muted px-2 py-1 rounded">
                          {response.data.ipfs.hash}
                        </code>
                        <a 
                          href={response.data.ipfs.gatewayUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800 text-sm underline"
                        >
                          View
                        </a>
                      </div>
                    </div>
                    
                    {/* x402 Payment Transaction Display */}
                    {response.data.ipfs.paymentResponse && (
                      <div className="border-t pt-3">
                        <p className="text-sm text-muted-foreground mb-2 flex items-center gap-2">
                          <Image 
                            src="/assets/x402_wordmark_light.svg" 
                            alt="x402 Logo" 
                            width={60} 
                            height={20} 
                            className="h-5 w-auto"
                          />
                          Internal Payment Transaction
                        </p>
                        <div className="flex items-center gap-2">
                          <code className="text-xs bg-green-100 px-2 py-1 rounded border">
                            {response.data.ipfs.paymentResponse.transaction}
                          </code>
                          <a 
                            href={`https://${response.data.ipfs.paymentResponse.network === 'base' ? 'basescan.org' : 'etherscan.io'}/tx/${response.data.ipfs.paymentResponse.transaction}`}
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-green-600 hover:text-green-800 text-sm underline"
                          >
                            View on {response.data.ipfs.paymentResponse.network === 'base' ? 'Basescan' : 'Etherscan'}
                          </a>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* AWS Bedrock Guardrails Results Display */}
            {response?.data?.guardrail && (
              <Card className="border-orange-200 bg-orange-50/50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Image
                      src="/assets/bedrock.png"
                      alt="AWS Bedrock Logo"
                      width={24}
                      height={24}
                      className="rounded"
                    />
                    AWS Bedrock Guardrails
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {/* Input Validation Results */}
                    {response.data.guardrail.input && (
                      <div>
                        <h4 className="text-sm font-semibold text-muted-foreground mb-2">
                          📥 Input Validation
                        </h4>
                        {response.data.guardrail.input.contentPolicy?.filters?.length > 0 ? (
                          <div className="space-y-2">
                            {response.data.guardrail.input.contentPolicy.filters.map(
                              (filter: any, index: number) => {
                                const isDetected = filter.detected;
                                return (
                                  <div
                                    key={index}
                                    className={`text-xs p-2 rounded border ${
                                      isDetected
                                        ? "border-red-300 bg-red-100/50"
                                        : "border-green-300 bg-green-100/50"
                                    }`}
                                  >
                                    <div className="flex justify-between items-center">
                                      <span className="font-medium text-gray-700">{filter.type}</span>
                                      <Badge
                                        variant={isDetected ? "destructive" : "default"}
                                        className={`capitalize ${
                                          !isDetected ? "bg-green-600" : ""
                                        }`}
                                      >
                                        {isDetected ? "Detected" : "OK"}
                                      </Badge>
                                    </div>
                                    <div className="text-muted-foreground mt-1 text-xs">
                                      {filter.confidence && (
                                        <span>Confidence: {filter.confidence} | </span>
                                      )}
                                      <span>Detected: {filter.detected ? "Yes" : "No"}</span>
                                    </div>
                                  </div>
                                );
                              },
                            )}
                          </div>
                        ) : (
                          <div
                            className="text-xs p-2 rounded border border-green-300 bg-green-100/50"
                          >
                            No content policy violation detected for input.
                          </div>
                        )}
                      </div>
                    )}

                    {/* Output Validation Results */}
                    {response.data.guardrail.output?.contextualGroundingPolicy?.filters && (
                      <div className="border-t pt-3">
                        <h4 className="text-sm font-semibold text-muted-foreground mb-2">
                          📤 Output Validation
                        </h4>
                        <div className="space-y-2">
                          {response.data.guardrail.output.contextualGroundingPolicy.filters.map(
                            (filter: any, index: number) => {
                              const isDetected = filter.detected;
                              const description =
                                filterDescriptions[filter.type as keyof typeof filterDescriptions];
                              return (
                                <div
                                  key={index}
                                  className={`text-xs p-2 rounded border ${
                                    isDetected
                                      ? "border-red-300 bg-red-100/50"
                                      : "border-green-300 bg-green-100/50"
                                  }`}
                                >
                                  <div className="flex justify-between items-start">
                                    <div className="pr-2">
                                      <span className="font-medium text-gray-700">
                                        {filter.type}
                                      </span>
                                      {description && (
                                        <p className="text-xs text-muted-foreground">
                                          {description}
                                        </p>
                                      )}
                                    </div>
                                    <Badge
                                      variant={isDetected ? "destructive" : "default"}
                                      className={`capitalize flex-shrink-0 ${
                                        !isDetected ? "bg-green-600" : ""
                                      }`}
                                    >
                                      {isDetected ? "Low Score" : "OK"}
                                    </Badge>
                                  </div>
                                  <div className="text-muted-foreground mt-1 text-xs">
                                    {filter.score !== undefined && (
                                      <span>Score: {filter.score.toFixed(2)} | </span>
                                    )}
                                    {filter.threshold !== undefined && (
                                      <span>Threshold &gt; {filter.threshold} </span>
                                    )}
                                  </div>
                                </div>
                              );
                            },
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            <ErrorDisplay error={error} />

            <AnalysisResponse
              response={response}
              isResponseOpen={isResponseOpen}
              setIsResponseOpen={setIsResponseOpen}
              isRawDataOpen={isRawDataOpen}
              setIsRawDataOpen={setIsRawDataOpen}
            />

            <PaymentResponseDisplay
              paymentResponse={paymentResponse}
              isPaymentOpen={isPaymentOpen}
              setIsPaymentOpen={setIsPaymentOpen}
            />

            <Separator className="bg-primary/10" />

            <HowItWorks
              targetChain={targetChain}
              isHowItWorksOpen={isHowItWorksOpen}
              setIsHowItWorksOpen={setIsHowItWorksOpen}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}