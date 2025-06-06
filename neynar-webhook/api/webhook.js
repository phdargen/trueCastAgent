export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const webhookData = req.body;
    
    // Log the webhook event (you can process this data as needed)
    console.log('Received webhook event:', JSON.stringify(webhookData, null, 2));
    
    // Check if this is a cast.created event with a mention
    if (webhookData.type === 'cast.created') {
      const cast = webhookData.data;
      console.log(`New cast from @${cast.author.username}: ${cast.text}`);
      
      // Add your bot logic here
      // For example, you might want to:
      // - Process the mention
      // - Reply to the cast
      // - Store the data in a database
      // - Send notifications
      
      // Example: Check if bot was mentioned
      if (cast.text.includes('@your-bot-username')) {
        console.log('Bot was mentioned!');
        // Handle the mention here
      }
    }
    
    // Always return 200 to acknowledge receipt
    return res.status(200).json({ message: 'Webhook received successfully' });
    
  } catch (error) {
    console.error('Error processing webhook:', error);
    // Still return 200 to prevent webhook retries
    return res.status(200).json({ error: 'Error processing webhook' });
  }
} 