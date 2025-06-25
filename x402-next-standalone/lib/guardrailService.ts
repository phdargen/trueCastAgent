/**
 * Guardrail Service
 * Handles validation of generated content using AWS Bedrock Guardrails
 */

import { BedrockRuntimeClient, ApplyGuardrailCommand } from "@aws-sdk/client-bedrock-runtime";
import { getConfig } from "./config";
import { DataSourceResult } from "./data_sources/types";

interface GuardrailValidationResult {
  input: {
    contentPolicy?: unknown;
  };
  output: {
    contentPolicy?: unknown;
    contextualGroundingPolicy?: unknown;
  };
}

/**
 * Validates generated content against AWS Bedrock Guardrails
 * Currently only logs results without taking action on violations
 *
 * @param generatedReply - The AI-generated response to validate
 * @param evidence - Data source results used as grounding context
 * @param originalPrompt - The original user prompt
 * @returns Promise<GuardrailValidationResult | null> - Guardrail assessment or null if error
 */
export async function validateWithGuardrail(
  generatedReply: string,
  evidence: DataSourceResult[],
  originalPrompt: string,
): Promise<GuardrailValidationResult | null> {
  try {
    const config = getConfig();

    // Check if guardrail is configured
    if (!config.bedrock.guardrailId || !config.bedrock.guardrailVersion) {
      console.log("⚠️ Guardrail not configured, skipping validation");
      return null;
    }

    console.log("🛡️ Applying guardrail validation...");

    // Initialize Bedrock Runtime client
    const client = new BedrockRuntimeClient({
      region: config.bedrock.region,
      credentials: {
        accessKeyId: config.aws.accessKeyId,
        secretAccessKey: config.aws.secretAccessKey,
      },
    });

    // First, validate the INPUT (user query)
    console.log("🛡️ Validating INPUT (user query)...");
    const inputCommand = new ApplyGuardrailCommand({
      guardrailIdentifier: config.bedrock.guardrailId,
      guardrailVersion: config.bedrock.guardrailVersion,
      source: "INPUT" as const,
      content: [
        {
          text: {
            text: originalPrompt,
          },
        },
      ] as any[], // eslint-disable-line @typescript-eslint/no-explicit-any -- AWS SDK type constraints
    });

    const inputResponse = await client.send(inputCommand);
    console.log("🛡️ INPUT validation response:", inputResponse);
    console.log("🛡️ INPUT validation response:", inputResponse.assessments);
    console.log("🛡️ INPUT validation response:", inputResponse.assessments?.[0]?.contentPolicy);

    // Then, validate the OUTPUT (generated response with contextual grounding)
    console.log("🛡️ Validating OUTPUT (generated response)...");

    // For contextual grounding policy, everything goes in the content array with different qualifiers
    // Build the content array with query, guard_content, and grounding_source items
    const contentItems = [
      // The user query
      {
        text: {
          text: originalPrompt,
          qualifiers: ["query"],
        },
      },
      // The content to be guarded (the generated response)
      {
        text: {
          text: generatedReply,
          qualifiers: ["guard_content"],
        },
      },
    ];

    // Add grounding sources from evidence
    const groundingSources = evidence
      .filter(result => result.success && result.response)
      .map(result => ({
        text: {
          text: result.response!,
          qualifiers: ["grounding_source"],
        },
      }));

    contentItems.push(...groundingSources);
    console.log("🛡️ Content items:", contentItems);

    // Prepare the command for contextual grounding evaluation
    const outputCommand = new ApplyGuardrailCommand({
      guardrailIdentifier: config.bedrock.guardrailId,
      guardrailVersion: config.bedrock.guardrailVersion,
      source: "OUTPUT" as const,
      content: contentItems as any[], // eslint-disable-line @typescript-eslint/no-explicit-any -- AWS SDK type constraints
    });

    console.log(`🛡️ Validating response with ${groundingSources.length} grounding sources`);

    // Execute the guardrail check
    const response = await client.send(outputCommand);
    console.log("🛡️ OUTPUT validation response:", response);

    console.log("🛡️ Guardrail validation completed");
    console.log("📊 Guardrail Assessment Results:");
    console.log("=".repeat(50));

    // Log INPUT validation results
    if (inputResponse.assessments?.[0]) {
      console.log("📥 INPUT Validation Results:");
      logAssessmentDetails(inputResponse.assessments[0], inputResponse.usage);
    }

    // Log OUTPUT validation results
    if (response.assessments?.[0]) {
      console.log("📤 OUTPUT Validation Results:");
      logAssessmentDetails(response.assessments[0], response.usage);
    }

    // Log combined usage information
    console.log("📈 Combined Usage:");
    if (inputResponse.usage) {
      console.log("  - INPUT usage:", inputResponse.usage);
    }
    if (response.usage) {
      console.log("  - OUTPUT usage:", response.usage);
    }

    console.log("=".repeat(50));

    return {
      input: {
        contentPolicy: inputResponse.assessments?.[0]?.contentPolicy,
      },
      output: {
        contentPolicy: response.assessments?.[0]?.contentPolicy,
        contextualGroundingPolicy: response.assessments?.[0]?.contextualGroundingPolicy,
      },
    };
  } catch (error) {
    console.error("❌ Guardrail validation error:", error);

    // Log detailed error information
    if (error && typeof error === "object") {
      const awsError = error as Record<string, unknown>;
      console.log("Error details:");
      console.log("- Name:", awsError.name);
      console.log("- Message:", awsError.message);
      console.log("- Code:", (awsError.$metadata as Record<string, unknown>)?.httpStatusCode);
    }

    return null;
  }
}

