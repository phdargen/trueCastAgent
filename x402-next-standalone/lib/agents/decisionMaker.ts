/**
 * Decision Maker Agent
 * Synthesizes evidence from multiple data sources into a final fact-checked response
 */

import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { DataSourceResult } from "../data_sources/types";
import { getConfig } from "../config";

// Schema for the decision maker's final response
const DecisionMakerSchema = z.object({
  reply: z
    .string()
    .max(255)
    .describe(
      "A direct, concise response to the user's prompt with an explanation of how/why the conclusion was reached (max 255 characters)",
    ),
  verificationResult: z
    .enum(["TRUE", "FALSE", "PARTIALLY_TRUE", "UNVERIFIABLE", "NEEDS_MORE_INFO"])
    .describe("The fact-check verdict"),
  confidenceScore: z
    .number()
    .min(0)
    .max(100)
    .describe("Confidence level in the verification result (0-100)"),
});

export type DecisionMakerResult = z.infer<typeof DecisionMakerSchema>;

/**
 * Synthesizes evidence from multiple data sources into a final fact-checked response
 *
 * @param originalPrompt - The user's original query
 * @param evidence - Array of results from data sources
 * @param promptType - The type of prompt being processed (e.g., GREETING, FACT_CHECK, etc.)
 * @returns Structured fact-check response
 */
export async function generateFinalAnswer(
  originalPrompt: string,
  evidence: DataSourceResult[],
  promptType?: string,
): Promise<DecisionMakerResult> {
  try {
    // Handle different prompt types
    const hasEvidence = evidence.length > 0;

    let systemPrompt: string;
    let evidenceSummary = "";

    if (hasEvidence) {
      evidenceSummary = evidence
        .map(result => {
          if (result.success) {
            return `Source: ${result.sourceName}\nData: ${JSON.stringify(result.data, null, 2)}`;
          } else {
            return `Source: ${result.sourceName}\nError: ${result.error}`;
          }
        })
        .join("\n\n---\n\n");
    }

    // Customize the system prompt based on whether we have evidence and prompt type
    if (!hasEvidence && promptType === "GREETING") {
      systemPrompt = `The user sent a greeting: "${originalPrompt}".
Provide a friendly 'reply'.
Set 'verificationResult' to 'UNVERIFIABLE' and 'confidenceScore' to 0.`;
    } else if (!hasEvidence && promptType === "GENERAL_QUESTION") {
      systemPrompt = `The user asked a general question: "${originalPrompt}".
Provide a helpful, direct 'reply' based on your general knowledge.
Set 'verificationResult' to 'TRUE' if you are confident, otherwise 'UNVERIFIABLE'.
Assign a 'confidenceScore' based on your certainty.`;
    } else if (hasEvidence) {
      systemPrompt = `You are an expert fact-checker. Analyze the evidence provided for the user's query and produce a final verdict.
Original user query: "${originalPrompt}"
Evidence:
${evidenceSummary}

Your task is to provide:
1.  A direct, concise 'reply' to the user's query (max 255 chars).
2.  A 'verificationResult' enum ('TRUE', 'FALSE', 'PARTIALLY_TRUE', etc.).
3.  A 'confidenceScore' from 0-100.

Base your entire response ONLY on the evidence provided. Do not add outside information.`;
    } else {
      systemPrompt = `The user asked: "${originalPrompt}". No external data was available.
Provide the best 'reply' you can based on your internal knowledge.
Set 'verificationResult' to 'UNVERIFIABLE' and estimate a 'confidenceScore'.`;
    }

    const finalDecision = await generateObject({
      model: openai(getConfig().models.decisionMaker),
      schema: DecisionMakerSchema,
      prompt: systemPrompt,
    });

    return finalDecision.object;
  } catch (error) {
    console.error("Decision maker error:", error);

    // Fallback response
    return {
      reply: "I'm sorry, I was unable to process your request.",
      verificationResult: "UNVERIFIABLE",
      confidenceScore: 0,
    };
  }
}
