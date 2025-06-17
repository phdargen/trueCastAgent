import Image from 'next/image';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { availableDataSources } from '@/lib/truecast-constants';

export function DataSourceInfo() {
  return (
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
  );
} 