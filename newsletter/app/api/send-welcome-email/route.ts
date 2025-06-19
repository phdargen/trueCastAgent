import nodemailer from "nodemailer";

// Create email transporter
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER || "safeguardianagent@gmail.com",
    pass: process.env.EMAIL_PASS || "", // Use environment variable for password
  },
});

export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (!email) {
      return Response.json({ error: "Email is required" }, { status: 400 });
    }

    const mailOptions = {
      from: process.env.EMAIL_USER || "safeguardianagent@gmail.com",
      to: email,
      subject: "Welcome to TrueCast!",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #2563eb; text-align: center;">Welcome to TrueCast News!</h1>
          <p style="text-align: center; color: #666; font-size: 16px; margin-bottom: 30px;">
            Breaking news powered by prediction markets
          </p>
          <p>Check out our products:</p>
          <ul>
            <li>TrueCast Mini App: <a href="https://farcaster.xyz/miniapps/Q6UcdjB0Hkmc/truecast" style="color: #2563eb;">https://farcaster.xyz/miniapps/Q6UcdjB0Hkmc/truecast</a></li>
            <li>TrueCast API: <a href="https://true-cast-agent.vercel.app/" style="color: #2563eb;">https://true-cast-agent.vercel.app/</a></li>
          </ul>
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
          <p style="color: #999; font-size: 12px; text-align: center;">
            You received this email because you subscribed to TrueCast News newsletter.<br>
            If you no longer wish to receive these emails, you can 
            <a href="${process.env.NEXT_PUBLIC_URL || 'http://localhost:3000'}/api/unsubscribe?email=${encodeURIComponent(email)}" 
               style="color: #666; text-decoration: underline;">unsubscribe here</a>.
          </p>
        </div>
      `,
      text: `
        Welcome to TrueCast!
        
        Breaking news powered by prediction markets

        Check out our products:
        - TrueCast Mini App: https://farcaster.xyz/miniapps/Q6UcdjB0Hkmc/truecast
        - TrueCast API: https://true-cast-agent.vercel.app/
                
        ---
        You received this email because you subscribed to TrueCast News newsletter.
        If you no longer wish to receive these emails, you can unsubscribe here: 
        ${process.env.NEXT_PUBLIC_URL || 'http://localhost:3000'}/api/unsubscribe?email=${encodeURIComponent(email)}
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log("Welcome email sent successfully to:", email);
    
    return Response.json({ 
      success: true, 
      message: "Welcome email sent successfully" 
    });

  } catch (error) {
    console.error("Error sending welcome email:", error);
    return Response.json({ 
      error: "Failed to send welcome email" 
    }, { status: 500 });
  }
} 