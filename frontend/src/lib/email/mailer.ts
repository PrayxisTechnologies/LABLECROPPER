/**
 * High-Speed Mailer Service for LabelFlow
 * Optimized for ultra-fast OTP dispatch via GoDaddy Webmail (smtpout.secureserver.net).
 * Uses fast timeouts, dynamic port caching (Port 587 / Port 465), and O365 fallback.
 */

import nodemailer, { Transporter } from "nodemailer";

export type OtpType = "SIGNUP" | "LOGIN" | "RESET_PASSWORD";

export interface SendOtpParams {
  email: string;
  otp: string;
  type: OtpType;
  name?: string;
}

export interface SendOtpResult {
  success: boolean;
  messageId?: string;
  strategyUsed?: string;
  error?: string;
}

// Fast timeouts for instant failure detection & fallback (milliseconds)
const CONNECT_TIMEOUT = 4500; // 4.5s max connection wait
const GREETING_TIMEOUT = 3500; // 3.5s max greeting wait
const SOCKET_TIMEOUT = 7000; // 7s max socket wait

// Memory cache of fastest working port (Port 587 STARTTLS is generally fastest on Indian ISPs)
let preferredPort: 587 | 465 = 587;

function getSmtpConfig() {
  const host = process.env.SMTP_HOST || "smtpout.secureserver.net";
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const user = process.env.SMTP_USER || "info@prayxis.in";
  const pass = (process.env.SMTP_PASS || "Prayxis@1234asdfG").trim();
  const from = process.env.EMAIL_FROM || '"LabelFlow" <info@prayxis.in>';
  const expiry = parseInt(process.env.OTP_EXPIRY_MINUTES || "10", 10);
  return { host, port, user, pass, from, expiry };
}

/**
 * Creates dedicated transporter for a specific port with optimized fast timeouts
 */
function createTransporter(port: 587 | 465, cfg: ReturnType<typeof getSmtpConfig>): Transporter {
  const isSecure = port === 465;
  return nodemailer.createTransport({
    host: cfg.host,
    port,
    secure: isSecure,
    requireTLS: !isSecure,
    auth: {
      user: cfg.user,
      pass: cfg.pass,
    },
    tls: {
      rejectUnauthorized: false,
    },
    connectionTimeout: CONNECT_TIMEOUT,
    greetingTimeout: GREETING_TIMEOUT,
    socketTimeout: SOCKET_TIMEOUT,
  });
}

/**
 * Generates dark-themed responsive HTML email template for OTP
 */
