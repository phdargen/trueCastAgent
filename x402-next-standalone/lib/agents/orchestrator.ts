/**
 * Orchestrator Agent
 * Analyzes prompts and selects appropriate data sources using AI
 */

import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { bedrock } from "@ai-sdk/amazon-bedrock";
import { z } from "zod";
import { IDataSource } from "../data_sources/types";
import { getConfig } from "../config";
import { buildOrchestratorPrompt } from "./prompts";

// Schema for data source specific prompts
const DataSourcePromptSchema = z.object({
  sourceName: z.string().describe("Name of the data source"),
  customPrompt: z.string().describe("Tailored prompt for this specific data source"),
});

// Schema for the orchestrator's decision
const OrchestratorSchema = z.object({
  promptType: z
    .enum(["GREETING", "GENERAL_QUESTION", "FACT_CHECK", "MARKET_SENTIMENT", "OTHER"])
    .describe("Type of prompt being analyzed"),
  needsExternalData: z.boolean().describe("Whether this prompt requires external data sources"),
  selectedSources: z
    .array(z.string())
    .describe(
      "Array of data source names that should be used for this query (empty if needsExternalData is false). Better to include more sources than too less. Web search should always be included except when the prompt is just a greeting.",
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
 * @param castContext - Optional Farcaster cast conversation context from Neynar
 * @returns Selected data sources with customized prompts and reasoning
 */
export async function selectDataSources(
  prompt: string,
  availableDataSources: IDataSource[],
  castContext?: string,
): Promise<{
  selectedSources: IDataSource[];
  dataSourcePrompts: DataSourcePrompt[];
  promptType: string;
  needsExternalData: boolean;
}> {
  try {
    const orchestratorModel = getConfig().models.orchestrator;
    const isOpenAI = orchestratorModel.startsWith("gpt");
    const model = isOpenAI ? openai(orchestratorModel) : bedrock(orchestratorModel);

    const finalPrompt = buildOrchestratorPrompt(prompt, availableDataSources, castContext);

    const orchestratorDecision = await generateObject({
      model,
      schema: OrchestratorSchema,
      prompt: finalPrompt,
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
