import { NextRequest, NextResponse } from 'next/server';
import { saveUserEmail, emailExists } from '../../../lib/redis-email';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, fid } = body;

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    // Check if email already exists
    const exists = await emailExists(email);
    if (exists) {
      return NextResponse.json(
        { message: 'Email already registered', alreadyExists: true },
        { status: 200 }
      );
    }

    // Save email to Redis
    await saveUserEmail(email, fid);

    return NextResponse.json(
      { message: 'Email saved successfully' },
      { status: 200 }
    );

  } catch (error) {
    console.error('Error in save-email API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 