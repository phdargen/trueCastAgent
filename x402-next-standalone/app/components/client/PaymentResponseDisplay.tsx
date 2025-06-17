import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ExternalLink } from 'lucide-react';

interface PaymentResponseDisplayProps {
  paymentResponse: any;
  isPaymentOpen: boolean;
  setIsPaymentOpen: (isOpen: boolean) => void;
}

export function PaymentResponseDisplay({
  paymentResponse,
  isPaymentOpen,
  setIsPaymentOpen,
}: PaymentResponseDisplayProps) {
  if (!paymentResponse) return null;

  return (
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
  );
} 