import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface ErrorDisplayProps {
  error: string | null;
}

export function ErrorDisplay({ error }: ErrorDisplayProps) {
  if (!error) return null;

  return (
    <Card className="border-destructive/50 bg-destructive/5">
      <CardHeader className="pb-3">
        <CardTitle className="text-destructive text-lg">Error</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-destructive font-mono text-sm">{error}</p>
      </CardContent>
    </Card>
  );
} 