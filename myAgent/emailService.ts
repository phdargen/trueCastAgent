import * as dotenv from "dotenv";
dotenv.config();

import nodemailer from 'nodemailer';
import { redis } from './redisClient';
import { ProcessedNewsworthyEvent } from './types';

// Settings
const DISABLE_EMAILS = process.env.DISABLE_EMAILS === 'true';
const notificationServiceKey = process.env.NEXT_PUBLIC_ONCHAINKIT_PROJECT_NAME ?? "trueCast";

// Email transporter configuration
const createEmailTransporter = () => {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER || "safeguardianagent@gmail.com",
      pass: process.env.EMAIL_PASS || "",
    },
  });
};

/**
 * Get subscribed email addresses from Redis
 */
async function getSubscribedEmails(): Promise<string[]> {
  if (!redis) {
    console.error("Redis client not available");
    return [];
  }

  try {
    const uniqueEmailsKey = `${notificationServiceKey}:emails:unique`;
    const emails = await redis.smembers(uniqueEmailsKey);
    console.log(`Found ${emails.length} subscribed emails`);
    return emails;
  } catch (error) {
    console.error("Error fetching subscribed emails:", error);
    return [];
  }
}

/**
 * Send news email to subscribers
 */
async function sendNewsEmail(event: ProcessedNewsworthyEvent, zoraUrl: string): Promise<void> {
  if (DISABLE_EMAILS) {
    console.log("Email sending is disabled. Would have sent email:");
    console.log(`- Subject: ${event.headline}`);
    console.log(`- Body: ${event.newsDescription}`);
    console.log(`- Zora URL: ${zoraUrl}`);
    return;
  }

  try {
    const emails = await getSubscribedEmails();
    if (emails.length === 0) {
      console.log("No subscribed emails found");
      return;
    }

    const transporter = createEmailTransporter();
    const subject = event.headline || event.marketQuestion;
    const newsText = event.newsDescription || event.marketQuestion;

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #2563eb; text-align: center;">TrueCast News Update</h1>
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p style="font-size: 16px; line-height: 1.6; margin: 0;">${newsText}</p>
        </div>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${zoraUrl}" 
             style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            View on Zora
          </a>
        </div>
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
        <p style="color: #999; font-size: 12px; text-align: center;">
          You received this email because you subscribed to TrueCast News newsletter.<br>
          If you no longer wish to receive these emails, you can 
          <a href="${process.env.NEXT_PUBLIC_URL || 'http://localhost:3000'}/api/unsubscribe?email={{EMAIL}}" 
             style="color: #666; text-decoration: underline;">unsubscribe here</a>.
        </p>
      </div>
    `;

    const textContent = `
      TrueCast News Update
      
      ${newsText}
      
      View on Zora: ${zoraUrl}
      
      ---
      You received this email because you subscribed to TrueCast News newsletter.
      If you no longer wish to receive these emails, you can unsubscribe here: 
      ${process.env.NEXT_PUBLIC_URL || 'http://localhost:3000'}/api/unsubscribe?email={{EMAIL}}
    `;

    // Send emails in batches to avoid overwhelming the email service
    const batchSize = 50;
    for (let i = 0; i < emails.length; i += batchSize) {
      const batch = emails.slice(i, i + batchSize);
      const emailPromises = batch.map(async (email) => {
        try {
          const personalizedHtml = htmlContent.replace('{{EMAIL}}', encodeURIComponent(email));
          const personalizedText = textContent.replace('{{EMAIL}}', encodeURIComponent(email));

          await transporter.sendMail({
            from: process.env.EMAIL_USER || "safeguardianagent@gmail.com",
            to: email,
            subject: subject,
            html: personalizedHtml,
            text: personalizedText,
          });
          
          console.log(`Email sent successfully to: ${email}`);
        } catch (error) {
          console.error(`Failed to send email to ${email}:`, error);
        }
      });

      await Promise.all(emailPromises);
      
      // Add a small delay between batches
      if (i + batchSize < emails.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log(`Finished sending emails to ${emails.length} subscribers`);
  } catch (error) {
    console.error("Error sending news emails:", error);
  }
}

export { sendNewsEmail }; 