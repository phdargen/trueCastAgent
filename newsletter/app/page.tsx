"use client";

import { useEffect, useState, useCallback } from "react";
import { encodeFunctionData, erc20Abi, parseUnits } from "viem";
import { useSendCalls, useConnect, useAccount } from "wagmi";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Image from "next/image";

interface NewsEvent {
  marketId: number;
  marketAddress: string;
  marketQuestion: string;
  previousPrice: number;
  newPrice: number;
  percentChange: number;
  direction: 'up' | 'down';
  category: string;
  timestamp: number;
  eventType: string;
  webSearchResults: string;
  webSearchResponseId: string;
  interestScore: number;
  newsDescription: string;
  headline?: string;
  imageUrl?: string;
  zoraUrl?: string;
  statusText?: string;
  winningPosition?: number;
  winningPositionString?: string;
  yesPrice?: number;
  noPrice?: number;
}

interface NewsletterResult {
  success: boolean;
  email?: string;
  error?: string;
}



export default function Home() {
  const [newsEvents, setNewsEvents] = useState<NewsEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [newsletterResult, setNewsletterResult] = useState<NewsletterResult | null>(null);

  const { sendCalls, data, error, isPending } = useSendCalls();
  const { connect, connectors } = useConnect();
  const { isConnected } = useAccount();

  // Fetch news events from the API
  useEffect(() => {
    const fetchNewsEvents = async () => {
      try {
        setLoading(true);
        const response = await fetch('https://true-cast.vercel.app/api/news');
        if (!response.ok) {
          throw new Error('Failed to fetch news events');
        }
        const data = await response.json();
        // Sort by timestamp descending (newest first)
        setNewsEvents((data as NewsEvent[]).sort((a: NewsEvent, b: NewsEvent) => b.timestamp - a.timestamp));
      } catch (error) {
        console.error('Error fetching news events:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchNewsEvents();
  }, []);

  // Function to get callback URL - uses environment variable
  function getCallbackURL() {
    const baseUrl = process.env.NEXT_PUBLIC_URL || "http://localhost:3000";
    return `${baseUrl}/api/data-validation`;
  }

  // Function to save email to Redis
  const saveEmailToRedis = useCallback(async (email: string) => {
    try {
      const response = await fetch('/api/save-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      if (response.ok) {
        console.log('Email saved to Redis successfully');
      } else {
        console.error('Failed to save email to Redis');
      }
    } catch (error) {
      console.error('Error saving email to Redis:', error);
    }
  }, []);

  // Function to send welcome email and save to Redis
  const sendWelcomeEmail = useCallback(async (email: string) => {
    try {
      const response = await fetch('/api/send-welcome-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      if (response.ok) {
        console.log('Welcome email sent successfully');
        
        // Save email to Redis database
        await saveEmailToRedis(email);
      } else {
        console.error('Failed to send welcome email');
      }
    } catch (error) {
      console.error('Error sending welcome email:', error);
    }
  }, [saveEmailToRedis]);

  // Handle response data when sendCalls completes
  useEffect(() => {
    if (data?.capabilities?.dataCallback) {
      const callbackData = data.capabilities.dataCallback;
      const newResult: NewsletterResult = { success: true };

      // Extract email if provided
      if (callbackData.email) {
        newResult.email = callbackData.email;
        
        // Send welcome email
        sendWelcomeEmail(callbackData.email);
      }

      setNewsletterResult(newResult);
    } else if (data && !data.capabilities?.dataCallback) {
      setNewsletterResult({ success: false, error: "Invalid response - no data callback" });
    }
  }, [data, sendWelcomeEmail]);



  // Handle errors
  useEffect(() => {
    if (error) {
      setNewsletterResult({
        success: false,
        error: error.message || "Transaction failed"
      });
    }
  }, [error]);

  // Handle wallet connection
  async function handleWalletConnect() {
    try {
      setNewsletterResult(null);
      if (!isConnected && connectors.length > 0) {
        await connect({ connector: connectors[0] });
      }
    } catch (err) {
      setNewsletterResult({
        success: false,
        error: err instanceof Error ? err.message : "Failed to connect wallet"
      });
    }
  }

  // Handle newsletter signup
  async function handleNewsletterSignup() {
    try {
      setNewsletterResult(null);

      // Send calls using wagmi hook - only request email
      sendCalls({
        connector: connectors[0],
        account: null,
        calls: [
          {
            to: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // USDC on Base Sepolia
            data: encodeFunctionData({
              abi: erc20Abi,
              functionName: "transfer",
              args: [
                "0xa8c1a5D3C372C65c04f91f87a43F549619A9483f",
                parseUnits("0.00", 6),
              ],
            }),
          },
        ],
        chainId: 84532, // Base Sepolia
        capabilities: {
          dataCallback: {
            requests: [{ type: "email", optional: false }],
            callbackURL: getCallbackURL(),
          },
        },
      });
    } catch (err) {
      setNewsletterResult({
        success: false,
        error: err instanceof Error ? err.message : "Unknown error occurred"
      });
    }
  }

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 60) {
      return `${diffMins}m ago`;
    } else if (diffHours < 24) {
      return `${diffHours}h ago`;
    } else {
      return `${diffDays}d ago`;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-2">
            TrueCast News
          </h1>
          <p className="text-muted-foreground text-lg">
            Stay updated with the latest market insights and predictions
          </p>
        </div>

        {/* Newsletter Signup */}
        <Card className="mb-8 border-gradient bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950 dark:to-purple-950">
          <CardHeader className="text-center">
            <CardTitle className="flex items-center justify-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                <polyline points="22,6 12,13 2,6"></polyline>
              </svg>
              Subscribe to Newsletter
            </CardTitle>
            <CardDescription>
              Get the latest market predictions and news delivered to your inbox
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <div className="flex flex-col sm:flex-row gap-3 items-center justify-center">
              <Button 
                onClick={isConnected ? handleNewsletterSignup : handleWalletConnect}
                disabled={isPending}
                size="lg"
                className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
              >
                {isPending ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Processing...
                  </>
                ) : isConnected ? (
                  "Sign Up Now"
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                      <circle cx="12" cy="16" r="1"></circle>
                      <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                    </svg>
                    Connect Wallet to sign up
                  </>
                )}
              </Button>
              
              <Button 
                variant="outline" 
                size="lg"
                onClick={() => window.open('/privacy', '_blank')}
                className="border-muted-foreground/20 hover:border-muted-foreground/40"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                  <path d="M14 9V5a3 3 0 0 0-6 0v4"></path>
                  <rect x="2" y="9" width="20" height="11" rx="2" ry="2"></rect>
                </svg>
                Privacy Policy
              </Button>
            </div>

            {/* Newsletter Result */}
            {newsletterResult && newsletterResult.success && (
              <div className="p-4 rounded-lg bg-green-100 dark:bg-green-900 border border-green-300 dark:border-green-700">
                <h3 className="text-lg font-semibold mb-2 text-green-800 dark:text-green-200">
                  ✅ Successfully Subscribed!
                </h3>
                {newsletterResult.email && (
                  <p className="mb-1">
                    <strong>Email:</strong> <span className="font-mono">{newsletterResult.email}</span>
                  </p>
                )}
              </div>
            )}


          </CardContent>
        </Card>

        {/* News Feed */}
        <div className="space-y-6">
          <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2" />
              <path d="M18 14h-8" />
              <path d="M18 18h-8" />
              <path d="M18 10h-8" />
            </svg>
            Latest News
          </h2>

          {loading ? (
            <div className="flex justify-center items-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          ) : newsEvents.length === 0 ? (
            <Card>
              <CardContent className="text-center py-12">
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mx-auto text-muted-foreground mb-4">
                  <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2" />
                  <path d="M18 14h-8" />
                  <path d="M18 18h-8" />
                  <path d="M18 10h-8" />
                </svg>
                <h3 className="text-xl font-semibold mb-2">No News Available</h3>
                <p className="text-muted-foreground">Check back later for market updates and news.</p>
              </CardContent>
            </Card>
          ) : (
            newsEvents.map((event) => (
              <Card key={`${event.marketId}-${event.timestamp}`} className="hover:shadow-lg transition-shadow duration-200 overflow-hidden p-0">
                {/* Large full width image */}
                {event.imageUrl && (
                  <div className="w-full h-80 relative bg-white dark:bg-slate-900 border-b-4 border-gradient-to-r from-blue-500 to-purple-500 rounded-t-lg overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-purple-500/10"></div>
                    <Image
                      src={event.imageUrl}
                      alt={event.headline || 'News image'}
                      fill
                      className="object-contain p-4 rounded-2xl"
                      style={{ borderRadius: '1rem' }}
                      sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                    />
                  </div>
                )}
                
                <CardHeader>
                  <div className="space-y-3">
                    {/* Headline as main title */}
                    <CardTitle className="text-xl font-bold leading-tight">
                      {event.headline || event.marketQuestion}
                    </CardTitle>
                    
                    {/* Category and time together */}
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{event.category}</Badge>
                      <span className="text-sm text-muted-foreground">
                        {formatTime(event.timestamp)}
                      </span>
                    </div>
                    
                    {/* Market question as subtitle (only if different from headline) */}
                    {event.headline && event.headline !== event.marketQuestion && (
                      <p className="text-base text-muted-foreground font-medium">
                        Market: {event.marketQuestion}
                      </p>
                    )}
                  </div>
                </CardHeader>
                <CardContent>

                  {/* Market Status */}
                  {event.statusText === "Finalized" ? (
                    <div className="flex items-center mb-3">
                      <Badge className={
                        event.winningPosition === 1 ? "bg-green-600" : "bg-red-600"
                      }>
                        Outcome: {event.winningPositionString || (event.winningPosition === 1 ? "Yes" : event.winningPosition === 2 ? "No" : "Unknown")}
                      </Badge>
                    </div>
                  ) : (
                    <>
                      {event.statusText === "Resolution Proposed" && (
                        <div className="flex items-center mb-3">
                          <Badge variant="secondary">
                            Proposed: {event.winningPositionString || (event.winningPosition === 1 ? "Yes" : event.winningPosition === 2 ? "No" : "Unknown")}
                          </Badge>
                        </div>
                      )}

                      {event.yesPrice !== undefined && event.noPrice !== undefined && (
                        <div className="flex gap-2 mb-3">
                          <Badge className="bg-green-600 flex-1 text-center">
                            Yes {(event.yesPrice * 100).toFixed(1)}%
                          </Badge>
                          <Badge className="bg-red-600 flex-1 text-center">
                            No {(event.noPrice * 100).toFixed(1)}%
                          </Badge>
                        </div>
                      )}
                    </>
                  )}

                  <p className="text-muted-foreground mb-4">{event.newsDescription}</p>

                  {/* Action buttons */}
                  {event.zoraUrl && (
                    <div className="flex gap-2 pt-4 border-t">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="flex-1"
                        onClick={() => window.open(event.zoraUrl, '_blank')}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                          <circle cx="12" cy="12" r="9" />
                          <path d="M14.8 9A2 2 0 0 0 13 8h-2a2 2 0 0 0 0 4h2a2 2 0 0 1 0 4h-2a2 2 0 0 1-1.8-1" />
                          <path d="M12 6v2" />
                          <path d="M12 16v2" />
                        </svg>
                        Collect
                      </Button>
                      
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="flex-1"
                        onClick={() => {
                          const text = `${event.headline || event.marketQuestion}`;
                          const url = `https://warpcast.com/~/compose?text=${encodeURIComponent(text)}&embeds[]=${encodeURIComponent(event.zoraUrl!)}`;
                          window.open(url, '_blank');
                        }}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                          <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path>
                          <polyline points="16 6 12 2 8 6"></polyline>
                          <line x1="12" y1="2" x2="12" y2="15"></line>
                        </svg>
                        Share
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
