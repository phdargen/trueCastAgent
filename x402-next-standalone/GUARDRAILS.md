# AWS Bedrock Guardrails Integration

This document explains how to configure and use AWS Bedrock Guardrails with the TrueCast engine for content filtering and contextual grounding validation.

## Overview

The guardrail integration validates the final AI-generated responses from the TrueCast engine against:

1. **Content Filters**: Detects harmful content like hate speech, violence, sexual content, etc.
2. **Contextual Grounding**: Validates that the AI response is factually grounded in the data sources used
3. **Topic Filters**: Blocks responses on denied topics
4. **Word Filters**: Blocks specific words or phrases
5. **Sensitive Information**: Detects and masks PII or other sensitive data

## Configuration

### Environment Variables

Add the following environment variables to your `.env` file:

```bash
# AWS Credentials
AWS_ACCESS_KEY_ID=your_aws_access_key_id
AWS_SECRET_ACCESS_KEY=your_aws_secret_access_key
AWS_REGION=us-east-1

# Bedrock Guardrail Configuration
BEDROCK_GUARDRAIL_ID=gr-0123456789abcdef
BEDROCK_GUARDRAIL_VERSION=1
```

### AWS Setup

1. Create a Bedrock Guardrail in your AWS account through the AWS Console
2. Configure the guardrail policies according to your requirements:
   - Enable content filters for harmful content detection
   - Configure contextual grounding with appropriate thresholds
   - Set up any custom topic or word filters as needed
3. Note the Guardrail ID and Version for your environment variables

## How It Works

### Integration Point

The guardrail validation is integrated into the `processPrompt` function in `lib/trueCastEngine.ts`. After the decision maker generates the final response, but before returning it to the user, the system:

1. Calls `validateWithGuardrail()` with:
   - The generated response text
   - The evidence from data sources (for grounding validation)  
   - The original user prompt

2. Logs detailed assessment results including:
   - Content policy violations
   - Contextual grounding scores
   - Topic/word filter matches
   - Sensitive information detection

### Current Behavior

**The guardrail currently only logs results and does NOT take action on violations.** This allows you to:

- Monitor what types of content trigger guardrail policies
- Tune guardrail thresholds without affecting user experience
- Analyze grounding scores to understand response quality

## Testing

### Basic Test

Run the simple guardrail test:

```bash
npm run dev test-guardrail.ts
```

### Integration Test

Test guardrails with the full TrueCast pipeline:

```bash
npm run dev test-guardrail-integration.ts
```

This will test various prompts including:
- Normal factual queries (should pass)
- Prompt injection attempts (should trigger security policies)
- Requests for ungrounded information (should show low grounding scores)

## Implementation Details

### Data Source Context

The guardrail service automatically formats data source results as grounding sources:

```typescript
// Each data source result becomes a grounding source
{
  sourceType: "TEXT",
  content: {
    text: {
      text: `Source: ${sourceName}\nPrompt: ${promptUsed}\nResponse: ${response}`,
      qualifiers: ["grounding_source"]
    }
  }
}
```

### Contextual Grounding

The contextual grounding check compares the AI's response against the evidence from data sources to detect:

- **Hallucinations**: Information not supported by the sources
- **Relevance**: Whether the response addresses the user's query appropriately

Grounding scores and thresholds help determine if the response is factually reliable.

## Next Steps

To enable automatic response filtering based on guardrail violations:

1. Modify the `validateWithGuardrail` function to return violation details
2. Update `processPrompt` to handle violations by:
   - Replacing the response with a safe message
   - Lowering confidence scores
   - Changing the assessment to "UNVERIFIABLE"
   - Adding warning metadata

## Troubleshooting

### Common Issues

1. **"Guardrail not configured"**: Ensure `BEDROCK_GUARDRAIL_ID` is set
2. **AWS authentication errors**: Verify AWS credentials and region
3. **No grounding sources**: Check that data sources are enabled and returning results

### Logging

The guardrail service provides detailed logging of:
- Assessment results for each policy type
- Grounding scores and thresholds  
- Usage statistics
- Error details with AWS error codes

Enable debug logging to see the full assessment details in your console output. 