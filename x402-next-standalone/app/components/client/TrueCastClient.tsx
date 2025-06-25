'use client';

import { useState, useEffect } from 'react';
import { useAccount, useWalletClient, useSwitchChain, useSendTransaction, useWaitForTransactionReceipt } from 'wagmi';
import { wrapFetchWithPayment, decodeXPaymentResponse } from 'x402-fetch';
import { parseEther } from 'viem';
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

interface TrueCastClientProps {
  targetChain: Chain;
  pageType: 'premium' | 'trial';
}

export function TrueCastClient({ targetChain, pageType }: TrueCastClientProps) {
  const [message, setMessage] = useState('');
  const [response, setResponse] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentResponse, setPaymentResponse] = useState<any>(null);
  const [isHowItWorksOpen, setIsHowItWorksOpen] = useState(false);
  const [isResponseOpen, setIsResponseOpen] = useState(false);
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [isRawDataOpen, setIsRawDataOpen] = useState(false);
  const [transactionHash, setTransactionHash] = useState<string | null>(null);
  const [transactionStep, setTransactionStep] = useState<'idle' | 'signing' | 'confirming' | 'confirmed' | 'calling-api'>('idle');
  const [isMounted, setIsMounted] = useState(false);
  const [trialInfo, setTrialInfo] = useState<{ remainingTrials: number; totalTrials: number; currentUsage: number } | null>(null);
  const [storeToPinata, setStoreToPinata] = useState(false);

  const filterDescriptions: { [key: string]: string } = {
    GROUNDING: "Response strictly grounded in data sources?",
    RELEVANCE: "Response relevant for input query?",
  };

  const { isConnected, chain, address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { switchChain, isPending: isSwitchingChain } = useSwitchChain();
  
  const { sendTransaction, isPending: isSendingTx } = useSendTransaction();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: transactionHash as `0x${string}` | undefined,
  });

  const isOnCorrectChain = chain?.id === targetChain.id;
  const resourceWalletAddress = process.env.NEXT_PUBLIC_RESOURCE_WALLET_ADDRESS as `0x${string}` | undefined;

  useEffect(() => {
    setIsMounted(true);
    
    // Check trial status on mount for trial pages
    if (pageType === 'trial' && address) {
      checkTrialStatus();
    }
  }, [pageType, address]);

  const checkTrialStatus = async () => {
    if (!address) return;
    
    try {
      const response = await fetch('/api/truecast-trial/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: address }),
      });
      
      if (response.ok) {
        const data = await response.json();
        setTrialInfo(data.trialInfo);
        
        if (data.trialInfo.remainingTrials === 0) {
          setError('🎯 Trial limit reached! You have used all 3 free prompts. Upgrade to premium to continue.');
        }
      }
    } catch (err) {
      console.log('Could not check trial status:', err);
      // Don't show error for status check failure
    }
  };

  useEffect(() => {
    if (!isMounted) return;
    if (response) setIsResponseOpen(true);
    if (paymentResponse) setIsPaymentOpen(true);
  }, [response, paymentResponse, isMounted]);

  useEffect(() => {
    if (isConfirmed && transactionHash && pageType === 'trial' && transactionStep === 'confirming') {
      setTransactionStep('confirmed');
      handleTrialApiCall();
    }
  }, [isConfirmed, transactionHash, pageType, transactionStep]);

  useEffect(() => {
    if (isSendingTx && transactionStep === 'idle') {
      setTransactionStep('signing');
    } else if (isConfirming && transactionStep === 'signing') {
      setTransactionStep('confirming');
    }
  }, [isSendingTx, isConfirming, transactionStep]);

  const handleTrialApiCall = async () => {
    if (!message.trim() || !transactionHash) return;

    setTransactionStep('calling-api');
    setLoading(true);
    setError(null);
    setResponse(null);
    setPaymentResponse(null);

    try {
      const response = await fetch('/api/truecast-trial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, transactionHash, walletAddress: address, storeToPinata, runGuardrail: true }),
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
      setResponse({ type: 'POST', data: body.data });

      // Update trial info if provided
      if (body.trialInfo) {
        setTrialInfo(body.trialInfo);
      }

      if (body.paymentResponse) {
        setPaymentResponse({
          ...body.paymentResponse,
          sponsored: true,
          userTransactionHash: transactionHash,
          message: 'Payment sponsored by TrueCast trial - backend paid the API fee',
          trialInfo: body.trialInfo
        });
      } else {
        setPaymentResponse({
          sponsored: true,
          userTransactionHash: transactionHash,
          message: 'Payment sponsored by TrueCast trial',
          trialInfo: body.trialInfo
        });
      }

      setTransactionStep('idle');
      setTransactionHash(null);
    } catch (err: any) {
      console.error('Trial API request failed:', err);
      
      // Handle trial limit exceeded
      if (err.message.includes('Trial limit exceeded')) {
        setError('🎯 Trial limit reached! You have used all free prompts. Upgrade to premium to continue.');
      } else {
        setError(err.message || 'An error occurred during the trial request');
      }
      setTransactionStep('idle');
    } finally {
      setLoading(false);
    }
  };

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

    if (pageType === 'trial') {
      if (!resourceWalletAddress) {
        setError('Resource wallet address not configured.');
        return;
      }

      // Check if user has remaining trials
      if (trialInfo && trialInfo.remainingTrials === 0) {
        setError('🎯 Trial limit reached! You have used all free prompts. Upgrade to premium to continue.');
        return;
      }

      setError(null);
      setResponse(null);
      setPaymentResponse(null);
      setTransactionStep('idle');

      try {
        sendTransaction({
          to: resourceWalletAddress,
          value: parseEther('0'),
        }, {
          onSuccess: (hash) => {
            setTransactionHash(hash);
            setTransactionStep('signing');
          },
          onError: (error) => {
            console.error('Transaction failed:', error);
            setError(`Transaction failed: ${error.message}`);
            setTransactionStep('idle');
          }
        });
      } catch (err: any) {
        console.error('Failed to send transaction:', err);
        setError(`Failed to send transaction: ${err.message}`);
        setTransactionStep('idle');
      }
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
          if (paymentResponseHeader.startsWith('{') && paymentResponseHeader.endsWith('}')) {
            const decodedPaymentResponse = JSON.parse(paymentResponseHeader);
            setPaymentResponse(decodedPaymentResponse);
          } else {
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
      await switchChain({ chainId: targetChain.id as any });
    } catch (err: any) {
      console.error('Failed to switch chain:', err);
      setError(`Failed to switch to ${targetChain.name}: ${err.message}`);
    }
  };

  const pageTitle = pageType === 'trial' ? 'TrueCast API - Free Trial' : 'TrueCast API';
  const pageDescription = 'Real-time news aggregator grounded by prediction markets';

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <PageHeader
          pageType={pageType}
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
                variant={pageType === 'trial' && trialInfo?.remainingTrials === 0 ? "destructive" : "default"} 
                className="font-mono text-xs bg-primary/90 hover:bg-primary"
              >
                {pageType === 'trial' 
                  ? trialInfo 
                    ? `${trialInfo.remainingTrials}/${trialInfo.totalTrials} Free Trials`
                    : 'Free Trial'
                  : '$0.01 per request'
                }
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
              pageType={pageType}
              resourceWalletAddress={resourceWalletAddress}
              transactionStep={transactionStep}
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
              pageType={pageType}
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