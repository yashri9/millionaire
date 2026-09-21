import "server-only";

/**
 * email.ts — email sending interface with a dev/console fallback.
 *
 * EMAIL_PROVIDER=dev (default) logs the email instead of sending, so nothing
 * breaks before you provision Resend/Postmark. Swap by setting EMAIL_PROVIDER
 * + the provider key in env. Used for: verification, password reset, and
 * escalation notifications (PRD §4.1, §4.3, journey step 11).
 */
import { serverEnv } from "@/lib/env";

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

export type EmailResult = { status: "sent" | "failed"; id?: string; error?: string };

export async function sendEmail(msg: EmailMessage): Promise<EmailResult> {
  const provider = serverEnv.emailProvider;

  if (provider === "resend") {
    if (!serverEnv.resendApiKey) return { status: "failed", error: "RESEND_API_KEY missing" };
    try {
      // Lazy import so the SDK isn't required in dev mode.
      const { Resend } = await import("resend");
      const resend = new Resend(serverEnv.resendApiKey);
      const { data, error } = await resend.emails.send({
        from: serverEnv.emailFrom,
        to: msg.to,
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
      });
      if (error) return { status: "failed", error: String(error) };
      return { status: "sent", id: data?.id };
    } catch (e) {
      return { status: "failed", error: (e as Error).message };
    }
  }

  if (provider === "postmark") {
    // TODO: implement Postmark transport (fetch https://api.postmarkapp.com/email).
    return { status: "failed", error: "Postmark not implemented yet" };
  }

  // dev fallback — never throws, just logs.
  console.log("\n[email:dev] ---------------------------------------");
  console.log(`to:      ${msg.to}`);
  console.log(`subject: ${msg.subject}`);
  console.log(`text:    ${msg.text ?? msg.html.replace(/<[^>]+>/g, "")}`);
  console.log("[email:dev] ---------------------------------------\n");
  return { status: "sent", id: "dev-noop" };
}

/** Escalation email (journey step 11): question + link to analytics. */
export async function sendEscalationEmail(params: {
  to: string;
  repName: string;
  question: string;
  analyticsUrl: string;
}): Promise<EmailResult> {
  return sendEmail({
    to: params.to,
    subject: `A prospect asked a question your deck couldn't answer`,
    html: `<p>A recipient asked:</p><blockquote>${params.question}</blockquote>
           <p><a href="${params.analyticsUrl}">Open the deck analytics →</a></p>`,
    text: `A recipient asked: "${params.question}"\nOpen analytics: ${params.analyticsUrl}`,
  });
}
