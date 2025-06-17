import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown } from 'lucide-react';
import { Chain } from 'wagmi/chains';

interface HowItWorksProps {
  pageType: 'premium' | 'trial';
  targetChain: Chain;
  isHowItWorksOpen: boolean;
  setIsHowItWorksOpen: (isOpen: boolean) => void;
}

export function HowItWorks({
  pageType,
  targetChain,
  isHowItWorksOpen,
  setIsHowItWorksOpen,
}: HowItWorksProps) {
  return (
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
                This API endpoint is protected by x402 payment middleware requiring a $0.01 payment to access
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary">•</span>
                Make sure you're connected to the {targetChain.name} network
              </li>
              {pageType === 'trial' && (
                <>
                  <li className="flex items-start gap-2">
                    <span className="text-primary">•</span>
                    The free trial uses Coinbase Wallet subaccounts to indicate user intend to send the query to the TrueCast API
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary">•</span>
                    Once confirmed, a CDP v2 server wallet sponsors the TrueCast API call
                  </li>
                </>
              )}
              <li className="flex items-start gap-2">
                <span className="text-primary">•</span>
                Your query is passed to an orchestrator model which selects the best data sources for this question
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary">•</span>
                This includes web search, real-time social feeds, defi metrics and prediction markets.
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary">•</span>
                The data is then processed by a final reasoning model that provides an answer
              </li>
            </ul>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
} 