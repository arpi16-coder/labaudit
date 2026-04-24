import { db } from "./db";
import { auditLogs } from "@shared/schema";

export type AuditAction =
  | "login"
  | "logout"
  | "login_failed"
  | "beta_access"
  | "document_upload"
  | "document_delete"
  | "document_download"
  | "analysis_start"
  | "analysis_complete"
  | "analysis_error"
  | "sop_draft_download"
  | "client_create"
  | "client_update"
  | "client_delete"
  | "user_create"
  | "settings_update"
  | "data_retention_applied";

export interface AuditEntry {
  userId?: number;
  userEmail?: string;
  action: AuditAction;
  resource?: string;       // e.g. "document:42", "client:7"
  details?: string;        // JSON string of extra context
  ipAddress?: string;
  success: boolean;
}

export function logAudit(entry: AuditEntry): void {
  try {
    db.insert(auditLogs).values({
      userId: entry.userId ?? null,
      userEmail: entry.userEmail ?? "system",
      action: entry.action,
      resource: entry.resource ?? null,
      details: entry.details ?? null,
      ipAddress: entry.ipAddress ?? null,
      success: entry.success ? 1 : 0,
      createdAt: new Date().toISOString(),
    }).run();
  } catch (err) {
    // Never let audit logging crash the app
    console.error("[AuditLog] Failed to write log entry:", err);
  }
}

export function clearAuditLogs(): number {
  try {
    const result = db.delete(auditLogs).run();
    return result.changes;
  } catch (err) {
    console.error("[AuditLog] Failed to clear logs:", err);
    return 0;
  }
}

export function getAuditLogs(options?: {
  limit?: number;
  offset?: number;
  userId?: number;
  action?: AuditAction;
}) {
  const limit = options?.limit ?? 100;
  const offset = options?.offset ?? 0;

  let query = db.select().from(auditLogs);
  const rows = query.all();

  // Filter in JS (simpler than building dynamic drizzle queries)
  let filtered = rows;
  if (options?.userId) filtered = filtered.filter(r => r.userId === options.userId);
  if (options?.action) filtered = filtered.filter(r => r.action === options.action);

  // Sort newest first
  filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return {
    total: filtered.length,
    logs: filtered.slice(offset, offset + limit),
  };
}