function renderOtpEmailHtml(params: {
  otp: string;
  type: OtpType;
  name?: string;
  expiryMinutes: number;
}): string {
  const { otp, type, name, expiryMinutes } = params;

  let title = "Verify Your Email Address";
  let subtitle = "Complete your LabelFlow seller account registration";
  let actionDescription =
    "Thank you for joining LabelFlow. Please use the 6-digit verification code below to verify your email address and activate your personal SKU database:";

  if (type === "RESET_PASSWORD") {
    title = "Reset Your Password";
    subtitle = "Secure password reset request for your seller account";
    actionDescription =
      "We received a request to reset your LabelFlow account password. Please enter the following 6-digit one-time password (OTP) to continue:";
  } else if (type === "LOGIN") {
    title = "Confirm Sign-In Request";
    subtitle = "Two-step identity verification";
    actionDescription =
      "Please enter the 6-digit verification code below to authorize your session and access your LabelFlow dashboard:";
  }

  const recipientGreeting = name ? `Hello ${name},` : "Hello Seller,";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - LabelFlow</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #070D18;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #E2E8F0;
      -webkit-font-smoothing: antialiased;
    }
    .wrapper {
      width: 100%;
      background-color: #070D18;
      padding: 40px 15px;
    }
    .container {
      max-width: 540px;
      margin: 0 auto;
      background-color: #0C182B;
      border: 1px solid rgba(0, 209, 255, 0.25);
      border-radius: 18px;
      overflow: hidden;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.6);
    }
    .header {
      background: linear-gradient(135deg, rgba(0, 209, 255, 0.12) 0%, rgba(139, 92, 246, 0.15) 100%);
      padding: 30px 24px 24px 24px;
      text-align: center;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }
    .logo-badge {
      display: inline-block;
      padding: 7px 16px;
      background-color: rgba(0, 209, 255, 0.15);
      border: 1px solid rgba(0, 209, 255, 0.4);
      border-radius: 24px;
      font-size: 13px;
      font-weight: 700;
      color: #00D1FF;
      letter-spacing: 0.5px;
      margin-bottom: 12px;
    }
    .title {
      margin: 0;
      font-size: 22px;
      font-weight: 800;
      color: #FFFFFF;
      letter-spacing: -0.3px;
    }
    .subtitle {
      margin: 6px 0 0 0;
      font-size: 13px;
      color: #94A3B8;
    }
    .content {
      padding: 32px 28px;
    }
    .greeting {
      font-size: 15px;
      font-weight: 600;
      color: #F8FAFC;
      margin-bottom: 14px;
    }
    .text {
      font-size: 13px;
      line-height: 1.6;
      color: #CBD5E1;
      margin-bottom: 24px;
    }
    .otp-box {
      background: linear-gradient(180deg, #050A14 0%, #0A1424 100%);
      border: 1.5px solid #00D1FF;
      border-radius: 14px;
      padding: 22px 16px;
      text-align: center;
      margin: 24px 0;
      box-shadow: 0 0 25px rgba(0, 209, 255, 0.18);
    }
    .otp-label {
      font-size: 10px;
      text-transform: uppercase;
      font-weight: 700;
      color: #94A3B8;
      letter-spacing: 1.5px;
      margin-bottom: 8px;
    }
    .otp-code {
      font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace;
      font-size: 36px;
      font-weight: 800;
      color: #00D1FF;
      letter-spacing: 12px;
      padding-left: 12px;
      margin: 0;
      text-shadow: 0 0 16px rgba(0, 209, 255, 0.4);
    }
    .warning-box {
      background-color: rgba(245, 158, 11, 0.08);
      border-left: 3px solid #F59E0B;
      padding: 12px 16px;
      border-radius: 6px;
      margin-bottom: 24px;
    }
    .warning-text {
      font-size: 12px;
      line-height: 1.5;
      color: #FCD34D;
      margin: 0;
    }
    .footer {
      background-color: #050A14;
      padding: 22px 24px;
      text-align: center;
      border-top: 1px solid rgba(255, 255, 255, 0.06);
    }
    .footer-text {
      font-size: 11px;
      color: #64748B;
      line-height: 1.5;
      margin: 4px 0;
    }
    .brand-link {
      color: #00D1FF;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <div class="logo-badge">LabelFlow Security</div>
        <h1 class="title">${title}</h1>
        <p class="subtitle">${subtitle}</p>
      </div>

      <div class="content">
        <div class="greeting">${recipientGreeting}</div>
        <div class="text">${actionDescription}</div>

        <div class="otp-box">
          <div class="otp-label">One-Time Verification Code</div>
          <div class="otp-code">${otp}</div>
        </div>

        <div class="warning-box">
          <p class="warning-text">
            ⏰ <strong>Expires in ${expiryMinutes} minutes.</strong> For your security, never share this OTP with anyone. LabelFlow staff will never ask for your verification code.
          </p>
        </div>

        <div class="text" style="font-size: 12px; color: #94A3B8; margin-bottom: 0;">
          If you did not request this verification code, please ignore this email or review your account security settings.
        </div>
      </div>

      <div class="footer">
        <p class="footer-text">
          Sent by <strong>LabelFlow</strong> — Smart Shipping Label & SKU Intelligence for Meesho, Flipkart & Amazon Sellers.
        </p>
        <p class="footer-text">
          Prayxis Technologies • Web: <a href="https://lablecropper.in" class="brand-link">lablecropper.in</a>
        </p>
        <p class="footer-text" style="color: #475569; font-size: 10px; margin-top: 8px;">
          This is an automated security message. Please do not reply directly to this email.
        </p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Dispatch OTP verification email using fast-failover port selection.
 */
export async function sendOtpEmail(params: SendOtpParams): Promise<SendOtpResult> {
  const { email, otp, type, name } = params;
  const cfg = getSmtpConfig();

  if (!cfg.pass || cfg.pass === "APNA_MAILBOX_PASSWORD_YAHAN_DALEIN") {
    return {
      success: false,
      error:
        "Email delivery failed: Mailbox password is not configured in frontend/.env.local.",
    };
  }

  const subjectMap: Record<OtpType, string> = {
    SIGNUP: `Your LabelFlow Verification Code: ${otp}`,
    LOGIN: `Your LabelFlow Login Code: ${otp}`,
    RESET_PASSWORD: `Your LabelFlow Password Reset Code: ${otp}`,
  };

  const subject = subjectMap[type] || `Your Verification Code: ${otp}`;
  const htmlContent = renderOtpEmailHtml({
    otp,
    type,
    name,
    expiryMinutes: cfg.expiry,
  });

  const textContent = `Your LabelFlow verification code is: ${otp}\n\nThis code expires in ${cfg.expiry} minutes.\nFor your security, never share this code with anyone.\n\nLabelFlow Team`;
  const uniqueMsgId = `<otp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@prayxis.in>`;

  const mailOptions = {
    from: cfg.from,
    to: email,
    subject,
    text: textContent,
    html: htmlContent,
    headers: {
      "Message-ID": uniqueMsgId,
      "X-Priority": "1",
      "X-MSMail-Priority": "High",
      Importance: "high",
      Date: new Date().toUTCString(),
    },
  };

  // Determine port order: Try cached preferred port first (default: 587), then fallback port (465)
  const portsToTry: (587 | 465)[] =
    preferredPort === 587 ? [587, 465] : [465, 587];

  let lastError: string = "";

  for (const port of portsToTry) {
    try {
      const startTime = Date.now();
      const transporter = createTransporter(port, cfg);
      const info = await transporter.sendMail(mailOptions);
      const elapsed = Date.now() - startTime;

      preferredPort = port; // Cache fastest working port for future OTPs
      console.log(
        `[Mailer Fast Success] Dispatched OTP to ${email} via Port ${port} in ${elapsed}ms. ID: ${info.messageId}`
      );

      return {
        success: true,
        messageId: info.messageId,
        strategyUsed: `port_${port}`,
      };
    } catch (err: unknown) {
      lastError = err instanceof Error ? err.message : String(err);
      console.warn(`[Mailer Notice] Port ${port} failed (${lastError}). Trying alternate port...`);
    }
  }

  // Fallback: If both GoDaddy standard ports failed, try Office 365
  try {
    const o365Transporter = nodemailer.createTransport({
      host: "smtp.office365.com",
      port: 587,
      secure: false,
      requireTLS: true,
      auth: {
        user: cfg.user,
        pass: cfg.pass,
      },
      tls: {
        rejectUnauthorized: false,
      },
      connectionTimeout: CONNECT_TIMEOUT,
      greetingTimeout: GREETING_TIMEOUT,
      socketTimeout: SOCKET_TIMEOUT,
    });

    const o365Info = await o365Transporter.sendMail(mailOptions);
    console.log(`[Mailer Success] Dispatched OTP to ${email} via Office 365.`);
    return {
      success: true,
      messageId: o365Info.messageId,
      strategyUsed: "office_365",
    };
  } catch (o365Err: unknown) {
    const o365ErrMsg = o365Err instanceof Error ? o365Err.message : String(o365Err);
    console.error(`[Mailer Error] All dispatch strategies failed: ${lastError} | O365: ${o365ErrMsg}`);

    return {
      success: false,
      error: `Email delivery failed: ${lastError}. Please verify info@prayxis.in mailbox password.`,
    };
  }
}
