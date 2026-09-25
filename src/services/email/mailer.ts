import "server-only";
import nodemailer from "nodemailer";
import { readFileSync } from "node:fs";
import path from "node:path";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { LOGO_CID, type EmailContent } from "@/services/email/templates";

export class EmailNotConfiguredError extends Error {
  constructor() {
    super("Envio de e-mail não configurado (EMAIL_USER / EMAIL_APP_PASSWORD).");
    this.name = "EmailNotConfiguredError";
  }
}

export function isEmailConfigured(): boolean {
  const env = getEnv();
  return Boolean(env.EMAIL_USER && env.EMAIL_APP_PASSWORD);
}

let transporter: nodemailer.Transporter | null = null;
let logoBuffer: Buffer | null = null;

/** Logo institucional embutida (CID) — funciona no Gmail/Outlook sem depender de URL pública. */
function getLogo(): Buffer {
  logoBuffer ??= readFileSync(path.join(process.cwd(), "src/services/email/assets/logo-cruzeiro.png"));
  return logoBuffer;
}

function getTransporter(): nodemailer.Transporter {
  if (transporter) return transporter;
  const env = getEnv();
  if (!env.EMAIL_USER || !env.EMAIL_APP_PASSWORD) throw new EmailNotConfiguredError();
  // Gmail / Google Workspace com senha de app (SMTP sobre SSL).
  transporter = nodemailer.createTransport({
    host: env.EMAIL_SMTP_HOST,
    port: env.EMAIL_SMTP_PORT,
    secure: env.EMAIL_SMTP_PORT === 465,
    auth: { user: env.EMAIL_USER, pass: env.EMAIL_APP_PASSWORD },
  });
  return transporter;
}

export interface SendMailInput {
  to: string;
  content: EmailContent;
  kind: "ACADEMIC_UPDATE" | "INVITE" | "RESET" | "TEMPORARY_PASSWORD" | "FOLLOW_UP";
  actorUserId?: string | null;
  targetUserId?: string | null;
}

/** Envia o e-mail e registra o evento na auditoria (sem corpo, sem senha). */
export async function sendMail(input: SendMailInput): Promise<{ messageId: string }> {
  const env = getEnv();
  const from = env.EMAIL_FROM ?? `Análise Curricular <${env.EMAIL_USER}>`;
  try {
    const info = await getTransporter().sendMail({
      from,
      to: input.to,
      subject: input.content.subject,
      text: input.content.text,
      html: input.content.html,
      replyTo: env.EMAIL_USER,
      headers: { "X-Auto-Response-Suppress": "All", "Auto-Submitted": "auto-generated" },
      attachments: [{ filename: "logo-cruzeiro.png", content: getLogo(), cid: LOGO_CID, contentType: "image/png", contentDisposition: "inline" }],
    });
    await prisma.auditLog.create({
      data: { userId: input.actorUserId ?? null, action: "email.sent", entityType: "User", entityId: input.targetUserId ?? null, metadata: { kind: input.kind, to: input.to, messageId: info.messageId } },
    });
    logger.info("email.sent", { kind: input.kind, to: input.to });
    return { messageId: info.messageId };
  } catch (err) {
    await prisma.auditLog
      .create({ data: { userId: input.actorUserId ?? null, action: "email.failed", entityType: "User", entityId: input.targetUserId ?? null, metadata: { kind: input.kind, to: input.to, error: err instanceof Error ? err.message.slice(0, 200) : "unknown" } } })
      .catch(() => undefined);
    logger.error("email.failed", { kind: input.kind, to: input.to, err: err instanceof Error ? err.message : String(err) });
    throw err;
  }
}

export function appUrl(path = ""): string {
  const base = getEnv().APP_URL ?? process.env.AUTH_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");
  return `${base.replace(/\/$/, "")}${path}`;
}
