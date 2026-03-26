import { db } from "./db";
import { users, clients, documents, analyses } from "@shared/schema";
import type { User, InsertUser, Client, InsertClient, Document, InsertDocument, Analysis, InsertAnalysis } from "@shared/schema";
import { eq, and } from "drizzle-orm";

export interface IStorage {
  // Users
  getUserById(id: number): User | undefined;
  getUserByEmail(email: string): User | undefined;
  createUser(data: InsertUser): User;

  // Clients
  getAllClients(): Client[];
  getClientById(id: number): Client | undefined;
  getClientByUserId(userId: number): Client | undefined;
  createClient(data: InsertClient): Client;
  updateClient(id: number, data: Partial<Client>): Client | undefined;
  deleteClient(id: number): void;

  // Documents
  getDocumentsByClientId(clientId: number): Document[];
  getDocumentById(id: number): Document | undefined;
  createDocument(data: InsertDocument & { status?: string }): Document;
  updateDocument(id: number, data: Partial<Document>): Document | undefined;
  deleteDocument(id: number): void;

  // Analyses
  getAnalysesByClientId(clientId: number): Analysis[];
  getAnalysisById(id: number): Analysis | undefined;
  createAnalysis(data: InsertAnalysis): Analysis;
  updateAnalysis(id: number, data: Partial<Analysis>): Analysis | undefined;
}

export class DatabaseStorage implements IStorage {
  // Users
  getUserById(id: number) {
    return db.select().from(users).where(eq(users.id, id)).get();
  }
  getUserByEmail(email: string) {
    return db.select().from(users).where(eq(users.email, email)).get();
  }
  createUser(data: InsertUser) {
    return db.insert(users).values(data).returning().get();
  }

  // Clients
  getAllClients() {
    return db.select().from(clients).all();
  }
  getClientById(id: number) {
    return db.select().from(clients).where(eq(clients.id, id)).get();
  }
  getClientByUserId(userId: number) {
    return db.select().from(clients).where(eq(clients.userId, userId)).get();
  }
  createClient(data: InsertClient) {
    return db.insert(clients).values(data).returning().get();
  }
  updateClient(id: number, data: Partial<Client>) {
    return db.update(clients).set(data).where(eq(clients.id, id)).returning().get();
  }
  deleteClient(id: number) {
    db.delete(clients).where(eq(clients.id, id)).run();
  }

  // Documents
  getDocumentsByClientId(clientId: number) {
    return db.select().from(documents).where(eq(documents.clientId, clientId)).all();
  }
  getDocumentById(id: number) {
    return db.select().from(documents).where(eq(documents.id, id)).get();
  }
  createDocument(data: InsertDocument & { status?: string }) {
    return db.insert(documents).values({ ...data, status: data.status || "pending" }).returning().get();
  }
  updateDocument(id: number, data: Partial<Document>) {
    return db.update(documents).set(data).where(eq(documents.id, id)).returning().get();
  }
  deleteDocument(id: number) {
    db.delete(documents).where(eq(documents.id, id)).run();
  }

  // Analyses
  getAnalysesByClientId(clientId: number) {
    return db.select().from(analyses).where(eq(analyses.clientId, clientId)).all();
  }
  getAnalysisById(id: number) {
    return db.select().from(analyses).where(eq(analyses.id, id)).get();
  }
  createAnalysis(data: InsertAnalysis) {
    return db.insert(analyses).values(data).returning().get();
  }
  updateAnalysis(id: number, data: Partial<Analysis>) {
    return db.update(analyses).set(data).where(eq(analyses.id, id)).returning().get();
  }
}

export const storage = new DatabaseStorage();
