// Email delivery. Sends via Brevo (transactional email API) when BREVO_API_KEY
// is set; otherwise logs the message to the server console so the flow is fully
// testable in dev with no provider. Adding a real key flips it to live sending
// with no code change.
const BREVO_KEY = () => process.env["BREVO_API_KEY"];
// Verified sender. Brevo requires the sender email to be a verified sender or
// on a verified/authenticated domain in your Brevo account. Set MAIL_FROM as
// "Name <email>" (e.g. "TAMP <noreply@yourdomain.co.za>").
const FROM = () => process.env["MAIL_FROM"] ?? "TAMP <noreply@tamp.local>";

// Parse a "Name <email>" (or bare "email") string into Brevo's sender shape.
function parseFrom(raw: string): { name: string; email: string } {
  const m = raw.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1] || "TAMP", email: m[2]!.trim() };
  return { name: "TAMP", email: raw.trim() };
}

export interface Mail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/** True when real emails will be dispatched (a provider key is configured). */
export function mailerLive(): boolean {
  return !!BREVO_KEY();
}

export async function sendMail(mail: Mail): Promise<void> {
  const key = BREVO_KEY();
  if (!key) {
    // Dev fallback — no provider configured.
    console.info(
      `\n📧 [dev mailer] no BREVO_API_KEY set; not sending.\n  to: ${mail.to}\n  subject: ${mail.subject}\n  ${mail.text}\n`,
    );
    return;
  }
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": key,
      "Content-Type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      sender: parseFrom(FROM()),
      to: [{ email: mail.to }],
      subject: mail.subject,
      htmlContent: mail.html,
      textContent: mail.text,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Email send failed (${res.status}): ${detail}`);
  }
}

// Shared layout for a "here is your code" email.
function codeEmail(
  heading: string,
  intro: string,
  code: string,
): { subject: string; html: string; text: string } {
  const subject = `Your TAMP code: ${code}`;
  const text = `${intro} Your code is ${code}. It expires in 10 minutes. If you didn't request this, you can ignore this email.`;
  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:440px;margin:0 auto;padding:24px">
      <h1 style="font-size:18px;margin:0 0 8px">${heading}</h1>
      <p style="color:#555;font-size:14px;margin:0 0 20px">${intro}</p>
      <div style="font-size:34px;font-weight:800;letter-spacing:8px;background:#f5c518;color:#111;text-align:center;padding:16px;border-radius:12px">${code}</div>
      <p style="color:#888;font-size:12px;margin:20px 0 0">This code expires in 10 minutes. If you didn't request it, ignore this email.</p>
    </div>`;
  return { subject, html, text };
}

/** Password-reset code email. */
export function passwordResetEmail(code: string) {
  return codeEmail("Reset your password", "Enter this code in TAMP to set a new password.", code);
}

/** Email-change confirmation code (sent to the NEW address). */
export function emailChangeEmail(code: string) {
  return codeEmail("Confirm your new email", "Enter this code in TAMP to confirm this email address.", code);
}

/** Verification-code email body. */
export function verificationEmail(code: string): { subject: string; html: string; text: string } {
  const subject = `Your TAMP verification code: ${code}`;
  const text = `Your TAMP verification code is ${code}. It expires in 10 minutes. If you didn't request this, you can ignore this email.`;
  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:440px;margin:0 auto;padding:24px">
      <h1 style="font-size:18px;margin:0 0 8px">Verify your email</h1>
      <p style="color:#555;font-size:14px;margin:0 0 20px">Enter this code in TAMP to finish creating your account.</p>
      <div style="font-size:34px;font-weight:800;letter-spacing:8px;background:#f5c518;color:#111;text-align:center;padding:16px;border-radius:12px">${code}</div>
      <p style="color:#888;font-size:12px;margin:20px 0 0">This code expires in 10 minutes. If you didn't request it, ignore this email.</p>
    </div>`;
  return { subject, html, text };
}
