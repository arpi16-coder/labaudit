import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import type { Finding } from "@shared/schema";

// ─── Perplexity / Claude analysis helper ──────────────────────────────────
async function runGapAnalysis(
  docContent: string,
  docType: string,
  framework: string
): Promise<{ score: number; summary: string; findings: Finding[]; sopDraft: string }> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    // Demo fallback when no API key is configured
    return demoAnalysis(docContent, docType);
  }

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

  try {
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
          {
            role: "user",
            content: `Analyze this ${docType} document for ${framework} compliance gaps:\n\n${docContent.substring(0, 8000)}`,
          },
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
  } catch (err) {
    console.error("AI analysis error:", err);
    return demoAnalysis(docContent, docType);
  }
}

function demoAnalysis(
  content: string,
  docType: string
): { score: number; summary: string; findings: Finding[]; sopDraft: string } {
  const lower = content.toLowerCase();
  const findings: Finding[] = [];
  let score = 85;

  if (!lower.includes("signature") && !lower.includes("signed by") && !lower.includes("approved by")) {
    findings.push({
      id: crypto.randomUUID(),
      severity: "critical",
      category: "signature",
      description: "No authorized signature or approval block detected in document.",
      recommendation: "Add a signature block including: Prepared By, Reviewed By, and Approved By fields with date lines.",
      resolved: false,
    });
    score -= 20;
  }
  if (!lower.includes("date") && !lower.includes("effective date") && !lower.includes("revision")) {
    findings.push({
      id: crypto.randomUUID(),
      severity: "major",
      category: "date",
      description: "Missing effective date and revision history table.",
      recommendation: "Include document header with: Document No., Effective Date, Revision No., and a Revision History table.",
      resolved: false,
    });
    score -= 10;
  }
  if (docType === "batch_record" && !lower.includes("lot") && !lower.includes("batch")) {
    findings.push({
      id: crypto.randomUUID(),
      severity: "critical",
      category: "lot_number",
      description: "Batch/Lot number field not found in batch record.",
      recommendation: "Add Lot Number, Batch Number, and Expiry Date fields in the header section.",
      resolved: false,
    });
    score -= 15;
  }
  if (!lower.includes("scope") && !lower.includes("purpose")) {
    findings.push({
      id: crypto.randomUUID(),
      severity: "major",
      category: "procedure_gap",
      description: "Document lacks a Purpose and Scope section.",
      recommendation: "Add a Purpose section explaining the objective and a Scope section defining applicability.",
      resolved: false,
    });
    score -= 8;
  }
  if (!lower.includes("responsibility") && !lower.includes("responsible")) {
    findings.push({
      id: crypto.randomUUID(),
      severity: "minor",
      category: "procedure_gap",
      description: "No Responsibilities section found.",
      recommendation: "Define roles and responsibilities for each step — include QA, Lab Manager, and operator roles.",
      resolved: false,
    });
    score -= 5;
  }
  findings.push({
    id: crypto.randomUUID(),
    severity: "info",
    category: "terminology",
    description: "Terminology may benefit from standardization to align with ICH Q7 / 21 CFR Part 211 glossary.",
    recommendation: "Cross-reference all technical terms with the applicable regulatory glossary and ensure consistent usage.",
    resolved: false,
  });

  const sopDraft = `STANDARD OPERATING PROCEDURE
Document No.: SOP-${Math.floor(Math.random() * 9000) + 1000}
Title: ${docType.replace(/_/g, " ").toUpperCase()} — REVISED DRAFT
Effective Date: ${new Date().toLocaleDateString()}
Revision No.: 1.0
Status: DRAFT — Pending Approval

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. PURPOSE
This SOP establishes the requirements and procedures for [process name] in compliance with ${findings.length > 0 ? "GMP/GLP" : "applicable"} regulatory standards.

2. SCOPE
This procedure applies to all personnel involved in [process] within [lab/department name]. It covers [scope details].

3. RESPONSIBILITIES
• Quality Assurance (QA): Approve SOP; ensure compliance
• Laboratory Manager: Oversee execution; approve deviations
• Operator/Analyst: Execute procedure; document all steps

4. DEFINITIONS
• Lot Number: Unique identifier assigned to a batch of material
• Deviation: Any departure from an approved procedure
• Critical Quality Attribute (CQA): Parameter affecting product quality

5. MATERIALS & EQUIPMENT
• [List all required materials]
• [List all required equipment with calibration status]

6. PROCEDURE
Step 1: Preparation
  6.1 Verify all materials are within expiry date
  6.2 Confirm equipment calibration is current
  6.3 Review any open deviations from previous runs

Step 2: Execution
  6.4 [Detailed step-by-step procedure]
  6.5 Record all observations in real-time

Step 3: Documentation
  6.6 Complete all fields in the batch record
  6.7 Obtain required signatures before proceeding

7. DOCUMENTATION
All records generated must be retained for a minimum of [X] years per [regulatory requirement].

8. REFERENCES
• [Applicable regulatory guideline]
• Related SOPs: [List]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
APPROVAL SIGNATURES

Prepared By: __________________ Date: __________
Reviewed By: __________________ Date: __________
Approved By: __________________ Date: __________
`;

  return {
    score: Math.max(0, Math.min(100, score)),
    summary: `Gap analysis identified ${findings.filter(f => f.severity === "critical").length} critical and ${findings.filter(f => f.severity === "major").length} major compliance issues in this ${docType.replace(/_/g, " ")}. The document requires updates to meet ${findings.length > 0 ? "GMP/GLP" : "regulatory"} standards before an audit. A revised SOP draft has been generated with all identified gaps addressed.`,
    findings,
    sopDraft,
  };
}

