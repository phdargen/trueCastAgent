/**
 * TrueCast Engine
 * Main orchestration logic for the truth verification system
 */

import { enabledDataSources } from "./data_sources";
import { selectDataSources } from "./agents/orchestrator";
import { generateFinalAnswer, DecisionMakerResult } from "./agents/decisionMaker";
import { validateConfig, getConfig } from "./config";
import { DataSourceResult } from "./data_sources/types";
import { fetchCastContext } from "./utils/castContext";
import { uploadToPinata, getPinataGatewayUrl } from "./utils/pinataUpload";
import { validateWithGuardrail } from "./guardrailService";

export interface TrueCastResponse extends DecisionMakerResult {
  metadata: {
    timestamp: string;
    promptType: string;
    needsExternalData: boolean;
    sourcesUsed: string[];
    totalSources: number;
    processingTimeSec: number;
  };
  ipfs?: {
    hash: string;
    gatewayUrl: string;
    network: "public" | "private";
    paymentResponse?: {
      network: string;
      payer: string;
      success: boolean;
      transaction: string;
    };
  };
  guardrail?: {
    input: {
      contentPolicy?: unknown;
    };
    output: {
      contentPolicy?: unknown;
      contextualGroundingPolicy?: unknown;
    };
  };
}

/**
 * Main function that processes a user prompt through the entire truth verification pipeline
 *
 * @param prompt - The user's input prompt to verify or fact-check
 * @param castHash - Optional Farcaster cast hash for context-specific data sources
 * @param storeToPinata - Optional flag to upload response to Pinata IPFS (defaults to false)
 * @param runGuardrail - Optional flag to run AWS Bedrock Guardrails validation (defaults to false)
 * @returns Comprehensive fact-check response with metadata
 */
export async function processPrompt(
  prompt: string,
  castHash?: string,
  storeToPinata: boolean = false,
  runGuardrail: boolean = false,
): Promise<TrueCastResponse> {
  const startTime = Date.now();

  try {
    // Validate configuration before processing
    validateConfig();

    // Check if we have any enabled data sources
    if (enabledDataSources.length === 0) {
      console.warn("No data sources are currently enabled. Proceeding with limited functionality.");
    }

    // Pre-fetch cast context if castHash is provided
    let castContext: string | undefined;

    if (castHash) {
      console.log("🔍 Pre-fetching cast context...");
      const fetchedContext = await fetchCastContext(castHash);
      castContext = fetchedContext || undefined;

      if (castContext) {
        console.log("✅ Successfully retrieved cast context");
      } else {
        console.warn("⚠️ Failed to fetch cast context, proceeding without it");
      }
    }

    // Orchestrator analyzes the prompt and decides on data source needs
    console.log("🧠 Orchestrator analyzing prompt...");
    const { selectedSources, promptType, needsExternalData, dataSourcePrompts } =
      await selectDataSources(prompt, enabledDataSources, castContext);

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

    // Fetch data from selected sources (if any)
    let evidence: DataSourceResult[] = [];

    if (needsExternalData && selectedSources.length > 0) {
      console.log("🔍 Fetching data from sources...");
      const evidencePromises = selectedSources.map(async source => {
        const sourcePrompt = dataSourcePrompts.find(p => p.sourceName === source.name);
        const promptToUse = sourcePrompt ? sourcePrompt.customPrompt : prompt;
        console.log(`  - Fetching from ${source.name} using prompt: "${promptToUse}"`);

        const result = await source.fetch(promptToUse, { castHash });

        // Add the prompt used to the result
        return {
          ...result,
          promptUsed: promptToUse,
        };
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

    // Decision maker synthesizes the final answer
    console.log("🎯 Decision maker analyzing evidence...");
    const finalDecision = await generateFinalAnswer(prompt, evidence, promptType, castContext);

    // Validate the generated response with AWS Bedrock Guardrails (optional)
    let guardrailResult = null;
    if (runGuardrail) {
      console.log("🛡️ Validating response with guardrails...");
      guardrailResult = await validateWithGuardrail(finalDecision.reply, evidence, prompt);
    } else {
      console.log("⏩ Skipping guardrail validation - not requested");
    }

    // Calculate processing time
    const processingTimeSec = (Date.now() - startTime) / 1000;

    // Compile final response with metadata
    const response: TrueCastResponse = {
      ...finalDecision,
      metadata: {
        timestamp: new Date().toISOString(),
        promptType,
        needsExternalData,
        sourcesUsed: evidence.map(e => e.sourceName),
        totalSources: evidence.length,
        processingTimeSec,
      },
    };

    // Include guardrail results if available
    if (runGuardrail) {
      response.guardrail = guardrailResult || {
        input: {
          contentPolicy: { filters: [{ type: "ALL", detected: false, action: "NONE" }] },
        },
        output: {},
      };
    }

    // Upload to Pinata if requested
    if (storeToPinata) {
      const config = getConfig();
      console.log("📌 Uploading response to Pinata IPFS...");
      const uploadResult = await uploadToPinata(response, config.pinata.network);

      if (uploadResult) {
        response.ipfs = {
          hash: uploadResult.ipfsHash,
          gatewayUrl: getPinataGatewayUrl(uploadResult.ipfsHash),
          network: config.pinata.network,
          paymentResponse: uploadResult.paymentResponse,
        };
        console.log(`📌 Response uploaded to IPFS: ${response.ipfs.gatewayUrl}`);
        if (uploadResult.paymentResponse) {
          console.log(`💰 x402 Payment transaction: ${uploadResult.paymentResponse.transaction}`);
        }
      } else {
        console.warn("⚠️ Failed to upload response to Pinata IPFS");
      }
    }

    console.log(`✅ Processing complete in ${processingTimeSec}s`);
    return response;
  } catch (error) {
    const processingTimeSec = (Date.now() - startTime) / 1000;
    console.error("❌ TrueCast engine error:", error);

    // Return error response in the expected format
    return {
      query: prompt,
      reply: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      assessment: "UNVERIFIABLE",
      confidenceScore: 0,
      metadata: {
        timestamp: new Date().toISOString(),
        promptType: "OTHER",
        needsExternalData: false,
        sourcesUsed: [],
        totalSources: 0,
        processingTimeSec,
      },
    };
  }
}