/**
 * Helper function to log assessment details in a readable format
 *
 * @param assessment - The guardrail assessment object to log
 * @param usage - Usage statistics from the guardrail service
 */
function logAssessmentDetails(assessment: unknown, usage?: unknown) {
  const assessmentObj = assessment as Record<string, unknown>;

  // Invocation Metrics
  if (assessmentObj.invocationMetrics && Array.isArray(assessmentObj.invocationMetrics)) {
    console.log("  📊 Invocation Metrics:");
    assessmentObj.invocationMetrics.forEach((metrics: unknown, index: number) => {
      console.log(`    - Metric set ${index + 1}:`);
      const metricsObj = metrics as Record<string, unknown>;
      for (const [key, value] of Object.entries(metricsObj)) {
        console.log(`      - ${key}: ${JSON.stringify(value)}`);
      }
    });
  }

  // Content Policy Assessment
  const usageObj = usage as Record<string, unknown>;
  const contentPolicyUnits = (usageObj?.contentPolicyUnits as number) || 0;
  console.log("  📋 Content Policy:");
  if (assessmentObj.contentPolicy) {
    const contentPolicy = assessmentObj.contentPolicy as Record<string, unknown>;
    if (
      contentPolicy.filters &&
      Array.isArray(contentPolicy.filters) &&
      contentPolicy.filters.length > 0
    ) {
      contentPolicy.filters.forEach((filter: unknown) => {
        const filterObj = filter as Record<string, unknown>;
        const action = filterObj.action || "NONE";
        const confidence = filterObj.confidence || "NONE";
        const type = filterObj.type || "UNKNOWN";
        const filterStrength = filterObj.filterStrength || "N/A";
        const detected = filterObj.detected || false;
        console.log(
          `    - ${type}: ${action} (Confidence: ${confidence}, Strength: ${filterStrength}, Detected: ${detected})`,
        );
      });
    } else {
      console.log("    - No content policy violations detected");
    }
  } else if (contentPolicyUnits > 0) {
    console.log("    - Content policy evaluated - no violations detected");
  } else {
    console.log("    - Not evaluated");
  }

  // Topic Policy Assessment
  if (assessmentObj.topicPolicy) {
    console.log("  📝 Topic Policy:");
    const topicPolicy = assessmentObj.topicPolicy as Record<string, unknown>;
    if (topicPolicy.topics && Array.isArray(topicPolicy.topics)) {
      topicPolicy.topics.forEach((topic: unknown) => {
        const topicObj = topic as Record<string, unknown>;
        const action = topicObj.action || "NONE";
        const name = topicObj.name || "Unknown";
        const type = topicObj.type || "CUSTOM";
        console.log(`    - Topic "${name}" (${type}): ${action}`);
      });
    }
  }

  // Word Policy Assessment
  if (assessmentObj.wordPolicy) {
    console.log("  🔤 Word Policy:");
    const wordPolicy = assessmentObj.wordPolicy as Record<string, unknown>;
    if (wordPolicy.customWords && Array.isArray(wordPolicy.customWords)) {
      wordPolicy.customWords.forEach((word: unknown) => {
        const wordObj = word as Record<string, unknown>;
        const action = wordObj.action || "NONE";
        const match = wordObj.match || "Unknown";
        console.log(`    - Word "${match}": ${action}`);
      });
    }
    if (wordPolicy.managedWordLists && Array.isArray(wordPolicy.managedWordLists)) {
      wordPolicy.managedWordLists.forEach((list: unknown) => {
        const listObj = list as Record<string, unknown>;
        const action = listObj.action || "NONE";
        const type = listObj.type || "Unknown";
        console.log(`    - Managed list ${type}: ${action}`);
      });
    }
  }

  // Sensitive Information Policy Assessment
  if (assessmentObj.sensitiveInformationPolicy) {
    console.log("  🔒 Sensitive Information Policy:");
    const sensitivePolicy = assessmentObj.sensitiveInformationPolicy as Record<string, unknown>;
    if (sensitivePolicy.piiEntities && Array.isArray(sensitivePolicy.piiEntities)) {
      sensitivePolicy.piiEntities.forEach((entity: unknown) => {
        const entityObj = entity as Record<string, unknown>;
        const action = entityObj.action || "NONE";
        const type = entityObj.type || "Unknown";
        const match = entityObj.match || "Unknown";
        console.log(`    - PII ${type} "${match}": ${action}`);
      });
    }
    if (sensitivePolicy.regexes && Array.isArray(sensitivePolicy.regexes)) {
      sensitivePolicy.regexes.forEach((regex: unknown) => {
        const regexObj = regex as Record<string, unknown>;
        const action = regexObj.action || "NONE";
        const name = regexObj.name || "Unknown";
        const match = regexObj.match || "Unknown";
        console.log(`    - Regex "${name}" matched "${match}": ${action}`);
      });
    }
  }

  // Contextual Grounding Policy Assessment (most important for our use case)
  if (assessmentObj.contextualGroundingPolicy) {
    console.log("  🎯 Contextual Grounding Policy:");
    const groundingPolicy = assessmentObj.contextualGroundingPolicy as Record<string, unknown>;
    if (groundingPolicy.filters && Array.isArray(groundingPolicy.filters)) {
      groundingPolicy.filters.forEach((filter: unknown) => {
        const filterObj = filter as Record<string, unknown>;
        const action = filterObj.action || "NONE";
        const type = filterObj.type || "Unknown";
        const threshold = filterObj.threshold || "N/A";
        const score = filterObj.score || "N/A";
        console.log(`    - ${type}: ${action} (Score: ${score}, Threshold: ${threshold})`);
      });
    }
  }
}
