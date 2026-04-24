import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ─── Users (admin + lab clients) ───────────────────────────────────────────
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  // "admin" | "client" | "lab_manager" | "qa_analyst" | "reviewer" | "auditor"
  role: text("role").notNull().default("client"),
  organizationName: text("organization_name"),
  createdAt: text("created_at").notNull().default(new Date().toISOString()),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// ─── Clients (lab organizations managed by admin) ──────────────────────────
export const clients = sqliteTable("clients", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  labName: text("lab_name").notNull(),
  contactName: text("contact_name").notNull(),
  contactEmail: text("contact_email").notNull(),
  labType: text("lab_type").notNull(), // "GMP" | "GLP" | "Regenerative" | "Biotech" | "Other"
  complianceFramework: text("compliance_framework").notNull(), // "GMP" | "GLP" | "ISO" | "FDA 21 CFR"
  status: text("status").notNull().default("active"), // "active" | "inactive" | "pending"
  auditScore: real("audit_score"), // 0–100
  createdAt: text("created_at").notNull().default(new Date().toISOString()),
});

export const insertClientSchema = createInsertSchema(clients).omit({ id: true, createdAt: true, auditScore: true });
export type InsertClient = z.infer<typeof insertClientSchema>;
export type Client = typeof clients.$inferSelect;

// ─── Documents ─────────────────────────────────────────────────────────────
export const documents = sqliteTable("documents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("client_id").notNull(),
  fileName: text("file_name").notNull(),
  fileType: text("file_type").notNull(), // "SOP" | "batch_record" | "training_record" | "equipment_log" | "deviation" | "other"
  content: text("content").notNull(), // raw text content
  status: text("status").notNull().default("pending"), // "pending" | "analyzing" | "analyzed" | "error"
  // Version control
  versionNumber: text("version_number").notNull().default("1.0"),
  versionStatus: text("version_status").notNull().default("current"), // "current" | "superseded" | "draft" | "retired"
  parentDocumentId: integer("parent_document_id"), // points to previous version
  changeNote: text("change_note"), // what changed in this version
  uploadedAt: text("uploaded_at").notNull().default(new Date().toISOString()),
});

export const insertDocumentSchema = createInsertSchema(documents).omit({ id: true, uploadedAt: true, status: true, versionNumber: true, versionStatus: true, parentDocumentId: true });
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type Document = typeof documents.$inferSelect;

// ─── Gap Analysis Reports ──────────────────────────────────────────────────
export const analyses = sqliteTable("analyses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("client_id").notNull(),
  documentId: integer("document_id"), // null = multi-doc analysis
  title: text("title").notNull(),
  overallScore: real("overall_score").notNull().default(0), // 0–100
  summary: text("summary").notNull().default(""),
  findings: text("findings").notNull().default("[]"), // JSON: Finding[]
  sopDraft: text("sop_draft"), // AI-generated SOP draft text
  status: text("status").notNull().default("pending"), // "pending" | "running" | "complete" | "error"
  createdAt: text("created_at").notNull().default(new Date().toISOString()),
});

export const insertAnalysisSchema = createInsertSchema(analyses).omit({ id: true, createdAt: true, overallScore: true, status: true, findings: true, summary: true });
export type InsertAnalysis = z.infer<typeof insertAnalysisSchema>;
export type Analysis = typeof analyses.$inferSelect;

// ─── Findings (individual issues flagged in an analysis) ───────────────────
// Stored as JSON inside analyses.findings for simplicity
export interface Finding {
  id: string;
  severity: "critical" | "major" | "minor" | "info";
  category: "missing_field" | "formatting" | "terminology" | "signature" | "date" | "lot_number" | "procedure_gap" | "other";
  description: string;
  recommendation: string;
  resolved: boolean;
}

// ─── Audit Logs ────────────────────────────────────────────────────────────
export const auditLogs = sqliteTable("audit_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id"),
  userEmail: text("user_email").notNull().default("system"),
  action: text("action").notNull(),
  resource: text("resource"),
  details: text("details"),
  ipAddress: text("ip_address"),
  success: integer("success").notNull().default(1), // 1=true, 0=false
  createdAt: text("created_at").notNull().default(new Date().toISOString()),
});

export type AuditLog = typeof auditLogs.$inferSelect;

