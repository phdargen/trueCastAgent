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
        body: JSON.stringify({ message, transactionHash, walletAddress: address }),
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
        setError('Resource wallet address not configured. Please contact support.');
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
        body: JSON.stringify({ message }),
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
            />

            <DataSourceInfo />

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