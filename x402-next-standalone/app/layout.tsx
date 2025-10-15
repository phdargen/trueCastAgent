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
        {/* Favicon for all browsers */}
        <link rel="icon" href="/assets/trueCast.png" type="image/png" sizes="any" />

        {/* Apple (iOS/iPadOS) home screen icon */}
        <link rel="apple-touch-icon" href="/assets/trueCast.png" sizes="180x180" />

        {/* Web app manifest (optional for PWA support) */}
        <link rel="manifest" href="/site.webmanifest" />

        {/* Optional: set the app title for iOS */}
        <meta name="apple-mobile-web-app-title" content="TrueCast" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
