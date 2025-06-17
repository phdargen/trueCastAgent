'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAccount, useWalletClient, useSwitchChain, useSendTransaction, useWaitForTransactionReceipt } from 'wagmi';
import { wrapFetchWithPayment, decodeXPaymentResponse } from 'x402-fetch';
import { parseEther } from 'viem';
import { Chain } from 'wagmi/chains';
import {
  ConnectWallet,
  Wallet,
  WalletDropdown,
  WalletDropdownDisconnect,
} from '@coinbase/onchainkit/wallet';
import {
  Name,
  Identity,
  Address,
  Avatar,
  EthBalance,
} from '@coinbase/onchainkit/identity';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, Loader2, CheckCircle, Clock, ExternalLink } from 'lucide-react';
import Image from 'next/image';

// Helper function to get confidence score color
const getConfidenceColor = (score: number) => {
  if (score >= 80) return 'text-green-600';
  if (score >= 60) return 'text-yellow-600';
  return 'text-red-600';
};

// Available data sources with descriptions - single source of truth
const availableDataSources = [
  {
    name: 'perplexity',
    description: 'Web search for real-time information, historical facts/data or scientific information',
    icon: '/assets/perplexity.png'
  },
  {
    name: 'x-twitter',
    displayName: 'X AI',
    description: 'Social media sentiment, discussions and real-time public opinion',
    icon: '/assets/x.png'
  },
  {
    name: 'pyth',
    description: 'Real-time cryptocurrency prices from Pyth Network',
    icon: '/assets/pyth.png'
  },
  {
    name: 'defillama',
    description: 'DeFi protocol information such as description, TVL, market cap and token prices',
    icon: '/assets/defillama.png'
  },
  {
    name: 'truemarkets',
    description: 'Prediction markets and their current odds/prices for crowd wisdom insights',
    icon: '/assets/truemarkets.png'
  },
  {
    name: 'neynar',
    description: 'Farcaster protocol data and social feeds',
    icon: '/assets/neynar.png'
  }
];

// Prompt suggestions for quick testing
const promptSuggestions = [
  "When BTC all time high?",
  "Largest company in the world?", 
  "What is the price of ETH?",
  "Latest AI breakthrough news?"
];

