"use client";

export const availableDataSources = [
  {
    name: "perplexity",
    description:
      "Web search for real-time information, historical facts/data or scientific information",
    icon: "/assets/perplexity.png",
  },
  {
    name: "tavily",
    description: "LLM-optimized web search",
    icon: "/assets/tavily.png",
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
    description: "Prediction markets for real-time insights powered by collective intelligence",
    icon: "/assets/truemarkets.png",
  },
  {
    name: "neynar",
    description: "Farcaster protocol data and social feeds",
    icon: "/assets/neynar.png",
  },
  {
    name: "bedrock",
    displayName: "AWS Bedrock",
    description:
      "Intelligent prompt routing between Amazon Nova Lite and Nova Pro for orchestrator and CDP AgentKit tool calls",
    icon: "/assets/bedrock.png",
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