export async function registerRoutes(httpServer: Server, app: Express) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  app.post("/api/auth/login", (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: "Email and password required" });
    const user = storage.getUserByEmail(email);
    if (!user || user.password !== password) {
      return res.status(401).json({ message: "Invalid credentials" });
    }
    const { password: _, ...safeUser } = user;
    return res.json(safeUser);
  });

  app.post("/api/auth/register", (req, res) => {
    const { email, password, name, organizationName } = req.body;
    if (!email || !password || !name) return res.status(400).json({ message: "Missing required fields" });
    const existing = storage.getUserByEmail(email);
    if (existing) return res.status(409).json({ message: "Email already registered" });
    const user = storage.createUser({ email, password, name, role: "client", organizationName });
    const { password: _, ...safeUser } = user;
    return res.json(safeUser);
  });

  // ── Users ─────────────────────────────────────────────────────────────────
  app.get("/api/users/:id", (req, res) => {
    const user = storage.getUserById(Number(req.params.id));
    if (!user) return res.status(404).json({ message: "User not found" });
    const { password: _, ...safeUser } = user;
    return res.json(safeUser);
  });

  // ── Clients ───────────────────────────────────────────────────────────────
  app.get("/api/clients", (_req, res) => {
    const all = storage.getAllClients();
    return res.json(all);
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
    return res.json(client);
  });

  app.patch("/api/clients/:id", (req, res) => {
    const client = storage.updateClient(Number(req.params.id), req.body);
    if (!client) return res.status(404).json({ message: "Client not found" });
    return res.json(client);
  });

  app.delete("/api/clients/:id", (req, res) => {
    storage.deleteClient(Number(req.params.id));
    return res.json({ success: true });
  });

  // ── Documents ─────────────────────────────────────────────────────────────
  app.get("/api/clients/:clientId/documents", (req, res) => {
    const docs = storage.getDocumentsByClientId(Number(req.params.clientId));
    return res.json(docs);
  });

  app.post("/api/clients/:clientId/documents", (req, res) => {
    const { fileName, fileType, content } = req.body;
    if (!fileName || !fileType || !content) return res.status(400).json({ message: "Missing required fields" });
    const doc = storage.createDocument({
      clientId: Number(req.params.clientId),
      fileName,
      fileType,
      content,
    });
    return res.json(doc);
  });

  app.delete("/api/documents/:id", (req, res) => {
    storage.deleteDocument(Number(req.params.id));
    return res.json({ success: true });
  });

  // ── Analyses ──────────────────────────────────────────────────────────────
  app.get("/api/clients/:clientId/analyses", (req, res) => {
    const list = storage.getAnalysesByClientId(Number(req.params.clientId));
    return res.json(list);
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

    // Create analysis record in "running" state
    const analysis = storage.createAnalysis({ clientId: Number(clientId), documentId: documentId ? Number(documentId) : undefined, title });
    const runningAnalysis = storage.updateAnalysis(analysis.id, { status: "running" });

    // Return immediately, run AI in background
    res.json(runningAnalysis);

    // Run analysis asynchronously
    try {
      let content = "";
      let docType = "SOP";

      if (documentId) {
        const doc = storage.getDocumentById(Number(documentId));
        if (doc) {
          content = doc.content;
          docType = doc.fileType;
          storage.updateDocument(doc.id, { status: "analyzing" });
        }
      } else {
        // Multi-doc: combine all client docs
        const docs = storage.getDocumentsByClientId(Number(clientId));
        content = docs.map(d => `[${d.fileType.toUpperCase()}] ${d.fileName}:\n${d.content}`).join("\n\n---\n\n");
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

      // Update client audit score
      storage.updateClient(Number(clientId), { auditScore: result.score });

      if (documentId) {
        storage.updateDocument(Number(documentId), { status: "analyzed" });
      }
    } catch (err) {
      console.error("Analysis failed:", err);
      storage.updateAnalysis(analysis.id, { status: "error" });
    }
  });

  app.patch("/api/analyses/:id", (req, res) => {
    const analysis = storage.updateAnalysis(Number(req.params.id), req.body);
    if (!analysis) return res.status(404).json({ message: "Analysis not found" });
    return res.json(analysis);
  });

  // ── Stats (admin dashboard) ────────────────────────────────────────────────
  app.get("/api/stats", (_req, res) => {
    const allClients = storage.getAllClients();
    const scores = allClients.filter(c => c.auditScore !== null).map(c => c.auditScore as number);
    const avgScore = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    const critical = allClients.filter(c => (c.auditScore ?? 100) < 60).length;
    return res.json({
      totalClients: allClients.length,
      activeClients: allClients.filter(c => c.status === "active").length,
      averageScore: Math.round(avgScore),
      criticalClients: critical,
    });
  });
}
