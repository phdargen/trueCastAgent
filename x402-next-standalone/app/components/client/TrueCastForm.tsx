import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { promptSuggestions } from '@/lib/truecast-constants';
import { Loader2, CheckCircle } from 'lucide-react';
import { WalletClient } from 'viem';

interface TrueCastFormProps {
  message: string;
  setMessage: (message: string) => void;
  handlePostSubmit: (e: React.FormEvent) => void;
  loading: boolean;
  isConnected: boolean;
  isOnCorrectChain: boolean;
  walletClient: WalletClient | null | undefined;
  pageType: 'premium' | 'trial';
  resourceWalletAddress: `0x${string}` | undefined;
  transactionStep: 'idle' | 'signing' | 'confirming' | 'confirmed' | 'calling-api';
}

export function TrueCastForm({
  message,
  setMessage,
  handlePostSubmit,
  loading,
  isConnected,
  isOnCorrectChain,
  walletClient,
  pageType,
  resourceWalletAddress,
  transactionStep,
}: TrueCastFormProps) {
  return (
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
          !walletClient ||
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
  );
} 