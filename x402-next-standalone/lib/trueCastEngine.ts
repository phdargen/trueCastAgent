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
    orchestratorReasoning: string;
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
    const {
      selectedSources,
      reasoning: orchestratorReasoning,
      promptType,
      needsExternalData,
    } = await selectDataSources(prompt, enabledDataSources);

    console.log(`📝 Prompt type: ${promptType}`);
    console.log(`🔍 Needs external data: ${needsExternalData}`);

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
        console.log(`  - Fetching from ${source.name}...`);
        return source.fetch(prompt);
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
        orchestratorReasoning,
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
      verificationResult: "UNVERIFIABLE",
      confidenceScore: 0,
      summary: "An error occurred while processing your request.",
      evidence: [],
      reasoning: `System error: ${error instanceof Error ? error.message : "Unknown error"}`,
      caveats: [
        "This response indicates a system error",
        "Please check your configuration and try again",
      ],
      metadata: {
        timestamp: new Date().toISOString(),
        promptType: "OTHER",
        needsExternalData: false,
        orchestratorReasoning: "N/A - Error occurred before orchestration",
        sourcesUsed: [],
        totalSources: 0,
        processingTimeMs,
      },
    };
  }
}
