import { NextRequest, NextResponse } from "next/server";
import { getTrialStatus } from "@/lib/trial-storage";

/**
 * POST handler for checking trial status
 *
 * @param request - The Next.js request object containing the wallet address
 * @returns Promise that resolves to a NextResponse with trial status information
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { walletAddress } = body;

    if (!walletAddress) {
      return NextResponse.json({ error: "Wallet address is required" }, { status: 400 });
    }

    const trialInfo = await getTrialStatus(walletAddress);

    return NextResponse.json({
      success: true,
      trialInfo,
      message: `${trialInfo.remainingTrials} of ${trialInfo.totalTrials} free trials remaining`,
    });
  } catch (error: unknown) {
    console.error("Error checking trial status:", error);

    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    return NextResponse.json(
      {
        error: "Failed to check trial status",
        message: errorMessage,
      },
      { status: 500 },
    );
  }
}
