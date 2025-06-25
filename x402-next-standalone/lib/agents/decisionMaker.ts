/**
 * Decision Maker Agent
 * Synthesizes evidence from multiple data sources into a final fact-checked response
 */

import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { bedrock } from '@ai-sdk/amazon-bedrock';
import { z } from "zod";
import { DataSourceResult } from "../data_sources/types";
import { getConfig } from "../config";
import { buildDecisionMakerPrompt } from "./prompts";

// Schema for the AI-generated decision maker response
const DecisionMakerAISchema = z.object({
  reply: z
    .string()
    .describe(
      "A compelling, authoritative response in professional news style. Include specific details, current prices, and contextual information from data sources. Structure: [Key finding/conclusion] → [Current data & specific numbers] → [Additional context & implications]. Be engaging and informative while maintaining journalistic standards. Aim for 2-4 sentences that provide real value to the reader.",
    ),
  assessment: z
    .enum(["TRUE", "FALSE", "PARTIALLY_TRUE", "UNVERIFIABLE", "MARKET_SENTIMENT"])
    .describe("The final assessment of the query based on available evidence"),
  confidenceScore: z
    .number()
    .min(0)
    .max(100)
    .describe("Confidence level in the assessment (0-100)"),
});

// Schema for the final response with data sources
const DecisionMakerSchema = z.object({
  query: z.string().describe("The original user query that was processed"),
  reply: z.string(),
  assessment: z.enum(["TRUE", "FALSE", "PARTIALLY_TRUE", "UNVERIFIABLE", "MARKET_SENTIMENT"]),
  confidenceScore: z.number().min(0).max(100),
  data_sources: z
    .array(
      z.object({
        name: z.string().describe("Name of the data source"),
        prompt: z.string().describe("The prompt sent to this data source"),
        reply: z.string().describe("The response received from this data source"),
        source: z.string().optional().describe("Source URL or identifier if available"),
      }),
    )
    .optional()
    .describe("Information from all data sources used in the decision-making process"),
});

export type DecisionMakerResult = z.infer<typeof DecisionMakerSchema>;

/**
 * Synthesizes data source results into a final fact-checked response
 *
 * @param originalPrompt - The user's original query
 * @param dataSourceResults - Array of results from data sources
 * @param promptType - The type of prompt being processed (e.g., GREETING, FACT_CHECK, etc.)
 * @param castContext - Optional Farcaster cast conversation context
 * @returns Structured fact-check response
 */
export async function generateFinalAnswer(
  originalPrompt: string,
  dataSourceResults: DataSourceResult[],
  promptType?: string,
  castContext?: string,
): Promise<DecisionMakerResult> {
  try {
    // Build the complete system prompt
    const systemPrompt = buildDecisionMakerPrompt(
      originalPrompt,
      dataSourceResults,
      castContext,
      promptType,
    );

    const decisionMakerModel = getConfig().models.decisionMaker;
    const isOpenAI = decisionMakerModel.startsWith('gpt');
    const model = isOpenAI ? openai(decisionMakerModel) : bedrock(decisionMakerModel);

    const aiDecision = await generateObject({
      model,
      schema: DecisionMakerAISchema,
      prompt: systemPrompt,
    });

    // Build final response with AI decision
    const finalResponse: DecisionMakerResult = {
      query: originalPrompt,
      reply: aiDecision.object.reply,
      assessment: aiDecision.object.assessment,
      confidenceScore: aiDecision.object.confidenceScore,
    };

    // Include data from all sources used in the decision-making process
    const allDataSources = [];

    // Add cast context as a data source if available
    if (castContext) {
      allDataSources.push({
        name: "neynar",
        prompt: "Summarize conversation context.",
        reply: castContext,
        source: "Farcaster",
      });
    }

    // Add data source results
    if (dataSourceResults && dataSourceResults.length > 0) {
      allDataSources.push(
        ...dataSourceResults.map(result => ({
          name: result.sourceName,
          prompt: result.promptUsed || originalPrompt,
          reply: result.response || "No response received",
          source: result.sources?.[0] || undefined,
        })),
      );
    }

    if (allDataSources.length > 0) {
      finalResponse.data_sources = allDataSources;
    }

    console.log("Final response:", finalResponse.reply);

    return finalResponse;
  } catch (error) {
    console.error("Decision maker error:", error);

    // Fallback response
    return {
      query: originalPrompt,
      reply: "I'm sorry, I was unable to process your request.",
      assessment: "UNVERIFIABLE",
      confidenceScore: 0,
    };
  }
}

export { DecisionMakerSchema };
