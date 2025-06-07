import { NextRequest, NextResponse } from "next/server";

/**
 * GET handler for TrueCast API
 *
 * @param request - The incoming request
 * @returns JSON response with premium data
 */
export async function GET(request: NextRequest) {
  // This route is protected by the x402-next middleware
  // If we reach this point, payment has been verified

  // Get text message from query parameters
  const { searchParams } = new URL(request.url);
  const textMessage = searchParams.get("message") || "";

  const premiumData = {
    message: textMessage
      ? `Welcome to premium content! Your message: "${textMessage}"`
      : "Welcome to premium content!",
    data: {
      secretKey: "premium-api-key-12345",
      features: [
        "Advanced analytics",
        "Priority support",
        "Extended rate limits",
        "Beta features access",
      ],
      timestamp: new Date().toISOString(),
      userLevel: "premium",
      userMessage: textMessage,
    },
    metadata: {
      paymentVerified: true,
      apiVersion: "v1.0.0",
    },
  };

  return NextResponse.json(premiumData);
}

/**
 * POST handler for TrueCast API
 *
 * @param request - The incoming request
 * @returns JSON response with processed data
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const textMessage = body.message || body.text || "";

    // Example of a premium operation
    const result = {
      message: textMessage
        ? `Premium operation completed with your message: "${textMessage}"`
        : "Premium operation completed",
      processedData: {
        input: body,
        userMessage: textMessage,
        processed: true,
        premiumFeatures: ["encryption", "validation", "priority_queue"],
        timestamp: new Date().toISOString(),
      },
    };

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
}
