import Link from 'next/link';
import WordmarkCondensed from './assets/x402_wordmark_light.svg';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import Image from 'next/image';

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 flex flex-col">
      <div className="flex-grow">
        {/* Hero Section */}
        <section className="max-w-6xl mx-auto px-4 py-12 lg:py-16">
          <div className="text-center space-y-8">
            <div className="w-64 mx-auto">
              <Image 
                src="/assets/trueCast.png" 
                alt="TrueCast Logo" 
                width={256} 
                height={256} 
                className="mx-auto rounded-lg"
                priority
              />
            </div>
            <p className="text-xl text-muted-foreground font-mono">
              TrueCast: Real-time news aggregator grounded by prediction markets
            </p>
            
            <div className="max-w-4xl mx-auto flex justify-center">
              {/* Premium Version */}
              <Card className="group hover:shadow-lg transition-all hover:border-primary/50 w-full max-w-md">
                <CardHeader>
                  <CardTitle className="flex items-center justify-center gap-2 text-2xl">
                    TrueCast API
                    <Badge variant="default" className="bg-primary/90 hover:bg-primary text-xs">
                      $0.10 per request
                    </Badge>
                  </CardTitle>
                  <CardDescription className="text-center text-base">
                    Access x402 protected API endpoint to query real-time news, social feeds and prediction markets
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col items-center gap-4">
                  <Button asChild size="lg" className="w-full max-w-xs bg-primary hover:bg-primary/90">
                    <Link href="/truecast">
                      Start
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
        Built with OnchainKit + CDP AgentKit + CDP Wallets V2 + x402
        </div>
      </footer>
    </div>
  );
}
