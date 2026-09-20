import { AgentMailClient } from "agentmail";
import { env } from "./env";
import {
  deckAcceptedEmail,
  deckFailedEmail,
  deckReadyEmail,
  deckRejectedEmail,
  type EmailBody,
} from "./emailTemplates";
import type { JobRow } from "./jobs";

/**
 * AgentMail delivery for finished decks.
 *
 * Email is strictly optional: with AGENTMAIL_API_KEY unset every helper here
 * no-ops so the pipeline keeps working exactly as it did before.
 */

/** AgentMail caps a send at 6 MB including base64 overhead; stay well clear of it. */
const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;

const PPTX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

export function isEmailEnabled(): boolean {
  return Boolean(env.agentMailApiKey);
}

const globalForEmail = globalThis as unknown as { agentMail?: AgentMailClient; agentMailInboxId?: string };

function getClient(): AgentMailClient {
  const apiKey = env.agentMailApiKey;
  if (!apiKey) throw new Error("Missing required environment variable: AGENTMAIL_API_KEY");
  globalForEmail.agentMail ??= new AgentMailClient({ apiKey });
  return globalForEmail.agentMail;
}

/** The address the system inbox should live at. AgentMail inbox ids are the address itself. */
function desiredAddress(): string {
  return `${env.agentMailInboxUsername}@${env.agentMailDomain || "agentmail.to"}`;
}

function isNotFound(err: unknown): boolean {
  return (err as { statusCode?: number })?.statusCode === 404;
}

/**
 * The inbox decks are sent from and inbound requests arrive at.
 *
 * Resolution order: an explicit AGENTMAIL_INBOX_ID, then an inbox that already
 * exists at the configured address, and only then a fresh create. Creating
 * blindly is wrong — AgentMail plans cap inbox count, so on a full account a
 * create fails instead of returning the inbox you meant to reuse.
 */
export async function getSystemInboxId(): Promise<string> {
  if (globalForEmail.agentMailInboxId) return globalForEmail.agentMailInboxId;

  const client = getClient();
  const configured = env.agentMailInboxId;
  const address = configured || desiredAddress();

  try {
    const existing = await client.inboxes.get(address);
    globalForEmail.agentMailInboxId = existing.inboxId;
    return existing.inboxId;
  } catch (err) {
    if (!isNotFound(err)) throw err;
    if (configured) {
      throw new Error(`AGENTMAIL_INBOX_ID is set to "${configured}" but no such inbox exists on this account`);
    }
  }

  try {
    const inbox = await client.inboxes.create({
      username: env.agentMailInboxUsername,
      domain: env.agentMailDomain,
      displayName: "research-to-deck",
      // AgentMail restricts client ids to A-Z a-z 0-9 - . _ ~
      clientId: `research-to-deck.${env.agentMailInboxUsername}`,
    });
    globalForEmail.agentMailInboxId = inbox.inboxId;
    return inbox.inboxId;
  } catch (err) {
    if ((err as { body?: { code?: string } })?.body?.code === "limit_exceeded") {
      throw new Error(
        `Cannot create ${address}: this AgentMail account is at its inbox limit. ` +
          `Set AGENTMAIL_INBOX_ID to an existing inbox, free one up, or upgrade the plan.`,
      );
    }
    throw err;
  }
}

interface Attachment {
  filename: string;
  contentType: string;
  content: string;
}

function deckAttachment(deck: Buffer, deckName: string): Attachment | null {
  if (deck.byteLength > MAX_ATTACHMENT_BYTES) return null;
  return { filename: deckName, contentType: PPTX_CONTENT_TYPE, content: deck.toString("base64") };
}

/**
 * Sends `body` either as a reply in the originating thread (email-requested
 * jobs) or as a fresh message to the address captured at submit time.
 */
async function deliver(job: JobRow, body: EmailBody, attachments?: Attachment[]): Promise<void> {
  const client = getClient();
  const inboxId = job.reply_inbox_id ?? (await getSystemInboxId());

  if (job.reply_message_id) {
    await client.inboxes.messages.reply(inboxId, job.reply_message_id, {
      text: body.text,
      html: body.html,
      attachments,
    });
    return;
  }

  if (!job.notify_email) return;
  await client.inboxes.messages.send(inboxId, {
    to: [job.notify_email],
    subject: body.subject,
    text: body.text,
    html: body.html,
    attachments,
  });
}

/** True when this job asked for any kind of email delivery. */
export function wantsEmail(job: Pick<JobRow, "notify_email" | "reply_message_id">): boolean {
  return Boolean(job.notify_email || job.reply_message_id);
}

export function statusUrl(jobId: string): string {
  return `${env.appBaseUrl}/api/decks/${jobId}`;
}

export function downloadUrl(jobId: string): string {
  return `${env.appBaseUrl}/api/decks/${jobId}/download`;
}

export async function sendDeckReady(
  job: JobRow,
  deck: Buffer,
  deckName: string,
  facts: { slides: number; references: number; papers: number },
): Promise<void> {
  const attachment = deckAttachment(deck, deckName);
  const body = deckReadyEmail({
    topic: job.topic,
    downloadUrl: downloadUrl(job.id),
    slides: facts.slides,
    references: facts.references,
    papers: facts.papers,
    attached: attachment !== null,
  });
  await deliver(job, body, attachment ? [attachment] : undefined);
}

export async function sendDeckFailed(job: JobRow, error: string): Promise<void> {
  await deliver(job, deckFailedEmail({ topic: job.topic, error, statusUrl: statusUrl(job.id) }));
}

/** Acknowledges an email-requested job immediately, since a run takes minutes. */
export async function replyAccepted(
  inboxId: string,
  messageId: string,
  input: { topic: string; paperCount: number; jobId: string },
): Promise<void> {
  const body = deckAcceptedEmail({
    topic: input.topic,
    paperCount: input.paperCount,
    statusUrl: statusUrl(input.jobId),
  });
  await getClient().inboxes.messages.reply(inboxId, messageId, { text: body.text, html: body.html });
}

/** Tells an inbound sender why their email did not start a deck. */
export async function replyRejected(inboxId: string, messageId: string, reason: string): Promise<void> {
  const body = deckRejectedEmail(reason);
  await getClient().inboxes.messages.reply(inboxId, messageId, { text: body.text, html: body.html });
}