// Helper function to get data source icon - now uses the single source of truth
const getDataSourceIcon = (sourceName: string) => {
  const source = availableDataSources.find(ds => ds.name === sourceName);
  return source?.icon || null;
};

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

  const { address, isConnected, chain } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { switchChain, isPending: isSwitchingChain } = useSwitchChain();
  
  // Transaction hooks for trial flow
  const { sendTransaction, isPending: isSendingTx } = useSendTransaction();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: transactionHash as `0x${string}` | undefined,
  });

  const isOnCorrectChain = chain?.id === targetChain.id;

  // Get resource wallet address from environment
  const resourceWalletAddress = process.env.NEXT_PUBLIC_RESOURCE_WALLET_ADDRESS as `0x${string}` | undefined;

  // Effect to handle hydration
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Effect to automatically open sections when data is available
  useEffect(() => {
    if (!isMounted) return;
    if (response) setIsResponseOpen(true);
    if (paymentResponse) setIsPaymentOpen(true);
  }, [response, paymentResponse, isMounted]);

  // Effect to handle transaction confirmation and API call for trial
  useEffect(() => {
    if (isConfirmed && transactionHash && pageType === 'trial' && transactionStep === 'confirming') {
      setTransactionStep('confirmed');
      // Call the trial API after transaction is confirmed
      handleTrialApiCall();
    }
  }, [isConfirmed, transactionHash, pageType, transactionStep]);

  // Effect to update transaction step based on transaction status
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
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          message,
          transactionHash 
        }),
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

      // Set the actual payment response from the backend API call
      if (body.paymentResponse) {
        setPaymentResponse({
          ...body.paymentResponse,
          sponsored: true,
          userTransactionHash: transactionHash,
          message: 'Payment sponsored by TrueCast trial - backend paid the API fee'
        });
      } else {
        // Fallback if no payment response
        setPaymentResponse({
          sponsored: true,
          userTransactionHash: transactionHash,
          message: 'Payment sponsored by TrueCast trial'
        });
      }

      // Reset transaction state
      setTransactionStep('idle');
      setTransactionHash(null);
    } catch (err: any) {
      console.error('Trial API request failed:', err);
      setError(err.message || 'An error occurred during the trial request');
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

    // Handle trial flow - send transaction first
    if (pageType === 'trial') {
      if (!resourceWalletAddress) {
        setError('Resource wallet address not configured. Please contact support.');
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

    // Handle premium flow - direct payment
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
        <div className="mb-8 flex justify-between items-center">
          <Button variant="ghost" asChild>
            <Link href="/" className="font-mono">
              ← Back to Home
            </Link>
          </Button>
          
          {/* Wallet Connection - Top Right */}
          {!isConnected ? (
            <Wallet>
              <ConnectWallet>
                <Name className="text-primary font-mono" />
              </ConnectWallet>
              <WalletDropdown>
                <Identity className="px-4 pt-3 pb-2" hasCopyAddressOnClick>
                  <Avatar />
                  <Name className="text-primary" />
                  <Address className="font-mono text-sm text-primary/80" />
                  <EthBalance className="text-primary/90" />
                </Identity>
                <WalletDropdownDisconnect className="text-primary hover:text-primary/80" />
              </WalletDropdown>
            </Wallet>
          ) : !isOnCorrectChain ? (
            <Button
              onClick={handleSwitchChain}
              disabled={isSwitchingChain}
              className="font-mono bg-primary hover:bg-primary/90"
            >
              {isSwitchingChain ? 'Switching...' : `Switch to ${targetChain.name}`}
            </Button>
          ) : (
            <Wallet>
              <ConnectWallet>
                <Name className="text-primary font-mono" />
              </ConnectWallet>
              <WalletDropdown>
                <Identity className="px-4 pt-3 pb-2" hasCopyAddressOnClick>
                  <Avatar />
                  <Name className="text-primary" />
                  <Address className="font-mono text-sm text-primary/80" />
                  <EthBalance className="text-primary/90" />
                </Identity>
                <WalletDropdownDisconnect className="text-primary hover:text-primary/80" />
              </WalletDropdown>
            </Wallet>
          )}
        </div>

        <Card className="border-primary/20">
          <CardHeader>
            <CardTitle className="text-3xl flex items-center gap-3">
              {pageTitle}
              <Badge variant="default" className="font-mono text-xs bg-primary/90 hover:bg-primary">
                {pageType === 'trial' ? 'Sponsored $0.01' : '$0.01 per request'}
              </Badge>
            </CardTitle>
            <CardDescription className="font-mono">
              {pageDescription}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <form onSubmit={handlePostSubmit} className="space-y-6">
              <div className="space-y-2">
                <Textarea
                  id="message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Enter your query for TrueCast API ..."
                  rows={2}
                  maxLength={400}
                  required
                  className="focus-visible:ring-primary"
                />
              </div>

              {/* Prompt Suggestions */}
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  {promptSuggestions.map((suggestion, index) => (
                    <Button
                      key={index}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setMessage(suggestion)}
                      className="text-xs"
                    >
                      {suggestion}
                    </Button>
                  ))}
                </div>
              </div>

              <Button
                type="submit"
                disabled={
                  loading || 
                  !message.trim() || 
                  !isConnected || 
                  !isOnCorrectChain ||
                  (pageType === 'premium' && !walletClient) ||
                  (pageType === 'trial' && !resourceWalletAddress) ||
                  transactionStep !== 'idle'
                }
                className="font-mono bg-primary hover:bg-primary/90"
                size="lg"
              >
                {(() => {
                  if (pageType === 'trial') {
                    switch (transactionStep) {
                      case 'signing':
                        return (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Awaiting signature...
                          </>
                        );
                      case 'confirming':
                        return (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Confirming transaction...
                          </>
                        );
                      case 'confirmed':
                        return (
                          <>
                            <CheckCircle className="mr-2 h-4 w-4" />
                            Transaction confirmed!
                          </>
                        );
                      case 'calling-api':
                        return (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Processing analysis...
                          </>
                        );
                      default:
                        return 'Send';
                    }
                  } else {
                    return loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      'Send'
                    );
                  }
                })()}
              </Button>
            </form>

            {/* Available Data Sources */}
            <Card className="border-muted bg-muted/30">
              <CardHeader className="pb-3">
                <CardTitle className="text-muted-foreground text-lg">Available Data Sources</CardTitle>
                <CardDescription className="text-sm">
                  TrueCast automatically selects the most relevant data sources for your query
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {availableDataSources.map((source) => (
                    <div key={source.name} className="flex items-start gap-3 p-3 rounded-lg bg-background/50 border">
                      <div className="flex-shrink-0">
                        <Image
                          src={source.icon}
                          alt={`${source.name} icon`}
                          width={24}
                          height={24}
                          className="rounded-sm"
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium text-sm capitalize mb-1">
                          {source.displayName || source.name.replace('-', ' ')}
                        </div>
                        <div className="text-xs text-muted-foreground leading-relaxed">
                          {source.description}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Transaction Status for Trial */}
            {pageType === 'trial' && transactionHash && (
              <Card className="border-blue-200 bg-blue-50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-blue-900 text-lg flex items-center gap-2">
                    <Clock className="h-5 w-5" />
                    Transaction Status
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-blue-800">Transaction Hash:</span>
                    <a
                      href={`${targetChain.blockExplorers?.default?.url}/tx/${transactionHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-800 font-mono text-sm flex items-center gap-1"
                    >
                      {`${transactionHash}`}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-blue-800">Status:</span>
                    <div className="flex items-center gap-2">
                      {transactionStep === 'confirming' && <Loader2 className="h-4 w-4 animate-spin text-blue-600" />}
                      {transactionStep === 'confirmed' && <CheckCircle className="h-4 w-4 text-green-600" />}
                      {transactionStep === 'calling-api' && <Loader2 className="h-4 w-4 animate-spin text-blue-600" />}
                      <span className="text-sm text-blue-800 capitalize">
                        {transactionStep === 'calling-api' ? 'Processing Analysis' : transactionStep.replace('-', ' ')}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {error && (
              <Card className="border-destructive/50 bg-destructive/5">
                <CardHeader className="pb-3">
                  <CardTitle className="text-destructive text-lg">Error</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-destructive font-mono text-sm">{error}</p>
                </CardContent>
              </Card>
            )}

            {response && (
              <Collapsible open={isResponseOpen} onOpenChange={setIsResponseOpen}>
                <Card className="border-primary/20 bg-primary/5">
                  <CardHeader className="pb-3">
                    <CollapsibleTrigger className="flex items-center justify-between w-full">
                      <CardTitle className="text-primary text-lg">TrueCast Analysis</CardTitle>
                      <ChevronDown className={`h-4 w-4 text-primary/80 transition-transform duration-200 ${isResponseOpen ? 'rotate-180' : ''}`} />
                    </CollapsibleTrigger>
                  </CardHeader>
                  <CollapsibleContent>
                    <CardContent className="space-y-6">
                      {/* Main Reply */}
                      {response.data.reply && (
                        <div className="space-y-3">
                          <div className="bg-background/50 rounded-lg p-4 border">
                            <p className="text-foreground leading-relaxed whitespace-pre-wrap">
                              {response.data.reply}
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Confidence Score */}
                      {response.data.confidenceScore !== undefined && (
                        <div className="space-y-2">
                          <h4 className="font-medium text-sm text-muted-foreground">Confidence Score</h4>
                          <div className="p-3 rounded-lg bg-background/50 border">
                            <div className="flex items-center gap-2">
                              <span className={`text-2xl font-bold ${getConfidenceColor(response.data.confidenceScore)}`}>
                                {response.data.confidenceScore}%
                              </span>
                              <div className="flex-1 bg-gray-200 rounded-full h-2">
                                <div 
                                  className={`h-2 rounded-full transition-all duration-300 ${
                                    response.data.confidenceScore >= 80 ? 'bg-green-500' : 
                                    response.data.confidenceScore >= 60 ? 'bg-yellow-500' : 'bg-red-500'
                                  }`}
                                  style={{ width: `${response.data.confidenceScore}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Prediction Market - Extract from TrueMarkets data source */}
                      {(() => {
                        const trueMarketsSource = response.data.data_sources?.find((source: any) => source.name === 'truemarkets');
                        
                        if (!trueMarketsSource) return null;

                        const marketAddress = trueMarketsSource.source?.toLowerCase();
                        if (!marketAddress) return null;

                        let question = 'Unknown Market';
                        let yesPrice = 0;
                        let noPrice = 0;

                        if (trueMarketsSource.reply) {
                          const reply = trueMarketsSource.reply as string;

                          const questionMatch = reply.match(/Prediction Market: "([^"]+)"/);
                          if (questionMatch && questionMatch[1]) {
                            question = questionMatch[1];
                          }

                          // More robust regex to capture YES and NO percentages
                          const yesMatch = reply.match(/YES\s+([\d\.]+)%/);
                          const noMatch = reply.match(/NO\s+([\d\.]+)%/);

                          if (yesMatch && yesMatch[1]) {
                            yesPrice = parseFloat(yesMatch[1]) / 100; // Convert percentage back to decimal
                          }
                          if (noMatch && noMatch[1]) {
                            noPrice = parseFloat(noMatch[1]) / 100; // Convert percentage back to decimal
                          }

                          // Debug logging to help troubleshoot
                          console.log('TrueMarkets reply:', reply);
                          console.log('Extracted prices:', { yesPrice, noPrice });
                        }
                        
                        const imageUrl = `https://true-cast.vercel.app/api/og/market?question=${encodeURIComponent(question)}&marketAddress=${encodeURIComponent(marketAddress)}&yesPrice=${yesPrice}&noPrice=${noPrice}&t=${Date.now()}`;

                        return (
                          <div className="space-y-3">
                            <h4 className="font-semibold">Prediction Market</h4>
                            <div className="space-y-3">
                              <div className="border rounded-lg overflow-hidden bg-background/50">
                                <img 
                                  src={imageUrl}
                                  alt={`Market visualization for ${question}`}
                                  className="w-full h-auto"
                                  onLoad={(e) => {
                                    const target = e.target as HTMLImageElement;
                                    const fallback = target.nextElementSibling as HTMLElement;
                                    if (fallback) fallback.style.display = 'none';
                                  }}
                                  onError={(e) => {
                                    const target = e.target as HTMLImageElement;
                                    target.style.display = 'none';
                                    const fallback = target.nextElementSibling as HTMLElement;
                                    if (fallback) fallback.style.display = 'block';
                                  }}
                                />
                                <div className="hidden p-4 text-center text-muted-foreground text-sm space-y-2">
                                  <p>Market visualization unavailable</p>
                                  <p className="font-mono text-xs">
                                    Address: {marketAddress}
                                  </p>
                                </div>
                              </div>
                              <div className="text-center">
                                <a 
                                  href={`https://farcaster.xyz/miniapps/Q6UcdjB0Hkmc/truecast?market=${marketAddress}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-800 font-medium text-sm"
                                >
                                  Open in TrueCast Mini App <ExternalLink className="h-4 w-4" />
                                </a>
                              </div>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Data Sources */}
                      {response.data.data_sources && response.data.data_sources.length > 0 && (
                        <div className="space-y-3">
                          <h4 className="font-semibold">Data Sources</h4>
                          <div className="space-y-3">
                            {response.data.data_sources.map((source: any, index: number) => {
                              const iconSrc = getDataSourceIcon(source.name);
                              return (
                                <div key={index} className="bg-background/30 border rounded-lg p-4">
                                  <div className="flex items-start justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                      {iconSrc && (
                                        <Image
                                          src={iconSrc}
                                          alt={`${source.name} icon`}
                                          width={16}
                                          height={16}
                                          className="rounded-sm flex-shrink-0"
                                        />
                                      )}
                                      <Badge variant="outline" className="text-xs">
                                        {source.name || `Source ${index + 1}`}
                                      </Badge>
                                    </div>
                                    {source.source && (
                                      <a
                                        href={source.name === 'truemarkets' 
                                          ? `https://app.truemarkets.org/en/market/${source.source}`
                                          : source.source}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-blue-600 hover:text-blue-800 text-xs flex items-center gap-1"
                                      >
                                        Source <ExternalLink className="h-3 w-3" />
                                      </a>
                                    )}
                                  </div>
                                  {source.prompt && (
                                    <div className="mb-2">
                                      <span className="text-xs font-medium text-muted-foreground">Query: </span>
                                      <span className="text-xs text-muted-foreground italic">"{source.prompt}"</span>
                                    </div>
                                  )}
                                  <p className="text-sm leading-relaxed">
                                    {source.reply || "No response received"}
                                  </p>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Raw Data Toggle */}
                      <Collapsible open={isRawDataOpen} onOpenChange={setIsRawDataOpen}>
                        <Card className="border-muted">
                          <CardHeader className="pb-3">
                            <CollapsibleTrigger className="flex items-center justify-between w-full">
                              <CardTitle className="text-muted-foreground text-sm">API response (Raw JSON)</CardTitle>
                              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${isRawDataOpen ? 'rotate-180' : ''}`} />
                            </CollapsibleTrigger>
                          </CardHeader>
                          <CollapsibleContent>
                            <CardContent>
                              <pre className="text-muted-foreground font-mono text-xs whitespace-pre-wrap overflow-x-auto bg-muted/30 p-3 rounded-md">
                                {JSON.stringify(response.data, null, 2)}
                              </pre>
                            </CardContent>
                          </CollapsibleContent>
                        </Card>
                      </Collapsible>
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            )}

            {paymentResponse && (
              <Collapsible open={isPaymentOpen} onOpenChange={setIsPaymentOpen}>
                <Card className="border-primary/20 bg-primary/5">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between mb-2">
                      <CardTitle className="text-primary text-lg">Payment Response</CardTitle>
                      {(paymentResponse?.transactionHash || paymentResponse?.userTransactionHash || paymentResponse?.hash || paymentResponse?.transaction) && (
                        <a
                          href={`https://basescan.org/tx/${paymentResponse?.transactionHash || paymentResponse?.userTransactionHash || paymentResponse?.hash || paymentResponse?.transaction}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800 text-sm flex items-center gap-1"
                        >
                          <ExternalLink className="h-3 w-3" />
                          View Transaction
                        </a>
                      )}
                    </div>
                    <CollapsibleTrigger className="flex items-center justify-end w-full">
                      <ChevronDown className={`h-4 w-4 text-primary/80 transition-transform duration-200 ${isPaymentOpen ? 'rotate-180' : ''}`} />
                    </CollapsibleTrigger>
                  </CardHeader>
                  <CollapsibleContent>
                    <CardContent>
                      <pre className="text-primary/90 font-mono text-sm whitespace-pre-wrap overflow-x-auto bg-primary/5 p-3 rounded-md">
                        {JSON.stringify(paymentResponse, null, 2)}
                      </pre>
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            )}

            <Separator className="bg-primary/10" />

            <Collapsible open={isHowItWorksOpen} onOpenChange={setIsHowItWorksOpen}>
              <Card className="bg-primary/5 border-primary/20">
                <CardHeader className="pb-3">
                  <CollapsibleTrigger className="flex items-center justify-between w-full">
                    <CardTitle className="text-lg text-primary">How it works</CardTitle>
                    <ChevronDown className={`h-4 w-4 text-primary/80 transition-transform duration-200 ${isHowItWorksOpen ? 'rotate-180' : ''}`} />
                  </CollapsibleTrigger>
                </CardHeader>
                <CollapsibleContent>
                  <CardContent>
                    <ul className="text-sm space-y-2 text-primary/80">
                      <li className="flex items-start gap-2">
                        <span className="text-primary">•</span>
                        This API endpoint is protected by x402 payment middleware
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-primary">•</span>
                        Each request requires a $0.01 payment to access
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-primary">•</span>
                        Connect your wallet to enable payments
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-primary">•</span>
                        Make sure you're connected to the {targetChain.name} network
                      </li>
                      {pageType === 'trial' ? (
                        <>
                          <li className="flex items-start gap-2">
                            <span className="text-primary">•</span>
                            First, you send a 0 ETH transaction to our resource wallet (you only pay gas)
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="text-primary">•</span>
                            Once confirmed, our backend automatically pays for the TrueCast API call
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="text-primary">•</span>
                            You get the full analysis without paying the $0.01 API fee
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="text-primary">•</span>
                            This demonstrates sponsored transactions - you pay gas, we pay the service
                          </li>
                        </>
                      ) : (
                        <>
                          <li className="flex items-start gap-2">
                            <span className="text-primary">•</span>
                            Payment is processed automatically using x402-fetch
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="text-primary">•</span>
                            The API returns premium content after payment verification
                          </li>
                        </>
                      )}
                    </ul>
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          </CardContent>
        </Card>
      </div>
    </div>
  );
} 