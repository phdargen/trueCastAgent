# TrueCast Truth Oracle API

A modular AI-powered fact-checking and truth verification system built on top of the x402 payment protocol.

## Overview

TrueCast processes user prompts through a sophisticated pipeline:

1. **Orchestrator Agent** - Analyzes the prompt and selects relevant data sources
2. **Data Source Connectors** - Fetch information from various APIs (Perplexity, X/Twitter, etc.)
3. **Decision Maker Agent** - Synthesizes evidence into a comprehensive fact-check response

## Architecture

```
User Prompt → Orchestrator → Data Sources → Decision Maker → Response
                  ↓              ↓              ↓
               AI Selection   Parallel Fetch   AI Synthesis
```

## Configuration

### Environment Variables

Copy the configuration template and set your API keys:

```bash
# OpenAI Configuration (Required)
OPENAI_API_KEY=your_openai_api_key_here

# Data Sources (Set to 'true' to enable, 'false' or remove to disable)
DATASOURCE_PERPLEXITY_ENABLED=true
PERPLEXITY_API_KEY=your_perplexity_api_key_here

DATASOURCE_X_TWITTER_ENABLED=true
X_TWITTER_API_KEY=your_x_twitter_api_key_here
X_TWITTER_API_SECRET=your_x_twitter_api_secret_here
X_TWITTER_BEARER_TOKEN=your_x_twitter_bearer_token_here
```

### Adding New Data Sources

1. Create a new file in `lib/data_sources/` (e.g., `reddit.ts`)
2. Implement the `IDataSource` interface:
   ```typescript
   export class RedditDataSource implements IDataSource {
     name = 'reddit';
     description = 'Community discussions and user-generated content from Reddit';
     async fetch(prompt: string): Promise<DataSourceResult> {
       // Your implementation
     }
   }
   ```
3. Add configuration in `lib/config.ts`
4. Register in `lib/data_sources/index.ts`

## API Usage

### Endpoint
```
POST /api/trueCast
```

### Request Body
```json
{
  "prompt": "Is climate change caused by human activities?"
}
```

### Response Format
```json
{
  "verificationResult": "TRUE|FALSE|PARTIALLY_TRUE|UNVERIFIABLE|NEEDS_MORE_INFO",
  "confidenceScore": 85,
  "summary": "Clear summary of findings",
  "evidence": [
    {
      "source": "perplexity",
      "finding": "What this source revealed",
      "reliability": "HIGH|MEDIUM|LOW"
    }
  ],
  "reasoning": "Detailed explanation of how the conclusion was reached",
  "caveats": ["Important limitations to consider"],
  "metadata": {
    "timestamp": "2024-01-01T00:00:00.000Z",
    "orchestratorReasoning": "Why these sources were selected",
    "sourcesUsed": ["perplexity", "x-twitter"],
    "totalSources": 2,
    "processingTimeMs": 3500
  }
}
```

## Current Status

⚠️ **Placeholder Implementation**: Data sources currently return mock data for testing. Real API integrations need to be implemented.

### Data Sources Status
- ✅ **Architecture**: Modular, configurable system
- 🔄 **Perplexity**: Placeholder implementation ready for API integration
- 🔄 **X/Twitter**: Placeholder implementation ready for API integration
- ✅ **Orchestrator**: AI-powered source selection using GPT-4o-mini
- ✅ **Decision Maker**: AI-powered synthesis using GPT-4o

## Development

### Project Structure
```
lib/
├── trueCastEngine.ts          # Main orchestration logic
├── config.ts                  # Environment configuration
├── agents/
│   ├── orchestrator.ts        # AI source selection
│   └── decisionMaker.ts       # AI evidence synthesis
└── data_sources/
    ├── index.ts               # Data source registry
    ├── types.ts               # Common interfaces
    ├── perplexity.ts          # Perplexity connector
    └── x-twitter.ts           # X/Twitter connector
```

### Running Locally
1. Install dependencies: `npm install`
2. Set up environment variables (see Configuration above)
3. Run development server: `npm run dev`
4. Test endpoint: `POST http://localhost:3000/api/trueCast`

## Next Steps

1. **Implement Real Data Sources**: Replace placeholder implementations with actual API calls
2. **Add More Sources**: Reddit, News APIs, Academic databases, etc.
3. **Enhanced Error Handling**: Better fallbacks and retry logic
4. **Rate Limiting**: Implement per-source rate limiting
5. **Caching**: Add intelligent caching for repeated queries
6. **Monitoring**: Add logging and analytics

## Security Notes

- All API keys should be stored in environment variables
- The x402 middleware handles payment verification
- Data source failures are handled gracefully
- All AI responses include confidence scores and caveats 