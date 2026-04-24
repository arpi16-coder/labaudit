import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@shared/schema";
import path from "path";

const sqlite = new Database(path.join(process.cwd(), "labaudit.db"));
export const db = drizzle(sqlite, { schema });

// Run migrations inline
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'client',
    organization_name TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    lab_name TEXT NOT NULL,
    contact_name TEXT NOT NULL,
    contact_email TEXT NOT NULL,
    lab_type TEXT NOT NULL,
    compliance_framework TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    audit_score REAL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    file_name TEXT NOT NULL,
    file_type TEXT NOT NULL,
    content TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS analyses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    document_id INTEGER,
    title TEXT NOT NULL,
    overall_score REAL NOT NULL DEFAULT 0,
    summary TEXT NOT NULL DEFAULT '',
    findings TEXT NOT NULL DEFAULT '[]',
    sop_draft TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// New tables for security layer
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    user_email TEXT NOT NULL DEFAULT 'system',
    action TEXT NOT NULL,
    resource TEXT,
    details TEXT,
    ip_address TEXT,
    success INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL UNIQUE,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Seed default settings
const defaultSettings = [
  { key: "ai_provider", value: "groq" }, // "groq" | "perplexity" | "ollama"
  { key: "ollama_url", value: "http://localhost:11434" },
  { key: "ollama_model", value: "llama3" },
  { key: "data_retention_days", value: "365" },
  { key: "encryption_enabled", value: "true" },
];
for (const s of defaultSettings) {
  const exists = sqlite.prepare("SELECT id FROM settings WHERE key = ?").get(s.key);
  if (!exists) {
    sqlite.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(s.key, s.value);
  }
}

// Seed admin account if not exists
const existingAdmin = sqlite.prepare("SELECT id FROM users WHERE email = ?").get("admin@labaudit.ai");
if (!existingAdmin) {
  sqlite.prepare(
    "INSERT INTO users (email, password, name, role, organization_name) VALUES (?, ?, ?, ?, ?)"
  ).run("admin@labaudit.ai", "admin123", "Admin", "admin", "LabAudit.ai");
}
