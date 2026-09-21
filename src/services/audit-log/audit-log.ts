import "server-only";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { redact } from "@/lib/logger";
import { getClientIp } from "@/lib/request-ip";
import type { Prisma } from "@/generated/prisma/client";

export interface AuditEntry {
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}

/** Registra uma entrada de auditoria. Metadados passam por redação antes de persistir. */
export async function recordAudit(entry: AuditEntry): Promise<void> {
  let ip: string | null = null;
  let userAgent: string | null = null;
  try {
    const h = await headers();
    ip = getClientIp(h);
    userAgent = h.get("user-agent")?.slice(0, 300) ?? null;
  } catch {
    // fora de contexto de request (ex.: pipeline em background)
  }
  await prisma.auditLog.create({
    data: {
      userId: entry.userId ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      metadata: entry.metadata ? (redact(entry.metadata) as Prisma.InputJsonValue) : undefined,
      ip,
      userAgent,
    },
  });
}
