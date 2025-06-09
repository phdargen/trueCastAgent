/**
 * Decision Maker Agent
 * Synthesizes evidence from multiple data sources into a final fact-checked response
 */

import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { DataSourceResult } from "../data_sources/types";

// Schema for the decision maker's final response
const DecisionMakerSchema = z.object({
  verificationResult: z
    .enum(["TRUE", "FALSE", "PARTIALLY_TRUE", "UNVERIFIABLE", "NEEDS_MORE_INFO"])
    .describe("The fact-check verdict"),
  confidenceScore: z
    .number()
    .min(0)
    .max(100)
    .describe("Confidence level in the verification result (0-100)"),
  summary: z.string().describe("A clear, concise summary of the findings"),
  evidence: z
    .array(
      z.object({
        source: z.string().describe("The data source name"),
        finding: z.string().describe("What this source revealed"),
        reliability: z.enum(["HIGH", "MEDIUM", "LOW"]).describe("Reliability of this evidence"),
      }),
    )
    .describe("Summary of evidence from each source"),
  reasoning: z.string().describe("Detailed explanation of how the conclusion was reached"),
  caveats: z.array(z.string()).describe("Important limitations or caveats to consider"),
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
      systemPrompt = `You are a friendly AI assistant. The user has sent a greeting. Respond appropriately and helpfully.

User greeting: "${originalPrompt}"

Provide a warm, friendly response. Set verificationResult to 'UNVERIFIABLE' since this is not a factual claim.`;
    } else if (!hasEvidence && promptType === "GENERAL_QUESTION") {
      systemPrompt = `You are a knowledgeable AI assistant. The user has asked a general question that can be answered with established knowledge without needing external verification.

User question: "${originalPrompt}"

Provide a helpful, accurate answer based on your knowledge. If this involves factual claims you're confident about, you may set verificationResult to 'TRUE'. For questions without clear factual answers, use 'UNVERIFIABLE'.`;
    } else if (hasEvidence) {
      systemPrompt = `You are an expert fact-checker and truth verification agent. Your job is to analyze evidence from multiple sources and provide a comprehensive, balanced assessment.

Original user query: "${originalPrompt}"

Evidence gathered from sources:
${evidenceSummary}

Your task:
1. Analyze all available evidence
2. Cross-reference information between sources
3. Identify any contradictions or inconsistencies
4. Provide a clear verdict on the truthfulness of the claim or answer to the question
5. Be transparent about limitations and confidence levels

Guidelines:
- TRUE: The claim is factually accurate based on reliable evidence
- FALSE: The claim is demonstrably false based on evidence
- PARTIALLY_TRUE: Some aspects are true, others are false or misleading
- UNVERIFIABLE: Cannot be verified with available evidence
- NEEDS_MORE_INFO: Insufficient evidence to make a determination

Be objective, cite your sources, and explain your reasoning clearly. If evidence is contradictory, acknowledge this and explain how you weighted different sources.`;
    } else {
      systemPrompt = `You are an AI assistant. The user has asked a question but no external sources were consulted.

User query: "${originalPrompt}"

Provide the best answer you can based on your knowledge, but be transparent about the limitations since no external verification was performed.`;
    }

    const finalDecision = await generateObject({
      model: openai("gpt-4o"),
      schema: DecisionMakerSchema,
      prompt: systemPrompt,
    });

    return finalDecision.object;
  } catch (error) {
    console.error("Decision maker error:", error);

    // Fallback response
    return {
      verificationResult: "UNVERIFIABLE",
      confidenceScore: 0,
      summary: "Unable to process the verification request due to a technical error.",
      evidence: evidence.map(result => ({
        source: result.sourceName,
        finding: result.success
          ? "Data retrieved but processing failed"
          : result.error || "Unknown error",
        reliability: "LOW" as const,
      })),
      reasoning: "The AI decision maker encountered an error during processing.",
      caveats: ["This response is a fallback due to technical issues", "Please try again later"],
    };
  }
}
