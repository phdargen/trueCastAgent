import Image from 'next/image';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ExternalLink } from 'lucide-react';
import { getDataSourceIcon } from '@/lib/truecast-constants';

const getConfidenceColor = (score: number) => {
  if (score >= 80) return 'text-green-600';
  if (score >= 60) return 'text-yellow-600';
  return 'text-red-600';
};

const PredictionMarket = ({ response }: { response: any }) => {
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
    const yesMatch = reply.match(/YES\s+([\d\.]+)%/);
    const noMatch = reply.match(/NO\s+([\d\.]+)%/);
    if (yesMatch && yesMatch[1]) {
      yesPrice = parseFloat(yesMatch[1]) / 100;
    }
    if (noMatch && noMatch[1]) {
      noPrice = parseFloat(noMatch[1]) / 100;
    }
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
            <p className="font-mono text-xs">Address: {marketAddress}</p>
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
};

interface AnalysisResponseProps {
  response: any;
  isResponseOpen: boolean;
  setIsResponseOpen: (isOpen: boolean) => void;
  isRawDataOpen: boolean;
  setIsRawDataOpen: (isOpen: boolean) => void;
}

export function AnalysisResponse({
  response,
  isResponseOpen,
  setIsResponseOpen,
  isRawDataOpen,
  setIsRawDataOpen,
}: AnalysisResponseProps) {
  if (!response) return null;

  return (
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
            {response.data.reply && (
              <div className="space-y-3">
                <div className="bg-background/50 rounded-lg p-4 border">
                  <p className="text-foreground leading-relaxed whitespace-pre-wrap">
                    {response.data.reply}
                  </p>
                </div>
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

            <PredictionMarket response={response} />

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
  );
} 