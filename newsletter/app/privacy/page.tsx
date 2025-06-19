import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-2">
            Privacy Policy
          </h1>
          <p className="text-muted-foreground">
            Last updated: {new Date().toLocaleDateString()}
          </p>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Simple & Straightforward</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>We only collect your <strong>email address</strong> to send you our newsletter.</p>
            
            <p>We <strong>never sell or share</strong> your email with anyone else.</p>
            
            <p>You can <strong>unsubscribe anytime</strong> using the link in our emails.</p>
            
            <p>Your email is stored securely and we&apos;ll delete it if you unsubscribe.</p>
          </CardContent>
        </Card>

        {/* Back link */}
        <div className="text-center">
          <Link 
            href="/"
            className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H6m0 0l6 6m-6-6l6-6"/>
            </svg>
            Back to Newsletter
          </Link>
        </div>
      </div>
    </div>
  );
} 