import Link from 'next/link';
import WordmarkCondensed from './assets/x402_wordmark_light.svg';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 flex flex-col">
      <div className="flex-grow">
        {/* Hero Section */}
        <section className="max-w-6xl mx-auto px-4 py-20 lg:py-28">
          <div className="text-center space-y-8">
            <div className="w-64 mx-auto">
              <WordmarkCondensed className="mx-auto" />
            </div>
            <p className="text-xl text-muted-foreground font-mono">
              Fullstack demo powered by Next.js
            </p>
            
            <div className="max-w-4xl mx-auto grid md:grid-cols-2 gap-6">
              {/* Premium Version */}
              <Card className="group hover:shadow-lg transition-all hover:border-primary/50">
                <CardHeader>
                  <CardTitle className="flex items-center justify-center gap-2 text-2xl">
                    TrueCast API
                    <Badge variant="default" className="bg-primary/90 hover:bg-primary text-xs">
                      Premium
                    </Badge>
                  </CardTitle>
                  <CardDescription className="text-center text-base">
                    Experience the future of web monetization with our premium API endpoints powered by micropayments
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col items-center gap-4">
                  <div className="text-sm text-muted-foreground text-center max-w-md">
                    Send messages through our protected API endpoint with automated $0.01 payments on Base mainnet
                  </div>
                  <Button asChild size="lg" className="w-full max-w-xs bg-primary hover:bg-primary/90">
                    <Link href="/truecast">
                      Try TrueCast API
                    </Link>
                  </Button>
                </CardContent>
              </Card>

              {/* Trial Version */}
              <Card className="group hover:shadow-lg transition-all hover:border-green-500/50 bg-green-50/50">
                <CardHeader>
                  <CardTitle className="flex items-center justify-center gap-2 text-2xl">
                    TrueCast API
                    <Badge variant="secondary" className="bg-green-100 text-green-800 hover:bg-green-200 text-xs">
                      Free Trial
                    </Badge>
                  </CardTitle>
                  <CardDescription className="text-center text-base">
                    Experience popup-less payments with Smart Wallet Sub Accounts - no wallet confirmations needed!
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col items-center gap-4">
                  <div className="text-sm text-muted-foreground text-center max-w-md">
                    Try our sponsored Sub Account experience on Base Sepolia with frictionless transactions
                  </div>
                  <Button asChild size="lg" className="w-full max-w-xs bg-green-600 hover:bg-green-700 text-white">
                    <Link href="/truecast-trial">
                      Try Free Trial
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>
      </div>
      
      <footer className="py-8 text-center text-sm text-muted-foreground border-t">
        <div className="max-w-4xl mx-auto px-4">
          By using this site, you agree to be bound by the{' '}
          <a
            href="https://www.coinbase.com/legal/developer-platform/terms-of-service"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            CDP Terms of Service
          </a>{' '}
          and{' '}
          <a
            href="https://www.coinbase.com/legal/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            Global Privacy Policy
          </a>
          .
        </div>
      </footer>
    </div>
  );
}