// ─── Settings ──────────────────────────────────────────────────────────────
export const settings = sqliteTable("settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull().default(new Date().toISOString()),
});

export type Setting = typeof settings.$inferSelect;

// ─── CAPA (Corrective & Preventive Actions) ────────────────────────────────
export const capas = sqliteTable("capas", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("client_id").notNull(),
  analysisId: integer("analysis_id"), // linked analysis (optional)
  findingId: text("finding_id"), // linked finding ID (uuid from analysis)
  title: text("title").notNull(),
  description: text("description").notNull(),
  rootCause: text("root_cause"),
  correctiveAction: text("corrective_action"),
  preventiveAction: text("preventive_action"),
  assignedTo: text("assigned_to"), // name or email
  priority: text("priority").notNull().default("medium"), // "critical" | "high" | "medium" | "low"
  status: text("status").notNull().default("open"), // "open" | "in_progress" | "closed" | "overdue"
  dueDate: text("due_date"),
  closedAt: text("closed_at"),
  createdAt: text("created_at").notNull().default(new Date().toISOString()),
});

export const insertCapaSchema = createInsertSchema(capas).omit({ id: true, createdAt: true, closedAt: true });
export type InsertCapa = z.infer<typeof insertCapaSchema>;
export type Capa = typeof capas.$inferSelect;

// ─── Training Records ──────────────────────────────────────────────────────
export const trainingRecords = sqliteTable("training_records", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("client_id").notNull(),
  traineeName: text("trainee_name").notNull(),
  traineeEmail: text("trainee_email"),
  trainingTitle: text("training_title").notNull(),
  trainingType: text("training_type").notNull().default("SOP"), // "SOP" | "GMP" | "GLP" | "Safety" | "Competency" | "Other"
  completedDate: text("completed_date").notNull(),
  expiryDate: text("expiry_date"), // null = no expiry
  certificateContent: text("certificate_content"), // stored text/reference
  status: text("status").notNull().default("active"), // "active" | "expiring_soon" | "expired"
  notes: text("notes"),
  createdAt: text("created_at").notNull().default(new Date().toISOString()),
});

export const insertTrainingRecordSchema = createInsertSchema(trainingRecords).omit({ id: true, createdAt: true });
export type InsertTrainingRecord = z.infer<typeof insertTrainingRecordSchema>;
export type TrainingRecord = typeof trainingRecords.$inferSelect;

// ─── Non-conformances / Deviations ────────────────────────────────────────
export const nonconformances = sqliteTable("nonconformances", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("client_id").notNull(),
  refNumber: text("ref_number").notNull(), // e.g. NC-2026-001
  title: text("title").notNull(),
  description: text("description").notNull(),
  detectedBy: text("detected_by"),
  detectedDate: text("detected_date").notNull(),
  area: text("area"), // "Sample Prep" | "QC" | "Storage" | etc.
  severity: text("severity").notNull().default("minor"), // "critical" | "major" | "minor"
  immediateAction: text("immediate_action"),
  status: text("status").notNull().default("open"), // "open" | "under_investigation" | "resolved" | "closed"
  capaId: integer("capa_id"), // linked CAPA if raised
  closedAt: text("closed_at"),
  createdAt: text("created_at").notNull().default(new Date().toISOString()),
});

export const insertNonconformanceSchema = createInsertSchema(nonconformances).omit({ id: true, createdAt: true, closedAt: true });
export type InsertNonconformance = z.infer<typeof insertNonconformanceSchema>;
export type Nonconformance = typeof nonconformances.$inferSelect;

// ─── In-app notifications ──────────────────────────────────────────────────
export const notifications = sqliteTable("notifications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  type: text("type").notNull().default("info"), // "info" | "warning" | "success" | "error"
  link: text("link"), // optional frontend route to navigate to
  read: integer("read").notNull().default(0),
  createdAt: text("created_at").notNull().default(new Date().toISOString()),
});

export type Notification = typeof notifications.$inferSelect;

// ─── Onboarding state ──────────────────────────────────────────────────────
export const onboardingState = sqliteTable("onboarding_state", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().unique(),
  completed: integer("completed").notNull().default(0),
  step: integer("step").notNull().default(0),
  completedAt: text("completed_at"),
});
