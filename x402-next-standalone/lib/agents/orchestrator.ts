/**
 * Orchestrator Agent
 * Analyzes prompts and selects appropriate data sources using AI
 */

import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { IDataSource } from "../data_sources/types";
import { getConfig } from "../config";

// Schema for data source specific prompts
const DataSourcePromptSchema = z.object({
  sourceName: z.string().describe("Name of the data source"),
  customPrompt: z.string().describe("Tailored prompt for this specific data source"),
});

// Schema for the orchestrator's decision
const OrchestratorSchema = z.object({
  promptType: z
    .enum([
      "GREETING",
      "GENERAL_QUESTION",
      "FACT_CHECK",
      "CURRENT_EVENTS",
      "FUTURE_PREDICTION",
      "SENTIMENT_ANALYSIS",
      "OTHER",
    ])
    .describe("Type of prompt being analyzed"),
  needsExternalData: z.boolean().describe("Whether this prompt requires external data sources"),
  selectedSources: z
    .array(z.string())
    .describe(
      "Array of data source names that should be used for this query (empty if needsExternalData is false)",
    ),
  dataSourcePrompts: z
    .array(DataSourcePromptSchema)
    .describe("Customized prompts for each selected data source"),
});

export type OrchestratorResult = z.infer<typeof OrchestratorSchema>;
export type DataSourcePrompt = z.infer<typeof DataSourcePromptSchema>;

/**
 * Analyzes a prompt and selects the most relevant data sources
 *
 * @param prompt - The user's input prompt
 * @param availableDataSources - Array of available data sources
 * @param castHash - Optional Farcaster cast hash for context-specific data sources
 * @returns Selected data sources with customized prompts and reasoning
 */
export async function selectDataSources(
  prompt: string,
  availableDataSources: IDataSource[],
  castHash?: string,
): Promise<{
  selectedSources: IDataSource[];
  dataSourcePrompts: DataSourcePrompt[];
  promptType: string;
  needsExternalData: boolean;
}> {
  try {
    const sourceDescriptions = availableDataSources
      .map(source => `- ${source.name}: ${source.description}`)
      .join("\n");

    const castHashInfo = castHash ? `\nCast Hash provided: ${castHash}` : "";

    const orchestratorDecision = await generateObject({
      model: openai(getConfig().models.orchestrator),
      schema: OrchestratorSchema,
      prompt: `You are an intelligent orchestrator for a truth verification system. Your job is to analyze user queries and determine:
1. What type of prompt this is
2. Whether external data sources are needed
3. If so, which sources are most relevant
4. Generate customized prompts for each selected data source

Timestamp: ${new Date().toISOString()}${castHashInfo}

Available data sources:
${sourceDescriptions}

User query: "${prompt}"

PROMPT TYPES:
- GREETING: Simple greetings like "Hi", "Hello", "How are you?"
- GENERAL_QUESTION: Questions that can be answered with general knowledge (no verification needed)
- FACT_CHECK: Claims or statements that need verification against reliable sources
- CURRENT_EVENTS: Questions about recent happenings or current state of things
- FUTURE_PREDICTION: Questions about future events, predictions, or uncertain outcomes
- SENTIMENT_ANALYSIS: Questions about public opinion, market sentiment, or social discussions
- OTHER: Anything that doesn't fit the above categories

GUIDELINES:
- For GREETING/GENERAL_QUESTION: Set needsExternalData to false, selectedSources to empty array, dataSourcePrompts to empty array
- For FACT_CHECK: Use sources that provide reliable, factual information
- For CURRENT_EVENTS: Use web search and real-time sources
- For FUTURE_PREDICTION/SENTIMENT_ANALYSIS: Use social media and market sentiment sources
- If a castHash is provided, ALWAYS include the 'neynar' data source to fetch Farcaster conversation context
- Only select sources that are actually available in the list above

PROMPT CUSTOMIZATION:
For each selected data source, create a customized prompt that:
1. Focuses on what that specific source should provide
2. Tailors the language to the source's capabilities
3. Asks for the most relevant information from that source
4. Maintains the core intent of the original user query

Examples:
- For web search: "Search for recent news articles about [topic]"
- For social media: "Find public sentiment and discussions about [topic]"
- For fact-checking sources: "Verify the accuracy of the claim: [claim]"
- For financial data: "Provide current market data and trends for [topic]"`,
    });

    // Filter the available data sources based on the AI's selection
    const selectedSources = orchestratorDecision.object.needsExternalData
      ? availableDataSources.filter(source =>
          orchestratorDecision.object.selectedSources.includes(source.name),
        )
      : [];

    return {
      selectedSources,
      dataSourcePrompts: orchestratorDecision.object.dataSourcePrompts,
      promptType: orchestratorDecision.object.promptType,
      needsExternalData: orchestratorDecision.object.needsExternalData,
    };
  } catch (error) {
    console.error("Orchestrator error:", error);

    // Fallback: use all available data sources with generic prompts if AI selection fails
    const fallbackPrompts = availableDataSources.map(source => ({
      sourceName: source.name,
      customPrompt: `Using your ${source.name} capabilities, please help answer: ${prompt}`,
    }));

    return {
      selectedSources: availableDataSources,
      dataSourcePrompts: fallbackPrompts,
      promptType: "OTHER",
      needsExternalData: true,
    };
  }
}
