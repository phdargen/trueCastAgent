import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: 'TrueCast API - Real-time news aggregator grounded by prediction markets',
  description: 'Access real-time news, social feeds, and prediction markets through the TrueCast API. Powered by x402 payment protocol.',
  openGraph: {
    title: 'TrueCast API',
    description: 'Real-time news aggregator grounded by prediction markets',
    url: 'https://true-cast-agent.vercel.app',
    siteName: 'TrueCast',
    images: [
      {
        url: '/assets/trueCast.png',
        width: 1200,
        height: 630,
        alt: 'TrueCast Logo',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'TrueCast API',
    description: 'Real-time news aggregator grounded by prediction markets',
    images: ['/assets/trueCast.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link
          rel="icon"
          type="image/png"
          href="/favicon-96x96.png"
          sizes="96x96"
        />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link
          rel="apple-touch-icon"
          sizes="180x180"
          href="/apple-touch-icon.png"
        />
        <meta name="apple-mobile-web-app-title" content="x402" />
        <link rel="manifest" href="/site.webmanifest" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
