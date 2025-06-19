import { NextRequest, NextResponse } from 'next/server';
import { unsubscribeUserEmail, isEmailUnsubscribed } from '../../../lib/redis-email';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = body;

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

    // Check if email is already unsubscribed
    const alreadyUnsubscribed = await isEmailUnsubscribed(email);
    if (alreadyUnsubscribed) {
      return NextResponse.json(
        { message: 'Email is already unsubscribed', alreadyUnsubscribed: true },
        { status: 200 }
      );
    }

    // Unsubscribe email from Redis
    const success = await unsubscribeUserEmail(email);

    if (success) {
      return NextResponse.json(
        { message: 'Successfully unsubscribed from newsletter' },
        { status: 200 }
      );
    } else {
      return NextResponse.json(
        { error: 'Email not found in subscription list' },
        { status: 404 }
      );
    }

  } catch (error) {
    console.error('Error in unsubscribe API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Handle GET requests for unsubscribe links (e.g., from emails)
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const email = url.searchParams.get('email');

    if (!email) {
      return NextResponse.json(
        { error: 'Email parameter is required' },
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

    // Unsubscribe email
    const success = await unsubscribeUserEmail(email);

    if (success) {
      // Return HTML page for successful unsubscribe
      return new NextResponse(
        `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Unsubscribed - TrueCast News</title>
          <style>
            body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; text-align: center; }
            .success { color: #22c55e; }
            .container { background: #f9fafb; padding: 40px; border-radius: 10px; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1 class="success">✅ Successfully Unsubscribed</h1>
            <p>You have been unsubscribed from TrueCast News newsletter.</p>
            <p>Email: <strong>${email}</strong></p>
            <p>You will no longer receive newsletter emails from us.</p>
            <p><a href="/">← Back to TrueCast News</a></p>
          </div>
        </body>
        </html>
        `,
        {
          status: 200,
          headers: {
            'Content-Type': 'text/html',
          },
        }
      );
    } else {
      return new NextResponse(
        `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Unsubscribe Error - TrueCast News</title>
          <style>
            body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; text-align: center; }
            .error { color: #ef4444; }
            .container { background: #f9fafb; padding: 40px; border-radius: 10px; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1 class="error">❌ Unsubscribe Error</h1>
            <p>Email not found in our subscription list or already unsubscribed.</p>
            <p>Email: <strong>${email}</strong></p>
            <p><a href="/">← Back to TrueCast News</a></p>
          </div>
        </body>
        </html>
        `,
        {
          status: 404,
          headers: {
            'Content-Type': 'text/html',
          },
        }
      );
    }

  } catch (error) {
    console.error('Error in unsubscribe GET API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 