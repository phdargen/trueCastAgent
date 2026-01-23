import { NextResponse } from "next/server";

/**
 * GET handler for Content API - Returns a welcome message
 *
 * @returns JSON response with welcome message
 */
export async function GET() {
  return NextResponse.json({
    message: "Welcome!",
  });
}
