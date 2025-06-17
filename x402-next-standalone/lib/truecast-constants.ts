"use client";

export const availableDataSources = [
  {
    name: "perplexity",
    description:
      "Web search for real-time information, historical facts/data or scientific information",
    icon: "/assets/perplexity.png",
  },
  {
    name: "x-twitter",
    displayName: "X AI",
    description: "Social media sentiment, discussions and real-time public opinion",
    icon: "/assets/x.png",
  },
  {
    name: "pyth",
    description: "Real-time cryptocurrency prices from Pyth Network",
    icon: "/assets/pyth.png",
  },
  {
    name: "defillama",
    description: "DeFi protocol information such as description, TVL, market cap and token prices",
    icon: "/assets/defillama.png",
  },
  {
    name: "truemarkets",
    description: "Prediction markets and their current odds/prices for crowd wisdom insights",
    icon: "/assets/truemarkets.png",
  },
  {
    name: "neynar",
    description: "Farcaster protocol data and social feeds",
    icon: "/assets/neynar.png",
  },
];

export const promptSuggestions = [
  "When BTC all time high?",
  "Largest company in the world?",
  "What is the price of ETH?",
  "Latest AI breakthrough news?",
];

export const getDataSourceIcon = (sourceName: string) => {
  const source = availableDataSources.find(ds => ds.name === sourceName);
  return source?.icon || null;
};
