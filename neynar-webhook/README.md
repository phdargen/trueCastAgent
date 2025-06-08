# Neynar Webhook Handler with TrueCast Integration

This is a serverless function that handles Neynar webhook events and automatically calls a protected TrueCast API using CDP wallet payments, deployed on Vercel.

## Features

- Receives Neynar webhook events for cast.created
- Automatically creates CDP smart account for payments
- Calls protected x402 TrueCast API with automatic payment handling
- Handles payment authentication using viem and x402-axios

## Prerequisites

1. CDP API credentials (API Key ID, Secret, and Wallet Secret)
2. A deployed x402-next-standalone TrueCast API
3. Vercel account for deployment

## Deployment Steps

1. **Install dependencies**:
   ```bash
   cd neynar-webhook
   npm install
   ```

2. **Install Vercel CLI** (if not already installed):
   ```bash
   npm i -g vercel
   ```

3. **Deploy to Vercel**:
   ```bash
   vercel
   ```
   
   Follow the prompts:
   - Link to existing project? → No
   - What's your project's name? → `neynar-webhook-handler` (or your preferred name)
   - In which directory is your code located? → `./` (current directory)

4. **Set Environment Variables**:
   See `env-variables.md` for required environment variables that must be set in your Vercel project settings.

5. **Get your webhook URL**:
   After deployment, Vercel will provide you with a URL like:
   `https://your-project-name.vercel.app/api/webhook`

## Configure Neynar Webhook

1. Go to the [Neynar Developer Dashboard](https://dev.neynar.com/)
2. Navigate to the Webhooks tab
3. Create a new webhook with:
   - **Target URL**: `https://your-project-name.vercel.app/api/webhook`
   - **Event Type**: `cast.created`
   - **Filters**:
     - `mentioned_fids`: Add your bot's FID (to get notified when tagged)
     - `parent_author_fids`: Add your bot's FID (to get notified when someone replies)

## Testing

You can test locally by running:
```bash
vercel dev
```

This will start a local development server at `http://localhost:3000`

## Monitoring

- View logs in the Vercel dashboard
- Check the Functions tab to see invocations and errors
- Use `console.log` statements in your webhook handler to debug

## How It Works

1. **Webhook Receipt**: Receives `cast.created` events from Neynar
2. **CDP Wallet Creation**: Automatically creates or retrieves a CDP smart account
3. **Payment Processing**: Uses x402-axios to handle payment authentication
4. **API Call**: Calls the protected TrueCast API with the cast data
5. **Response Handling**: Logs the response and returns success/error status

## Customization

The webhook automatically processes all `cast.created` events. You can modify `api/webhook.js` to:
- Add filtering logic for specific mentions or keywords
- Process additional webhook event types
- Add custom response handling
- Integrate with other services after successful API calls

## Important Notes

- The function always returns a 200 status to prevent webhook retries
- As recommended by Neynar docs, avoid using ngrok or similar tunneling services
- Use your own domain or Vercel's provided URLs for reliable webhook delivery 