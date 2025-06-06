# Neynar Webhook Handler for Vercel

This is a serverless function that handles Neynar webhook events for bot mentions, deployed on Vercel.

## Deployment Steps

1. **Install Vercel CLI** (if not already installed):
   ```bash
   npm i -g vercel
   ```

2. **Navigate to this directory**:
   ```bash
   cd neynar-webhook
   ```

3. **Deploy to Vercel**:
   ```bash
   vercel
   ```
   
   Follow the prompts:
   - Link to existing project? → No
   - What's your project's name? → `neynar-webhook-handler` (or your preferred name)
   - In which directory is your code located? → `./` (current directory)

4. **Get your webhook URL**:
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

## Customization

Edit `api/webhook.js` to add your bot logic:
- Process mentions
- Reply to casts
- Store data in databases
- Send notifications
- Integrate with other services

## Important Notes

- The function always returns a 200 status to prevent webhook retries
- As recommended by Neynar docs, avoid using ngrok or similar tunneling services
- Use your own domain or Vercel's provided URLs for reliable webhook delivery 