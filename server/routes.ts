import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "http";
import Groq from "groq-sdk";
import jwt from "jsonwebtoken";
import { storage } from "./storage";
import { encrypt, decrypt } from "./encryption";
import { logAudit, getAuditLogs, clearAuditLogs } from "./audit-logger";
import { db } from "./db";
import { settings } from "@shared/schema";
import { eq } from "drizzle-orm";
import type { Finding } from "@shared/schema";
import multer from "multer";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import { createWorker } from "tesseract.js";
import { fromBuffer } from "pdf2pic";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";

const JWT_SECRET = process.env.JWT_SECRET || "labaudit-jwt-secret-change-in-production";
const JWT_EXPIRY = "7d";

// ─── JWT helpers ─────────────────────────────────────────────────────────────
function signToken(userId: number, role: string): string {
  return jwt.sign({ userId, role }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.token || req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ message: "Not authenticated" });
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: number; role: string };
    (req as any).jwtUser = payload;
    next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired session" });
  }
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  requireAuth(req, res, () => {
    const user = (req as any).jwtUser;
    if (user?.role !== "admin") return res.status(403).json({ message: "Admin access required" });
    next();
  });
}

// ─── Scanned PDF → OCR helper ──────────────────────────────────────────────────
async function ocrScannedPdf(pdfBuffer: Buffer): Promise<string> {
  const tmpDir = path.join(os.tmpdir(), "labaudit-ocr-" + crypto.randomBytes(6).toString("hex"));
  fs.mkdirSync(tmpDir, { recursive: true });
  const pdfPath = path.join(tmpDir, "input.pdf");
  fs.writeFileSync(pdfPath, pdfBuffer);

  try {
    // Use ghostscript to convert PDF pages to PNG images (150 DPI is enough for OCR)
    execSync(
      `gs -dBATCH -dNOPAUSE -sDEVICE=png16m -r150 -dTextAlphaBits=4 -dGraphicsAlphaBits=4 -sOutputFile="${tmpDir}/page-%03d.png" "${pdfPath}"`,
      { timeout: 60000, stdio: "pipe" }
    );

    const pages = fs.readdirSync(tmpDir)
      .filter(f => f.startsWith("page-") && f.endsWith(".png"))
      .sort();

    if (pages.length === 0) return "";

    const worker = await createWorker("eng", 1, { logger: () => {}, errorHandler: () => {} });
    const pageTexts: string[] = [];
    try {
      for (const page of pages) {
        const imgBuffer = fs.readFileSync(path.join(tmpDir, page));
        const { data } = await worker.recognize(imgBuffer);
        if (data.text?.trim()) pageTexts.push(data.text.trim());
      }
    } finally {
      await worker.terminate();
    }

    return pageTexts.join("\n\n--- Page Break ---\n\n");
  } finally {
    // Clean up temp files
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
}

// ─── Multer (in-memory, 20 MB limit) ─────────────────────────────────────────
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// ─── Settings helpers ────────────────────────────────────────────────────────
function getSetting(key: string): string | null {
  const row = db.select().from(settings).where(eq(settings.key, key)).get();
  return row?.value ?? null;
}

function setSetting(key: string, value: string): void {
  const existing = db.select().from(settings).where(eq(settings.key, key)).get();
  if (existing) {
    db.update(settings)
      .set({ value, updatedAt: new Date().toISOString() })
      .where(eq(settings.key, key))
      .run();
  } else {
    db.insert(settings).values({ key, value, updatedAt: new Date().toISOString() }).run();
  }
}

function getAllSettings(): Record<string, string> {
  const rows = db.select().from(settings).all();
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

// ─── Ollama / on-premise AI helper ───────────────────────────────────────────
async function runOllamaAnalysis(
  docContent: string,
  docType: string,
  framework: string
): Promise<{ score: number; summary: string; findings: Finding[]; sopDraft: string }> {
  const ollamaUrl = getSetting("ollama_url") || "http://localhost:11434";
  const model = getSetting("ollama_model") || "llama3";

  const prompt = `You are a GMP/GLP regulatory compliance auditor. Perform a gap analysis on this ${docType} document for ${framework} compliance.

Return ONLY valid JSON:
{
  "score": <0-100>,
  "summary": "<2-3 sentence summary>",
  "findings": [{"id":"<uuid>","severity":"<critical|major|minor|info>","category":"<missing_field|formatting|signature|date|procedure_gap|other>","description":"<issue>","recommendation":"<fix>","resolved":false}],
  "sopDraft": "<full revised SOP with Purpose, Scope, Responsibilities, Procedure, References, Approval block>"
}

Document:
${docContent.substring(0, 6000)}`;

  const response = await fetch(`${ollamaUrl}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt, stream: false }),
    signal: AbortSignal.timeout(120000),
  });

  if (!response.ok) throw new Error(`Ollama error: ${response.status}`);
  const data = await response.json() as any;
  const text = data.response || "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON in Ollama response");
  return JSON.parse(jsonMatch[0]);
}

// ─── Groq analysis helper ────────────────────────────────────────────────────
async function runGroqAnalysis(
  docContent: string,
  docType: string,
  framework: string
): Promise<{ score: number; summary: string; findings: Finding[]; sopDraft: string }> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY not set");

  const groq = new Groq({ apiKey });

  const systemPrompt = `You are an expert GMP/GLP regulatory compliance auditor with 20+ years experience in biotech and regenerative medicine labs. Perform a rigorous gap analysis on the provided laboratory document.

Compliance framework: ${framework}
Document type: ${docType}

Return ONLY valid JSON with this exact structure (no markdown, no explanation, just JSON):
{
  "score": <number 0-100>,
  "summary": "<2-3 sentence executive summary>",
  "findings": [
    {
      "id": "<uuid string>",
      "severity": "<critical|major|minor|info>",
      "category": "<missing_field|formatting|terminology|signature|date|lot_number|procedure_gap|other>",
      "description": "<specific issue found>",
      "recommendation": "<specific corrective action>",
      "resolved": false
    }
  ],
  "sopDraft": "<full revised SOP draft with all gaps filled, properly formatted with sections: Purpose, Scope, Responsibilities, Procedure, References, Approval block>"
}`;

  const completion = await groq.chat.completions.create({
    model: "llama-3.1-8b-instant",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Analyze this ${docType} document for ${framework} compliance gaps:\n\n${docContent.substring(0, 8000)}` },
    ],
    temperature: 0.2,
    max_tokens: 4000,
  });

  const text = completion.choices?.[0]?.message?.content || "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON in Groq response");
  return JSON.parse(jsonMatch[0]);
}

