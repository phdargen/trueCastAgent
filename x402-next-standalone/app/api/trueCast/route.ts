import { NextRequest, NextResponse } from "next/server";
import { processPrompt } from "@/lib/trueCastEngine";

/**
 * GET handler for TrueCast API - Endpoint for basic info
 *
 * @param _ - The incoming request
 * @returns JSON response with service information
 */
export async function GET(_: NextRequest) {
  // This route is protected by the x402-next middleware
  // If we reach this point, payment has been verified

  const serviceInfo = {
    service: "TrueCast Truth Oracle API",
    description: "AI-powered fact-checking and truth verification service",
    version: "v1.0.0",
    endpoints: {
      verify: "POST /api/trueCast",
    },
    usage: {
      method: "POST",
      body: {
        prompt: "Your fact-checking query or claim to verify",
        castHash: "(optional) Farcaster cast hash for context-specific data sources",
      },
    },
    timestamp: new Date().toISOString(),
  };

  return NextResponse.json(serviceInfo);
}

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

    if (!prompt.trim()) {
      return NextResponse.json(
        {
          error: "Input prompt is required. Please provide a 'prompt' field in your request body.",
        },
        { status: 400 },
      );
    }

    // Process the prompt through the TrueCast engine
    const result = await processPrompt(prompt.trim(), castHash.trim() || undefined);

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
