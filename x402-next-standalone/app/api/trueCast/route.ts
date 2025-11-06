import { NextRequest, NextResponse } from "next/server";
import { processPrompt } from "@/lib/trueCastEngine";
import { redis } from "@/lib/redis";

/**
 * POST handler for TrueCast API - Main truth verification endpoint
 *
 * @param request - The incoming request
 * @returns JSON response with fact-check results
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const prompt = body.prompt || body.message || body.text || "";
    const castHash = body.castHash || "";
    const storeToPinata = body.storeToPinata === true; // Default to false
    const runGuardrail = body.runGuardrail === true; // Default to false

    if (!prompt.trim()) {
      return NextResponse.json(
        {
          error: "Input prompt is required. Please provide a 'prompt' field in your request body.",
        },
        { status: 400 },
      );
    }

    // Check for x-payment header to determine if request is paid
    const paymentHeader = request.headers.get("x-payment");
    let buyerAddress = "anonymous";
    
    if (paymentHeader) {
      try {
        // Try to extract address from payment header
        // The x-payment header contains base64 encoded payment data
        const decodedHeader = Buffer.from(paymentHeader, "base64").toString("utf-8");
        const paymentData = JSON.parse(decodedHeader);
        
        // Extract buyer address from various possible locations in the payment structure
        buyerAddress = 
          paymentData?.payload?.authorization?.from ||
          paymentData?.authorization?.from ||
          paymentData?.from ||
          "paid-user";
          
        console.log("TrueCast request from buyer:", buyerAddress);
      } catch (error) {
        console.warn("Failed to decode payment header, marking as paid-user:", error);
        buyerAddress = "paid-user";
      }
    }

    // Process the prompt through the TrueCast engine
    const result = await processPrompt(
      prompt.trim(),
      castHash.trim() || undefined,
      storeToPinata,
      runGuardrail,
    );

    // Save response to Redis with buyer address and timestamp
    if (redis) {
      const redisKey = "truecast:responses";
      const timestamp = new Date().toISOString();
      const humanReadableTimestamp = new Date().toLocaleString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        timeZoneName: "short",
      });

      const redisEntry = {
        buyerAddress: buyerAddress || "anonymous",
        timestamp,
        humanReadableTimestamp,
        response: result,
      };

      try {
        // Use lpush to add newest responses to the beginning
        await redis.lpush(redisKey, JSON.stringify(redisEntry));
        console.log(`✅ Response saved to Redis for ${buyerAddress || "anonymous"}`);
      } catch (error) {
        console.error("Failed to save response to Redis:", error);
      }
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("TrueCast API Error:", error);

    return NextResponse.json(
      {
        error: "An internal server error occurred while processing your request.",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

/**
 * GET handler for TrueCast API - Returns 405 Method Not Allowed
 *
 * @returns 405 Method Not Allowed
 */
export async function GET() {
  return NextResponse.json(
    { error: "Method Not Allowed. Use POST /api/truecast." },
    { status: 405 },
  );
}
