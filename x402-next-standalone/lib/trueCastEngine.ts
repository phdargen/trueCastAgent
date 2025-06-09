/**
 * TrueCast Engine
 * Main orchestration logic for the truth verification system
 */

import { enabledDataSources } from "./data_sources";
import { selectDataSources } from "./agents/orchestrator";
import { generateFinalAnswer, DecisionMakerResult } from "./agents/decisionMaker";
import { validateConfig } from "./config";
import { DataSourceResult } from "./data_sources/types";

export interface TrueCastResponse extends DecisionMakerResult {
  metadata: {
    timestamp: string;
    promptType: string;
    needsExternalData: boolean;
    sourcesUsed: string[];
    totalSources: number;
    processingTimeMs: number;
  };
}

/**
 * Main function that processes a user prompt through the entire truth verification pipeline
 *
 * @param prompt - The user's input prompt to verify or fact-check
 * @returns Comprehensive fact-check response with metadata
 */
export async function processPrompt(prompt: string): Promise<TrueCastResponse> {
  const startTime = Date.now();

  try {
    // Validate configuration before processing
    validateConfig({ skipDataSourceValidation: false });

    // Check if we have any enabled data sources
    if (enabledDataSources.length === 0) {
      console.warn("No data sources are currently enabled. Proceeding with limited functionality.");
    }

    // Step 1: Orchestrator analyzes the prompt and decides on data source needs
    console.log("🧠 Orchestrator analyzing prompt...");
    const { selectedSources, promptType, needsExternalData, dataSourcePrompts } =
      await selectDataSources(prompt, enabledDataSources);

    console.log(`📝 Prompt type: ${promptType}`);
    console.log(`🔍 Needs external data: ${needsExternalData}`);
    console.log(`🔍 Data source prompts: ${JSON.stringify(dataSourcePrompts)}`);

    if (needsExternalData && selectedSources.length === 0) {
      throw new Error(
        "External data was deemed necessary but no appropriate data sources were selected.",
      );
    }

    if (needsExternalData) {
      console.log(
        `📡 Selected ${selectedSources.length} data sources:`,
        selectedSources.map(s => s.name),
      );
    } else {
      console.log("💭 No external data sources needed - using AI knowledge only");
    }

    // Step 2: Fetch data from selected sources (if any)
    let evidence: DataSourceResult[] = [];

    if (needsExternalData && selectedSources.length > 0) {
      console.log("🔍 Fetching data from sources...");
      const evidencePromises = selectedSources.map(source => {
        const sourcePrompt = dataSourcePrompts.find(p => p.sourceName === source.name);
        const promptToUse = sourcePrompt ? sourcePrompt.customPrompt : prompt;
        console.log(`  - Fetching from ${source.name} using prompt: "${promptToUse}"`);
        return source.fetch(promptToUse);
      });

      evidence = await Promise.all(evidencePromises);

      // Log results
      evidence.forEach(result => {
        if (result.success) {
          console.log(`  ✅ ${result.sourceName}: Success`);
        } else {
          console.log(`  ❌ ${result.sourceName}: ${result.error}`);
        }
      });
    } else {
      console.log("⏩ Skipping data source fetching - not needed for this prompt type");
    }

    // Step 3: Decision maker synthesizes the final answer
    console.log("🎯 Decision maker analyzing evidence...");
    const finalDecision = await generateFinalAnswer(prompt, evidence, promptType);

    // Calculate processing time
    const processingTimeMs = Date.now() - startTime;

    // Compile final response with metadata
    const response: TrueCastResponse = {
      ...finalDecision,
      metadata: {
        timestamp: new Date().toISOString(),
        promptType,
        needsExternalData,
        sourcesUsed: evidence.map(e => e.sourceName),
        totalSources: evidence.length,
        processingTimeMs,
      },
    };

    console.log(`✅ Processing complete in ${processingTimeMs}ms`);
    return response;
  } catch (error) {
    const processingTimeMs = Date.now() - startTime;
    console.error("❌ TrueCast engine error:", error);

    // Return error response in the expected format
    return {
      reply: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      verificationResult: "UNVERIFIABLE",
      confidenceScore: 0,
      metadata: {
        timestamp: new Date().toISOString(),
        promptType: "OTHER",
        needsExternalData: false,
        sourcesUsed: [],
        totalSources: 0,
        processingTimeMs,
      },
    };
  }
}
