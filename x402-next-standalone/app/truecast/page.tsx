'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAccount, useWalletClient, useSwitchChain } from 'wagmi';
import { wrapFetchWithPayment, decodeXPaymentResponse } from 'x402-fetch';
import { baseSepolia } from 'wagmi/chains';
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
import { ChevronDown, Loader2, CheckCircle, XCircle, AlertTriangle, HelpCircle, Clock, ExternalLink } from 'lucide-react';

// Helper function to get verification result icon and color
const getVerificationResultDisplay = (result: string) => {
  switch (result) {
    case 'TRUE':
      return { icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-200' };
    case 'FALSE':
      return { icon: XCircle, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200' };
    case 'PARTIALLY_TRUE':
      return { icon: AlertTriangle, color: 'text-yellow-600', bg: 'bg-yellow-50', border: 'border-yellow-200' };
    case 'UNVERIFIABLE':
      return { icon: HelpCircle, color: 'text-gray-600', bg: 'bg-gray-50', border: 'border-gray-200' };
    case 'NEEDS_MORE_INFO':
      return { icon: Clock, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200' };
    default:
      return { icon: HelpCircle, color: 'text-gray-600', bg: 'bg-gray-50', border: 'border-gray-200' };
  }
};

// Helper function to get confidence score color
const getConfidenceColor = (score: number) => {
  if (score >= 80) return 'text-green-600';
  if (score >= 60) return 'text-yellow-600';
  return 'text-red-600';
};

export default function TrueCastPage() {
  const [message, setMessage] = useState('');
  const [response, setResponse] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentResponse, setPaymentResponse] = useState<any>(null);
  const [isHowItWorksOpen, setIsHowItWorksOpen] = useState(false);
  const [isResponseOpen, setIsResponseOpen] = useState(false);
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [isRawDataOpen, setIsRawDataOpen] = useState(false);

  const { address, isConnected, chain } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { switchChain, isPending: isSwitchingChain } = useSwitchChain();

  const isOnCorrectChain = chain?.id === baseSepolia.id;

  // Effect to automatically open sections when data is available
  useEffect(() => {
    if (response) setIsResponseOpen(true);
    if (paymentResponse) setIsPaymentOpen(true);
  }, [response, paymentResponse]);

  const handlePostSubmit = async (e: React.FormEvent) => {
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
              {isSwitchingChain ? 'Switching...' : `Switch to ${baseSepolia.name}`}
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
              TrueCast API
              <Badge variant="default" className="font-mono text-xs bg-primary/90 hover:bg-primary">
                $0.01 per request
              </Badge>
            </CardTitle>
            <CardDescription className="font-mono">
              Send messages to the protected TrueCast API endpoint with automated payments
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <form onSubmit={handlePostSubmit} className="space-y-6">
              <div className="space-y-2">
                <label htmlFor="message" className="text-sm font-medium">
                  Your Message
                </label>
                <Textarea
                  id="message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Enter your message for TrueCast..."
                  rows={4}
                  required
                  className="focus-visible:ring-primary"
                />
              </div>

              <Button
                type="submit"
                disabled={loading || !message.trim() || !isConnected || !walletClient || !isOnCorrectChain}
                className="font-mono bg-primary hover:bg-primary/90"
                size="lg"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  'Send Message'
                )}
              </Button>
            </form>

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
                          <h3 className="font-semibold text-lg">Analysis Result</h3>
                          <div className="bg-background/50 rounded-lg p-4 border">
                            <p className="text-foreground leading-relaxed whitespace-pre-wrap">
                              {response.data.reply}
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Verification Result & Confidence */}
                      {(response.data.verificationResult || response.data.confidenceScore !== undefined) && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {response.data.verificationResult && (
                            <div className="space-y-2">
                              <h4 className="font-medium text-sm text-muted-foreground">Verification Result</h4>
                              {(() => {
                                const display = getVerificationResultDisplay(response.data.verificationResult);
                                const Icon = display.icon;
                                return (
                                  <div className={`flex items-center gap-2 p-3 rounded-lg ${display.bg} ${display.border} border`}>
                                    <Icon className={`h-5 w-5 ${display.color}`} />
                                    <span className={`font-medium ${display.color}`}>
                                      {response.data.verificationResult.replace('_', ' ')}
                                    </span>
                                  </div>
                                );
                              })()}
                            </div>
                          )}

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
                        </div>
                      )}

                      {/* Market Sentiment */}
                      {response.data.marketSentiment && (
                        <div className="space-y-3">
                          <h4 className="font-semibold">Prediction Market</h4>
                          <div className="space-y-4">
                            {/* Market Information */}
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                              {response.data.marketSentiment.question && (
                                <div className="mb-3">
                                  <h5 className="font-medium text-blue-900 mb-2">Market Question</h5>
                                  <p className="text-blue-800">{response.data.marketSentiment.question}</p>
                                </div>
                              )}
                              
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                                {response.data.marketSentiment.yesPrice !== undefined && (
                                  <div className="bg-white/50 rounded p-2 text-center">
                                    <div className="font-medium text-blue-700">Yes Price</div>
                                    <div className="font-bold text-green-600">{(response.data.marketSentiment.yesPrice * 100).toFixed(1)}%</div>
                                  </div>
                                )}
                                {response.data.marketSentiment.noPrice !== undefined && (
                                  <div className="bg-white/50 rounded p-2 text-center">
                                    <div className="font-medium text-blue-700">No Price</div>
                                    <div className="font-bold text-red-600">{(response.data.marketSentiment.noPrice * 100).toFixed(1)}%</div>
                                  </div>
                                )}
                                {response.data.marketSentiment.tvl !== undefined && (
                                  <div className="bg-white/50 rounded p-2 text-center">
                                    <div className="font-medium text-blue-700">TVL</div>
                                    <div className="font-bold text-blue-900">${response.data.marketSentiment.tvl.toLocaleString()}</div>
                                  </div>
                                )}
                                {response.data.marketSentiment.marketAddress && (
                                  <div className="bg-white/50 rounded p-2 text-center">
                                    <div className="font-medium text-blue-700">TrueCast Mini app</div>
                                    <a 
                                      href={`https://farcaster.xyz/miniapps/Q6UcdjB0Hkmc/truecast?market=${response.data.marketSentiment.marketAddress}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="font-bold text-blue-900 hover:text-blue-700 hover:underline text-xs flex items-center justify-center gap-1"
                                    >
                                      Open <ExternalLink className="h-3 w-3" />
                                    </a>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Market Embed Image */}
                            {response.data.marketSentiment.marketAddress && (
                              <div className="space-y-2">
                                <div className="border rounded-lg overflow-hidden bg-background/50">
                                  <img 
                                    src={`https://true-cast.vercel.app/api/og/market?question=${encodeURIComponent(response.data.marketSentiment.question || 'Unknown Market')}&marketAddress=${encodeURIComponent(response.data.marketSentiment.marketAddress)}&yesPrice=${response.data.marketSentiment.yesPrice || 0}&noPrice=${response.data.marketSentiment.noPrice || 0}&t=${Date.now()}`}
                                    alt={`Market visualization for ${response.data.marketSentiment.question || 'prediction market'}`}
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
                                        Address: {response.data.marketSentiment.marketAddress}
                                      </p>
                                      <p className="font-mono text-xs break-all">
                                        Image URL: https://true-cast.vercel.app/api/og/market?question={encodeURIComponent(response.data.marketSentiment.question || 'Unknown Market')}&marketAddress={encodeURIComponent(response.data.marketSentiment.marketAddress)}&yesPrice={response.data.marketSentiment.yesPrice || 0}&noPrice={response.data.marketSentiment.noPrice || 0}
                                      </p>
                                    </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Summary */}
                      {response.data.summary && (
                        <div className="space-y-3">
                          <h4 className="font-semibold">Summary</h4>
                          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                            <p className="text-blue-900 leading-relaxed">
                              {response.data.summary}
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Evidence */}
                      {response.data.evidence && response.data.evidence.length > 0 && (
                        <div className="space-y-3">
                          <h4 className="font-semibold">Evidence</h4>
                          <div className="space-y-3">
                            {response.data.evidence.map((item: any, index: number) => (
                              <div key={index} className="bg-background/30 border rounded-lg p-4">
                                <div className="flex items-start justify-between mb-2">
                                  <Badge variant="outline" className="text-xs">
                                    {item.source || `Source ${index + 1}`}
                                  </Badge>
                                  {item.reliability && (
                                    <Badge 
                                      variant={item.reliability === 'HIGH' ? 'default' : item.reliability === 'MEDIUM' ? 'secondary' : 'destructive'}
                                      className="text-xs"
                                    >
                                      {item.reliability}
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-sm leading-relaxed">
                                  {item.finding || item.content || JSON.stringify(item)}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Reasoning */}
                      {response.data.reasoning && (
                        <div className="space-y-3">
                          <h4 className="font-semibold">Reasoning</h4>
                          <div className="bg-background/30 border rounded-lg p-4">
                            <p className="text-sm leading-relaxed whitespace-pre-wrap">
                              {response.data.reasoning}
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Caveats */}
                      {response.data.caveats && response.data.caveats.length > 0 && (
                        <div className="space-y-3">
                          <h4 className="font-semibold">Important Considerations</h4>
                          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                            <ul className="space-y-2">
                              {response.data.caveats.map((caveat: string, index: number) => (
                                <li key={index} className="flex items-start gap-2 text-sm text-yellow-800">
                                  <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                                  {caveat}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      )}

                      {/* Processing Metadata */}
                      {response.data.metadata && (
                        <div className="space-y-3">
                          <h4 className="font-semibold">Processing Info</h4>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            {response.data.metadata.processingTimeMs && (
                              <div className="bg-background/30 rounded-lg p-3 text-center">
                                <div className="font-medium text-muted-foreground">Processing Time</div>
                                <div className="font-semibold">{response.data.metadata.processingTimeMs}ms</div>
                              </div>
                            )}
                            {response.data.metadata.totalSources !== undefined && (
                              <div className="bg-background/30 rounded-lg p-3 text-center">
                                <div className="font-medium text-muted-foreground">Sources Used</div>
                                <div className="font-semibold">{response.data.metadata.totalSources}</div>
                              </div>
                            )}
                            {response.data.metadata.promptType && (
                              <div className="bg-background/30 rounded-lg p-3 text-center">
                                <div className="font-medium text-muted-foreground">Prompt Type</div>
                                <div className="font-semibold">{response.data.metadata.promptType}</div>
                              </div>
                            )}
                            {response.data.metadata.needsExternalData !== undefined && (
                              <div className="bg-background/30 rounded-lg p-3 text-center">
                                <div className="font-medium text-muted-foreground">External Data</div>
                                <div className="font-semibold">
                                  {response.data.metadata.needsExternalData ? 'Yes' : 'No'}
                                </div>
                              </div>
                            )}
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
                    <CollapsibleTrigger className="flex items-center justify-between w-full">
                      <CardTitle className="text-primary text-lg">Payment Response</CardTitle>
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
                        Make sure you're connected to the {baseSepolia.name} network
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-primary">•</span>
                        Payment is processed automatically using x402-fetch
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-primary">•</span>
                        The API returns premium content after payment verification
                      </li>
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