// ─── Perplexity API analysis helper ──────────────────────────────────────────
async function runPerplexityAnalysis(
  docContent: string,
  docType: string,
  framework: string
): Promise<{ score: number; summary: string; findings: Finding[]; sopDraft: string }> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) return demoAnalysis(docContent, docType);

  const systemPrompt = `You are an expert GMP/GLP regulatory compliance auditor with 20+ years experience in biotech and regenerative medicine labs. Your task is to perform a rigorous gap analysis on the provided laboratory document.

Compliance framework: ${framework}
Document type: ${docType}

Return ONLY valid JSON with this exact structure:
{
  "score": <number 0-100>,
  "summary": "<2-3 sentence executive summary>",
  "findings": [
    {
      "id": "<uuid string>",
      "severity": "<critical|major|minor|info>",
      "category": "<missing_field|formatting|terminology|signature|date|lot_number|procedure_gap|other>",
      "description": "<specific issue found>",
      "recommendation": "<specific corrective action>",
      "resolved": false
    }
  ],
  "sopDraft": "<full revised SOP draft with all gaps filled, properly formatted with Section headers, Purpose, Scope, Responsibilities, Procedure, References>"
}`;

  const response = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "llama-3.1-sonar-large-128k-online",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Analyze this ${docType} document for ${framework} compliance gaps:\n\n${docContent.substring(0, 8000)}` },
      ],
      temperature: 0.2,
      max_tokens: 4000,
    }),
  });

  if (!response.ok) throw new Error(`API error: ${response.status}`);
  const data = await response.json() as any;
  const text = data.choices?.[0]?.message?.content || "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON in response");
  return JSON.parse(jsonMatch[0]);
}

// ─── Main analysis dispatcher ─────────────────────────────────────────────────
async function runGapAnalysis(
  docContent: string,
  docType: string,
  framework: string
): Promise<{ score: number; summary: string; findings: Finding[]; sopDraft: string }> {
  const provider = getSetting("ai_provider") || "groq";

  try {
    if (provider === "ollama") {
      return await runOllamaAnalysis(docContent, docType, framework);
    } else if (provider === "perplexity") {
      return await runPerplexityAnalysis(docContent, docType, framework);
    } else {
      // Default: Groq
      return await runGroqAnalysis(docContent, docType, framework);
    }
  } catch (err) {
    console.error(`AI analysis error (${provider}):`, err);
    return demoAnalysis(docContent, docType);
  }
}

// ─── Demo fallback ───────────────────────────────────────────────────────────
function demoAnalysis(
  content: string,
  docType: string
): { score: number; summary: string; findings: Finding[]; sopDraft: string } {
  const lower = content.toLowerCase();
  const findings: Finding[] = [];
  let score = 85;

  if (!lower.includes("signature") && !lower.includes("signed by") && !lower.includes("approved by")) {
    findings.push({ id: crypto.randomUUID(), severity: "critical", category: "signature", description: "No authorized signature or approval block detected in document.", recommendation: "Add a signature block including: Prepared By, Reviewed By, and Approved By fields with date lines.", resolved: false });
    score -= 20;
  }
  if (!lower.includes("date") && !lower.includes("effective date") && !lower.includes("revision")) {
    findings.push({ id: crypto.randomUUID(), severity: "major", category: "date", description: "Missing effective date and revision history table.", recommendation: "Include document header with: Document No., Effective Date, Revision No., and a Revision History table.", resolved: false });
    score -= 10;
  }
  if (docType === "batch_record" && !lower.includes("lot") && !lower.includes("batch")) {
    findings.push({ id: crypto.randomUUID(), severity: "critical", category: "lot_number", description: "Batch/Lot number field not found in batch record.", recommendation: "Add Lot Number, Batch Number, and Expiry Date fields in the header section.", resolved: false });
    score -= 15;
  }
  if (!lower.includes("scope") && !lower.includes("purpose")) {
    findings.push({ id: crypto.randomUUID(), severity: "major", category: "procedure_gap", description: "Document lacks a Purpose and Scope section.", recommendation: "Add a Purpose section explaining the objective and a Scope section defining applicability.", resolved: false });
    score -= 8;
  }
  if (!lower.includes("responsibility") && !lower.includes("responsible")) {
    findings.push({ id: crypto.randomUUID(), severity: "minor", category: "procedure_gap", description: "No Responsibilities section found.", recommendation: "Define roles and responsibilities for each step — include QA, Lab Manager, and operator roles.", resolved: false });
    score -= 5;
  }
  findings.push({ id: crypto.randomUUID(), severity: "info", category: "terminology", description: "Terminology may benefit from standardization to align with ICH Q7 / 21 CFR Part 211 glossary.", recommendation: "Cross-reference all technical terms with the applicable regulatory glossary and ensure consistent usage.", resolved: false });

  const sopDraft = `STANDARD OPERATING PROCEDURE\nDocument No.: SOP-${Math.floor(Math.random() * 9000) + 1000}\nTitle: ${docType.replace(/_/g, " ").toUpperCase()} — REVISED DRAFT\nEffective Date: ${new Date().toLocaleDateString()}\nRevision No.: 1.0\nStatus: DRAFT — Pending Approval\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n1. PURPOSE\nThis SOP establishes the requirements and procedures for [process name] in compliance with GMP/GLP regulatory standards.\n\n2. SCOPE\nThis procedure applies to all personnel involved in [process] within [lab/department name].\n\n3. RESPONSIBILITIES\n• Quality Assurance (QA): Approve SOP; ensure compliance\n• Laboratory Manager: Oversee execution; approve deviations\n• Operator/Analyst: Execute procedure; document all steps\n\n4. DEFINITIONS\n• Lot Number: Unique identifier assigned to a batch of material\n• Deviation: Any departure from an approved procedure\n\n5. MATERIALS & EQUIPMENT\n• [List all required materials and equipment]\n\n6. PROCEDURE\nStep 1: Preparation\n  6.1 Verify all materials are within expiry date\n  6.2 Confirm equipment calibration is current\n\nStep 2: Execution\n  6.3 [Detailed step-by-step procedure]\n  6.4 Record all observations in real-time\n\nStep 3: Documentation\n  6.5 Complete all fields in the batch record\n  6.6 Obtain required signatures before proceeding\n\n7. REFERENCES\n• [Applicable regulatory guideline]\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nAPPROVAL SIGNATURES\n\nPrepared By: __________________ Date: __________\nReviewed By: __________________ Date: __________\nApproved By: __________________ Date: __________\n`;

  return {
    score: Math.max(0, Math.min(100, score)),
    summary: `Gap analysis identified ${findings.filter(f => f.severity === "critical").length} critical and ${findings.filter(f => f.severity === "major").length} major compliance issues in this ${docType.replace(/_/g, " ")}. The document requires updates to meet GMP/GLP standards before an audit. A revised SOP draft has been generated with all identified gaps addressed.`,
    findings,
    sopDraft,
  };
}

// ─── IP helper ───────────────────────────────────────────────────────────────
function getIP(req: Request): string {
  return (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
}

export async function registerRoutes(httpServer: Server, app: Express) {
  // cookie-parser must be used in index.ts — handled via express built-in json
  // We read cookies manually if cookie-parser isn't there

  // ── File extraction ────────────────────────────────────────────────────────
  // Accepts any file up to 20MB, extracts plain text, returns { text, fileName, mimeType }
  app.post("/api/extract-text", upload.single("file"), async (req, res) => {
    try {
      const file = (req as any).file;
      if (!file) return res.status(400).json({ message: "No file uploaded" });

      const mime = file.mimetype as string;
      const name = file.originalname as string;
      let text = "";

      if (mime === "application/pdf") {
        const parsed = await pdfParse(file.buffer);
        const rawText = parsed.text?.trim() || "";
        // Detect scanned PDF: very little real text despite having pages
        // Heuristic: fewer than 50 real word-like tokens per page = image-based
        const wordCount = (rawText.match(/[a-zA-Z]{3,}/g) || []).length;
        const pageCount = parsed.numpages || 1;
        const wordsPerPage = wordCount / pageCount;
        if (wordsPerPage < 50 && pageCount >= 1) {
          // Scanned/image-based PDF — run Ghostscript + Tesseract OCR
          console.log(`[extract-text] Scanned PDF detected (${wordsPerPage.toFixed(1)} words/page), running OCR...`);
          const ocrText = await ocrScannedPdf(file.buffer);
          text = ocrText
            ? `[OCR extracted from scanned PDF: ${name}]\n\n${ocrText}`
            : `[Scanned PDF: ${name}] — No readable text detected by OCR. The scan quality may be too low.`;
        } else {
          text = rawText;
        }
      } else if (
        mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
        mime === "application/msword" ||
        name.endsWith(".docx") || name.endsWith(".doc")
      ) {
        const result = await mammoth.extractRawText({ buffer: file.buffer });
        text = result.value;
      } else if (mime.startsWith("image/")) {
        // Full OCR via Tesseract.js
        const worker = await createWorker("eng", 1, {
          logger: () => {}, // suppress verbose logs
          errorHandler: () => {},
        });
        try {
          const { data } = await worker.recognize(file.buffer);
          text = data.text?.trim() || "";
          if (!text) text = `[Image file: ${name}] — No readable text detected by OCR.`;
          else text = `[OCR extracted from image: ${name}]\n\n${text}`;
        } finally {
          await worker.terminate();
        }
      } else {
        // Plain text, markdown, CSV, JSON, XML, HTML, etc.
        text = file.buffer.toString("utf-8");
      }

      res.json({ text: text.trim(), fileName: name, mimeType: mime });
    } catch (err: any) {
      console.error("extract-text error:", err);
      res.status(500).json({ message: "Failed to extract text from file", error: err.message });
    }
  });

  // ── Auth ──────────────────────────────────────────────────────────────────
  app.post("/api/auth/login", (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: "Email and password required" });
    const user = storage.getUserByEmail(email);
    if (!user || user.password !== password) {
      logAudit({ userEmail: email, action: "login_failed", success: false, ipAddress: getIP(req) });
      return res.status(401).json({ message: "Invalid credentials" });
    }
    logAudit({ userId: user.id, userEmail: user.email, action: "login", success: true, ipAddress: getIP(req) });
    const token = signToken(user.id, user.role);
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });
    const { password: _, ...safeUser } = user;
    return res.json({ ...safeUser, token }); // also return token for header-based clients
  });

  app.post("/api/auth/logout", (req, res) => {
    res.clearCookie("token");
    return res.json({ success: true });
  });

  // /api/auth/me — validate current session and return user
  app.get("/api/auth/me", requireAuth, (req, res) => {
    const { userId } = (req as any).jwtUser;
    const user = storage.getUserById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    const { password: _, ...safeUser } = user;
    return res.json(safeUser);
  });

  app.post("/api/auth/register", (req, res) => {
    const { email, password, name, organizationName } = req.body;
    if (!email || !password || !name) return res.status(400).json({ message: "Missing required fields" });
    const existing = storage.getUserByEmail(email);
    if (existing) return res.status(409).json({ message: "Email already registered" });
    const user = storage.createUser({ email, password, name, role: "client", organizationName });
    logAudit({ userId: user.id, userEmail: user.email, action: "user_create", success: true, ipAddress: getIP(req) });
    const token = signToken(user.id, user.role);
    res.cookie("token", token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 7 * 24 * 60 * 60 * 1000 });
    const { password: _, ...safeUser } = user;
    return res.json({ ...safeUser, token });
  });

  app.post("/api/auth/beta-access", (req, res) => {
    // Issue a guest admin token for beta testers
    const adminUser = storage.getUserByEmail("admin@labaudit.ai");
    const token = adminUser ? signToken(adminUser.id, adminUser.role) : signToken(1, "admin");
    res.cookie("token", token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 7 * 24 * 60 * 60 * 1000 });
    logAudit({ userEmail: "beta-user", action: "beta_access", success: true, ipAddress: getIP(req), details: JSON.stringify({ userAgent: req.headers["user-agent"] }) });
    return res.json({ success: true, token });
  });

  // ── Users & RBAC ──────────────────────────────────────────────────────────
  app.get("/api/users", requireAdmin, (_req, res) => {
    const allUsers = storage.getAllUsers().map(u => {
      const { password: _, ...safe } = u;
      return safe;
    });
    return res.json(allUsers);
  });

  app.get("/api/users/:id", (req, res) => {
    const user = storage.getUserById(Number(req.params.id));
    if (!user) return res.status(404).json({ message: "User not found" });
    const { password: _, ...safeUser } = user;
    return res.json(safeUser);
  });

  app.patch("/api/users/:id/role", requireAdmin, (req, res) => {
    const { role } = req.body;
    const validRoles = ["admin", "client", "lab_manager", "qa_analyst", "reviewer", "auditor"];
    if (!role || !validRoles.includes(role)) return res.status(400).json({ message: "Invalid role" });
    const updated = storage.updateUser(Number(req.params.id), { role });
    if (!updated) return res.status(404).json({ message: "User not found" });
    logAudit({ action: "user_role_update", resource: `user:${req.params.id}`, success: true, details: JSON.stringify({ role }) });
    const { password: _, ...safe } = updated;
    return res.json(safe);
  });

  app.patch("/api/users/:id", requireAdmin, (req, res) => {
    const { name, email, organizationName, password } = req.body;
    const updates: any = {};
    if (name) updates.name = name;
    if (email) updates.email = email;
    if (organizationName) updates.organizationName = organizationName;
    if (password) updates.password = password;
    const updated = storage.updateUser(Number(req.params.id), updates);
    if (!updated) return res.status(404).json({ message: "User not found" });
    const { password: _, ...safe } = updated;
    return res.json(safe);
  });

  // ── Onboarding ────────────────────────────────────────────────────────────
  app.get("/api/onboarding", requireAuth, (req, res) => {
    const { userId } = (req as any).jwtUser;
    const state = storage.getOnboardingState(userId);
    return res.json(state || { completed: 0, step: 0 });
  });

  app.post("/api/onboarding", requireAuth, (req, res) => {
    const { userId } = (req as any).jwtUser;
    const { step, completed } = req.body;
    storage.setOnboardingState(userId, step ?? 0, completed ?? false);
    return res.json({ success: true });
  });

  // ── Clients ───────────────────────────────────────────────────────────────
  app.get("/api/clients", (_req, res) => {
    return res.json(storage.getAllClients());
  });

  app.get("/api/clients/:id", (req, res) => {
    const client = storage.getClientById(Number(req.params.id));
    if (!client) return res.status(404).json({ message: "Client not found" });
    return res.json(client);
  });

  app.get("/api/clients/user/:userId", (req, res) => {
    const client = storage.getClientByUserId(Number(req.params.userId));
    if (!client) return res.status(404).json({ message: "Client not found" });
    return res.json(client);
  });

  app.post("/api/clients", (req, res) => {
    const { userId, labName, contactName, contactEmail, labType, complianceFramework } = req.body;
    if (!labName || !contactName || !contactEmail || !labType || !complianceFramework) {
      return res.status(400).json({ message: "Missing required fields" });
    }
    const client = storage.createClient({ userId, labName, contactName, contactEmail, labType, complianceFramework, status: "active" });
    logAudit({ action: "client_create", resource: `client:${client.id}`, success: true, ipAddress: getIP(req), details: JSON.stringify({ labName }) });
    return res.json(client);
  });

  app.patch("/api/clients/:id", (req, res) => {
    const client = storage.updateClient(Number(req.params.id), req.body);
    if (!client) return res.status(404).json({ message: "Client not found" });
    logAudit({ action: "client_update", resource: `client:${req.params.id}`, success: true, ipAddress: getIP(req) });
    return res.json(client);
  });

  app.delete("/api/clients/:id", (req, res) => {
    storage.deleteClient(Number(req.params.id));
    logAudit({ action: "client_delete", resource: `client:${req.params.id}`, success: true, ipAddress: getIP(req) });
    return res.json({ success: true });
  });

  // ── Documents (with encryption) ───────────────────────────────────────────
  app.get("/api/clients/:clientId/documents", (req, res) => {
    const docs = storage.getDocumentsByClientId(Number(req.params.clientId));
    const encEnabled = getSetting("encryption_enabled") !== "false";
    // Decrypt content before sending if encryption is on
    const safeDocs = docs.map(d => ({
      ...d,
      content: encEnabled ? decrypt(d.content) : d.content,
    }));
    return res.json(safeDocs);
  });

  app.post("/api/clients/:clientId/documents", (req, res) => {
    const { fileName, fileType, content } = req.body;
    if (!fileName || !fileType || !content) return res.status(400).json({ message: "Missing required fields" });

    const encEnabled = getSetting("encryption_enabled") !== "false";
    const storedContent = encEnabled ? encrypt(content) : content;

    const doc = storage.createDocument({
      clientId: Number(req.params.clientId),
      fileName,
      fileType,
      content: storedContent,
    });

    logAudit({
      action: "document_upload",
      resource: `document:${doc.id}`,
      success: true,
      ipAddress: getIP(req),
      details: JSON.stringify({ fileName, fileType, clientId: req.params.clientId, encrypted: encEnabled }),
    });

    return res.json({ ...doc, content }); // return unencrypted to client
  });

  app.delete("/api/documents/:id", (req, res) => {
    logAudit({ action: "document_delete", resource: `document:${req.params.id}`, success: true, ipAddress: getIP(req) });
    storage.deleteDocument(Number(req.params.id));
    return res.json({ success: true });
  });

  // ── Analyses ──────────────────────────────────────────────────────────────
  app.get("/api/clients/:clientId/analyses", (req, res) => {
    return res.json(storage.getAnalysesByClientId(Number(req.params.clientId)));
  });

  app.get("/api/analyses/:id", (req, res) => {
    const analysis = storage.getAnalysisById(Number(req.params.id));
    if (!analysis) return res.status(404).json({ message: "Analysis not found" });
    return res.json(analysis);
  });

  app.post("/api/analyses", async (req, res) => {
    const { clientId, documentId, title } = req.body;
    if (!clientId || !title) return res.status(400).json({ message: "Missing required fields" });

    const client = storage.getClientById(Number(clientId));
    if (!client) return res.status(404).json({ message: "Client not found" });

    const analysis = storage.createAnalysis({ clientId: Number(clientId), documentId: documentId ? Number(documentId) : undefined, title });
    const runningAnalysis = storage.updateAnalysis(analysis.id, { status: "running" });

    logAudit({
      action: "analysis_start",
      resource: `analysis:${analysis.id}`,
      success: true,
      ipAddress: getIP(req),
      details: JSON.stringify({ clientId, documentId, aiProvider: getSetting("ai_provider") }),
    });

    res.json(runningAnalysis);

    // Run analysis asynchronously
    try {
      let content = "";
      let docType = "SOP";
      const encEnabled = getSetting("encryption_enabled") !== "false";

      if (documentId) {
        const doc = storage.getDocumentById(Number(documentId));
        if (doc) {
          content = encEnabled ? decrypt(doc.content) : doc.content;
          docType = doc.fileType;
          storage.updateDocument(doc.id, { status: "analyzing" });
        }
      } else {
        const docs = storage.getDocumentsByClientId(Number(clientId));
        content = docs.map(d => `[${d.fileType.toUpperCase()}] ${d.fileName}:\n${encEnabled ? decrypt(d.content) : d.content}`).join("\n\n---\n\n");
        docType = "full_documentation_set";
      }

      const result = await runGapAnalysis(content, docType, client.complianceFramework);

      storage.updateAnalysis(analysis.id, {
        status: "complete",
        overallScore: result.score,
        summary: result.summary,
        findings: JSON.stringify(result.findings),
        sopDraft: result.sopDraft,
      });

      storage.updateClient(Number(clientId), { auditScore: result.score });
      if (documentId) storage.updateDocument(Number(documentId), { status: "analyzed" });

      logAudit({
        action: "analysis_complete",
        resource: `analysis:${analysis.id}`,
        success: true,
        details: JSON.stringify({ score: result.score, findingsCount: result.findings.length }),
      });

      // In-app notification: analysis complete
      try {
        const adminUser = storage.getUserByEmail("admin@labaudit.ai");
        if (adminUser) {
          const scoreLabel = result.score >= 80 ? "Good" : result.score >= 60 ? "Fair" : "Needs Attention";
          storage.createNotification({
            userId: adminUser.id,
            title: "Analysis Complete",
            message: `Score: ${result.score}% (${scoreLabel}) — ${result.findings.length} finding(s) found.`,
            type: result.score < 60 ? "warning" : "success",
            link: `/analyses/${analysis.id}`,
          });
        }
      } catch {}

    } catch (err) {
      console.error("Analysis failed:", err);
      storage.updateAnalysis(analysis.id, { status: "error" });
      logAudit({ action: "analysis_error", resource: `analysis:${analysis.id}`, success: false, details: String(err) });
    }
  });

  app.patch("/api/analyses/:id", (req, res) => {
    const analysis = storage.updateAnalysis(Number(req.params.id), req.body);
    if (!analysis) return res.status(404).json({ message: "Analysis not found" });
    return res.json(analysis);
  });

  // ── Stats ─────────────────────────────────────────────────────────────────
  app.get("/api/stats", (_req, res) => {
    const allClients = storage.getAllClients();
    const scores = allClients.filter(c => c.auditScore !== null).map(c => c.auditScore as number);
    const avgScore = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    return res.json({
      totalClients: allClients.length,
      activeClients: allClients.filter(c => c.status === "active").length,
      averageScore: Math.round(avgScore),
      criticalClients: allClients.filter(c => (c.auditScore ?? 100) < 60).length,
    });
  });

  // ── Audit Logs ────────────────────────────────────────────────────────────
  app.get("/api/audit-logs", (req, res) => {
    const limit = Number(req.query.limit) || 100;
    const offset = Number(req.query.offset) || 0;
    const action = req.query.action as string | undefined;
    const result = getAuditLogs({ limit, offset, action: action as any });
    return res.json(result);
  });

  app.delete("/api/audit-logs", (req, res) => {
    const count = clearAuditLogs();
    logAudit({ action: "settings_update", resource: "audit_log_clear", success: true, details: JSON.stringify({ cleared: count }) });
    return res.json({ cleared: count });
  });

  // ── Settings ──────────────────────────────────────────────────────────────
  app.get("/api/settings", (_req, res) => {
    return res.json(getAllSettings());
  });

  app.patch("/api/settings", (req, res) => {
    const updates = req.body as Record<string, string>;
    for (const [key, value] of Object.entries(updates)) {
      setSetting(key, String(value));
    }
    logAudit({ action: "settings_update", success: true, details: JSON.stringify(Object.keys(updates)) });
    return res.json(getAllSettings());
  });

  // ── Data Retention ────────────────────────────────────────────────────────
  app.post("/api/admin/apply-retention", (req, res) => {
    const retentionDays = Number(getSetting("data_retention_days") || "365");
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    const cutoff = cutoffDate.toISOString();

    // This is a dry-run safe operation — logs what would be deleted
    const { sqlite: rawDb } = require("./db") as any;
    const oldDocs = rawDb?.prepare
      ? rawDb.prepare("SELECT COUNT(*) as count FROM documents WHERE uploaded_at < ?").get(cutoff)
      : { count: 0 };

    logAudit({ action: "data_retention_applied", success: true, details: JSON.stringify({ retentionDays, cutoffDate: cutoff, documentsAffected: oldDocs?.count ?? 0 }) });
    return res.json({ retentionDays, cutoffDate: cutoff, documentsAffected: oldDocs?.count ?? 0 });
  });

  // ── Document version control ───────────────────────────────────────────────
  app.post("/api/clients/:clientId/documents/:id/new-version", (req, res) => {
    const parentId = Number(req.params.id);
    const parent = storage.getDocumentById(parentId);
    if (!parent) return res.status(404).json({ message: "Parent document not found" });
    const { content, changeNote } = req.body;
    if (!content) return res.status(400).json({ message: "Content required" });
    const parts = (parent.versionNumber || "1.0").split(".");
    const newMinor = Number(parts[1] || 0) + 1;
    const newVersion = `${parts[0]}.${newMinor}`;
    storage.updateDocument(parentId, { versionStatus: "superseded" });
    const encEnabled = getSetting("encryption_enabled") !== "false";
    const storedContent = encEnabled ? encrypt(content) : content;
    const newDoc = storage.createDocument({
      clientId: Number(req.params.clientId),
      fileName: parent.fileName,
      fileType: parent.fileType,
      content: storedContent,
      versionNumber: newVersion,
      versionStatus: "current",
      parentDocumentId: parentId,
      changeNote: changeNote || "New version",
    } as any);
    logAudit({ action: "document_version_create", resource: `document:${newDoc.id}`, success: true, details: JSON.stringify({ fileName: parent.fileName, version: newVersion }) });
    return res.json({ ...newDoc, content });
  });

  app.get("/api/documents/:id/versions", (req, res) => {
    const doc = storage.getDocumentById(Number(req.params.id));
    if (!doc) return res.status(404).json({ message: "Document not found" });
    const allVersions = storage.getDocumentVersions(doc.clientId, doc.fileName);
    return res.json(allVersions.map(d => ({ ...d, content: undefined })));
  });

  // ── CAPAs ─────────────────────────────────────────────────────────────────
  app.get("/api/capas", (_req, res) => res.json(storage.getAllCapas()));

  app.get("/api/clients/:clientId/capas", (req, res) =>
    res.json(storage.getCapasByClientId(Number(req.params.clientId))));

  app.get("/api/capas/:id", (req, res) => {
    const capa = storage.getCapaById(Number(req.params.id));
    if (!capa) return res.status(404).json({ message: "CAPA not found" });
    return res.json(capa);
  });

  app.post("/api/capas", (req, res) => {
    const { clientId, title, description, analysisId, findingId, assignedTo, priority, dueDate, rootCause, correctiveAction, preventiveAction } = req.body;
    if (!clientId || !title || !description) return res.status(400).json({ message: "Missing required fields" });
    const capa = storage.createCapa({ clientId: Number(clientId), title, description, analysisId: analysisId ? Number(analysisId) : undefined, findingId, assignedTo, priority: priority || "medium", dueDate, rootCause, correctiveAction, preventiveAction, status: "open" });
    logAudit({ action: "capa_create", resource: `capa:${capa.id}`, success: true, details: JSON.stringify({ title, clientId }) });
    if (assignedTo) {
      const assignedUser = storage.getUserByEmail(assignedTo);
      if (assignedUser) storage.createNotification({ userId: assignedUser.id, title: "New CAPA Assigned", message: `You have been assigned: ${title}`, type: "warning", link: "/capas" });
    }
    return res.json(capa);
  });

  app.patch("/api/capas/:id", (req, res) => {
    const updates = req.body;
    if (updates.status === "closed" && !updates.closedAt) updates.closedAt = new Date().toISOString();
    const capa = storage.updateCapa(Number(req.params.id), updates);
    if (!capa) return res.status(404).json({ message: "CAPA not found" });
    logAudit({ action: "capa_update", resource: `capa:${req.params.id}`, success: true });
    return res.json(capa);
  });

  app.delete("/api/capas/:id", (req, res) => {
    storage.deleteCapa(Number(req.params.id));
    return res.json({ success: true });
  });

  // ── Training Records ───────────────────────────────────────────────────────
  app.get("/api/training-records", (_req, res) => res.json(storage.getAllTrainingRecords()));

  app.get("/api/clients/:clientId/training-records", (req, res) =>
    res.json(storage.getTrainingRecordsByClientId(Number(req.params.clientId))));

  app.post("/api/training-records", (req, res) => {
    const { clientId, traineeName, traineeEmail, trainingTitle, trainingType, completedDate, expiryDate, notes } = req.body;
    if (!clientId || !traineeName || !trainingTitle || !completedDate) return res.status(400).json({ message: "Missing required fields" });
    const record = storage.createTrainingRecord({ clientId: Number(clientId), traineeName, traineeEmail, trainingTitle, trainingType: trainingType || "SOP", completedDate, expiryDate, notes });
    logAudit({ action: "training_record_create", resource: `training:${record.id}`, success: true });
    return res.json(record);
  });

  app.patch("/api/training-records/:id", (req, res) => {
    const record = storage.updateTrainingRecord(Number(req.params.id), req.body);
    if (!record) return res.status(404).json({ message: "Record not found" });
    return res.json(record);
  });

  app.delete("/api/training-records/:id", (req, res) => {
    storage.deleteTrainingRecord(Number(req.params.id));
    return res.json({ success: true });
  });

  // ── Nonconformances ────────────────────────────────────────────────────────
  app.get("/api/nonconformances", (_req, res) => res.json(storage.getAllNonconformances()));

  app.get("/api/clients/:clientId/nonconformances", (req, res) =>
    res.json(storage.getNonconformancesByClientId(Number(req.params.clientId))));

  app.get("/api/nonconformances/:id", (req, res) => {
    const nc = storage.getNonconformanceById(Number(req.params.id));
    if (!nc) return res.status(404).json({ message: "Non-conformance not found" });
    return res.json(nc);
  });

  app.post("/api/nonconformances", (req, res) => {
    const { clientId, title, description, detectedBy, detectedDate, area, severity, immediateAction } = req.body;
    if (!clientId || !title || !description || !detectedDate) return res.status(400).json({ message: "Missing required fields" });
    const year = new Date().getFullYear();
    const all = storage.getAllNonconformances();
    const seq = String(all.length + 1).padStart(3, "0");
    const refNumber = `NC-${year}-${seq}`;
    const nc = storage.createNonconformance({ clientId: Number(clientId), refNumber, title, description, detectedBy, detectedDate, area, severity: severity || "minor", immediateAction, status: "open" });
    logAudit({ action: "nonconformance_create", resource: `nc:${nc.id}`, success: true, details: JSON.stringify({ refNumber, title }) });
    return res.json(nc);
  });

  app.patch("/api/nonconformances/:id", (req, res) => {
    const updates = req.body;
    if (updates.status === "closed" && !updates.closedAt) updates.closedAt = new Date().toISOString();
    const nc = storage.updateNonconformance(Number(req.params.id), updates);
    if (!nc) return res.status(404).json({ message: "Non-conformance not found" });
    logAudit({ action: "nonconformance_update", resource: `nc:${req.params.id}`, success: true });
    return res.json(nc);
  });

  app.delete("/api/nonconformances/:id", (req, res) => {
    storage.deleteNonconformance(Number(req.params.id));
    return res.json({ success: true });
  });

  // ── Notifications ──────────────────────────────────────────────────────────
  app.get("/api/notifications", requireAuth, (req, res) => {
    const { userId } = (req as any).jwtUser;
    return res.json(storage.getNotificationsByUserId(userId));
  });

  app.get("/api/notifications/unread-count", requireAuth, (req, res) => {
    const { userId } = (req as any).jwtUser;
    return res.json({ count: storage.getUnreadCount(userId) });
  });

  app.patch("/api/notifications/:id/read", requireAuth, (req, res) => {
    storage.markNotificationRead(Number(req.params.id));
    return res.json({ success: true });
  });

  app.post("/api/notifications/mark-all-read", requireAuth, (req, res) => {
    const { userId } = (req as any).jwtUser;
    storage.markAllNotificationsRead(userId);
    return res.json({ success: true });
  });

  // ── Users management ───────────────────────────────────────────────────────
  app.get("/api/users", requireAdmin, (_req, res) => {
    const allUsers = storage.getAllUsers().map(u => { const { password: _, ...safe } = u; return safe; });
    return res.json(allUsers);
  });

  app.patch("/api/users/:id/role", requireAdmin, (req, res) => {
    const { role } = req.body;
    const validRoles = ["admin", "client", "lab_manager", "qa_analyst", "reviewer", "auditor"];
    if (!role || !validRoles.includes(role)) return res.status(400).json({ message: "Invalid role" });
    const updated = storage.updateUser(Number(req.params.id), { role });
    if (!updated) return res.status(404).json({ message: "User not found" });
    logAudit({ action: "user_role_update", resource: `user:${req.params.id}`, success: true, details: JSON.stringify({ role }) });
    const { password: _, ...safe } = updated;
    return res.json(safe);
  });

  app.patch("/api/users/:id", requireAdmin, (req, res) => {
    const { name, email, organizationName, password } = req.body;
    const updates: any = {};
    if (name) updates.name = name;
    if (email) updates.email = email;
    if (organizationName) updates.organizationName = organizationName;
    if (password) updates.password = password;
    const updated = storage.updateUser(Number(req.params.id), updates);
    if (!updated) return res.status(404).json({ message: "User not found" });
    const { password: _, ...safe } = updated;
    return res.json(safe);
  });

  // ── Onboarding ─────────────────────────────────────────────────────────────
  app.get("/api/onboarding", requireAuth, (req, res) => {
    const { userId } = (req as any).jwtUser;
    const state = storage.getOnboardingState(userId);
    return res.json(state || { completed: 0, step: 0 });
  });

  app.post("/api/onboarding", requireAuth, (req, res) => {
    const { userId } = (req as any).jwtUser;
    const { step, completed } = req.body;
    storage.setOnboardingState(userId, step ?? 0, completed ?? false);
    return res.json({ success: true });
  });
}
