#!/usr/bin/env ts-node

/**
 * Standalone script to retroactively add payToken information to existing markets
 * Run this script to update markets that were stored before payToken info was added
 */

import * as dotenv from "dotenv";
dotenv.config();

import { addPayTokenToExistingMarkets } from "./updateMarkets";

async function main() {
  console.log("=".repeat(60));
  console.log("Starting Retroactive PayToken Update Script");
  console.log("=".repeat(60));
  
  try {
    await addPayTokenToExistingMarkets();
    console.log("\n" + "=".repeat(60));
    console.log("Retroactive PayToken Update Completed Successfully");
    console.log("=".repeat(60));
    process.exit(0);
  } catch (error) {
    console.error("\n" + "=".repeat(60));
    console.error("Retroactive PayToken Update Failed:", error);
    console.error("=".repeat(60));
    process.exit(1);
  }
}

// Run the script if executed directly
if (require.main === module) {
  main();
}
