// Load environment variables from .env file
import "dotenv/config";

import { processPrompt } from "./lib/trueCastEngine.js";

/**
 * Tests the TrueCast engine with different types of prompts to verify functionality
 */
async function testDifferentPrompts() {
  const testCases = [
    {
      name: "Greeting",
      prompt: "Hi there!",
    },
    {
      name: "General Question",
      prompt: "What is the capital of France?",
    },
    {
      name: "Fact Check",
      prompt: "Is the Earth flat?",
    },
    {
      name: "Current Events",
      prompt: "What is the current sentiment about Bitcoin?",
    },
    // {
    //   name: 'Future Prediction',
    //   prompt: 'Will Tesla stock go up next month?',
    // },
  ];

  for (const testCase of testCases) {
    console.log(`\n${"=".repeat(50)}`);
    console.log(`Testing: ${testCase.name}`);
    console.log(`Prompt: "${testCase.prompt}"`);
    console.log(`${"=".repeat(50)}`);

    try {
      const result = await processPrompt(testCase.prompt);

      console.log("\n📊 Result:", JSON.stringify(result, null, 2));
    } catch (error) {
      console.error(`❌ Error testing "${testCase.name}":`, error);

      // Show configuration issues if they exist
      if (error instanceof Error && error.message.includes("Configuration validation failed")) {
        console.log("\n💡 Tip: Make sure to set up your environment variables:");
        console.log("   OPENAI_API_KEY=your_key_here");
        console.log("   DATASOURCE_PERPLEXITY_ENABLED=false  (to disable if no key)");
        console.log("   DATASOURCE_X_TWITTER_ENABLED=false   (to disable if no key)");
      }
    }

    // Wait a bit between tests to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

console.log("🚀 Testing TrueCast Components Directly...\n");
testDifferentPrompts()
  .then(() => {
    console.log("\n✅ All tests completed!");
  })
  .catch(error => {
    console.error("❌ Test suite failed:", error);
  });
