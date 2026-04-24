import { db } from "./db";
import { users, clients, documents, analyses, capas, trainingRecords, nonconformances, notifications, onboardingState } from "@shared/schema";
import type { User, InsertUser, Client, InsertClient, Document, InsertDocument, Analysis, InsertAnalysis, Capa, InsertCapa, TrainingRecord, InsertTrainingRecord, Nonconformance, InsertNonconformance, Notification } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";

export interface IStorage {
  // Users
  getUserById(id: number): User | undefined;
  getUserByEmail(email: string): User | undefined;
  getAllUsers(): User[];
  createUser(data: InsertUser): User;
  updateUser(id: number, data: Partial<User>): User | undefined;

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
  getDocumentVersions(clientId: number, fileName: string): Document[];
  createDocument(data: InsertDocument & { status?: string; versionNumber?: string; versionStatus?: string; parentDocumentId?: number; changeNote?: string }): Document;
  updateDocument(id: number, data: Partial<Document>): Document | undefined;
  deleteDocument(id: number): void;

  // Analyses
  getAnalysesByClientId(clientId: number): Analysis[];
  getAllAnalyses(): Analysis[];
  getAnalysisById(id: number): Analysis | undefined;
  createAnalysis(data: InsertAnalysis): Analysis;
  updateAnalysis(id: number, data: Partial<Analysis>): Analysis | undefined;

  // CAPAs
  getCapasByClientId(clientId: number): Capa[];
  getAllCapas(): Capa[];
  getCapaById(id: number): Capa | undefined;
  createCapa(data: InsertCapa): Capa;
  updateCapa(id: number, data: Partial<Capa>): Capa | undefined;
  deleteCapa(id: number): void;

  // Training Records
  getTrainingRecordsByClientId(clientId: number): TrainingRecord[];
  getAllTrainingRecords(): TrainingRecord[];
  createTrainingRecord(data: InsertTrainingRecord): TrainingRecord;
  updateTrainingRecord(id: number, data: Partial<TrainingRecord>): TrainingRecord | undefined;
  deleteTrainingRecord(id: number): void;

  // Nonconformances
  getNonconformancesByClientId(clientId: number): Nonconformance[];
  getAllNonconformances(): Nonconformance[];
  getNonconformanceById(id: number): Nonconformance | undefined;
  createNonconformance(data: InsertNonconformance): Nonconformance;
  updateNonconformance(id: number, data: Partial<Nonconformance>): Nonconformance | undefined;
  deleteNonconformance(id: number): void;

  // Notifications
  getNotificationsByUserId(userId: number): Notification[];
  getUnreadCount(userId: number): number;
  createNotification(data: { userId: number; title: string; message: string; type?: string; link?: string }): Notification;
  markNotificationRead(id: number): void;
  markAllNotificationsRead(userId: number): void;

  // Onboarding
  getOnboardingState(userId: number): { completed: number; step: number } | undefined;
  setOnboardingState(userId: number, step: number, completed: boolean): void;
}

export class DatabaseStorage implements IStorage {
  // Users
  getUserById(id: number) {
    return db.select().from(users).where(eq(users.id, id)).get();
  }
  getUserByEmail(email: string) {
    return db.select().from(users).where(eq(users.email, email)).get();
  }
  getAllUsers() {
    return db.select().from(users).all();
  }
  createUser(data: InsertUser) {
    return db.insert(users).values(data).returning().get();
  }
  updateUser(id: number, data: Partial<User>) {
    return db.update(users).set(data).where(eq(users.id, id)).returning().get();
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
  getDocumentVersions(clientId: number, fileName: string) {
    return db.select().from(documents)
      .where(and(eq(documents.clientId, clientId), eq(documents.fileName, fileName)))
      .all();
  }
  createDocument(data: InsertDocument & { status?: string; versionNumber?: string; versionStatus?: string; parentDocumentId?: number; changeNote?: string }) {
    return db.insert(documents).values({
      ...data,
      status: data.status || "pending",
      versionNumber: data.versionNumber || "1.0",
      versionStatus: data.versionStatus || "current",
    }).returning().get();
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
  getAllAnalyses() {
    return db.select().from(analyses).all();
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

  // CAPAs
  getCapasByClientId(clientId: number) {
    return db.select().from(capas).where(eq(capas.clientId, clientId)).all();
  }
  getAllCapas() {
    return db.select().from(capas).all();
  }
  getCapaById(id: number) {
    return db.select().from(capas).where(eq(capas.id, id)).get();
  }
  createCapa(data: InsertCapa) {
    return db.insert(capas).values(data).returning().get();
  }
  updateCapa(id: number, data: Partial<Capa>) {
    return db.update(capas).set(data).where(eq(capas.id, id)).returning().get();
  }
  deleteCapa(id: number) {
    db.delete(capas).where(eq(capas.id, id)).run();
  }

  // Training Records
  getTrainingRecordsByClientId(clientId: number) {
    return db.select().from(trainingRecords).where(eq(trainingRecords.clientId, clientId)).all();
  }
  getAllTrainingRecords() {
    return db.select().from(trainingRecords).all();
  }
  createTrainingRecord(data: InsertTrainingRecord) {
    // Auto-compute status based on expiry
    let status = "active";
    if (data.expiryDate) {
      const expiry = new Date(data.expiryDate);
      const now = new Date();
      const daysUntilExpiry = (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      if (daysUntilExpiry < 0) status = "expired";
      else if (daysUntilExpiry <= 30) status = "expiring_soon";
    }
    return db.insert(trainingRecords).values({ ...data, status }).returning().get();
  }
  updateTrainingRecord(id: number, data: Partial<TrainingRecord>) {
    return db.update(trainingRecords).set(data).where(eq(trainingRecords.id, id)).returning().get();
  }
  deleteTrainingRecord(id: number) {
    db.delete(trainingRecords).where(eq(trainingRecords.id, id)).run();
  }

  // Nonconformances
  getNonconformancesByClientId(clientId: number) {
    return db.select().from(nonconformances).where(eq(nonconformances.clientId, clientId)).all();
  }
  getAllNonconformances() {
    return db.select().from(nonconformances).all();
  }
  getNonconformanceById(id: number) {
    return db.select().from(nonconformances).where(eq(nonconformances.id, id)).get();
  }
  createNonconformance(data: InsertNonconformance) {
    return db.insert(nonconformances).values(data).returning().get();
  }
  updateNonconformance(id: number, data: Partial<Nonconformance>) {
    return db.update(nonconformances).set(data).where(eq(nonconformances.id, id)).returning().get();
  }
  deleteNonconformance(id: number) {
    db.delete(nonconformances).where(eq(nonconformances.id, id)).run();
  }

  // Notifications
  getNotificationsByUserId(userId: number) {
    return db.select().from(notifications).where(eq(notifications.userId, userId)).all();
  }
  getUnreadCount(userId: number) {
    return db.select().from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.read, 0)))
      .all().length;
  }
  createNotification(data: { userId: number; title: string; message: string; type?: string; link?: string }) {
    return db.insert(notifications).values({
      userId: data.userId,
      title: data.title,
      message: data.message,
      type: data.type || "info",
      link: data.link,
    }).returning().get();
  }
  markNotificationRead(id: number) {
    db.update(notifications).set({ read: 1 }).where(eq(notifications.id, id)).run();
  }
  markAllNotificationsRead(userId: number) {
    db.update(notifications).set({ read: 1 }).where(eq(notifications.userId, userId)).run();
  }

  // Onboarding
  getOnboardingState(userId: number) {
    return db.select().from(onboardingState).where(eq(onboardingState.userId, userId)).get();
  }
  setOnboardingState(userId: number, step: number, completed: boolean) {
    const existing = db.select().from(onboardingState).where(eq(onboardingState.userId, userId)).get();
    if (existing) {
      db.update(onboardingState).set({
        step,
        completed: completed ? 1 : 0,
        completedAt: completed ? new Date().toISOString() : undefined,
      }).where(eq(onboardingState.userId, userId)).run();
    } else {
      db.insert(onboardingState).values({
        userId,
        step,
        completed: completed ? 1 : 0,
        completedAt: completed ? new Date().toISOString() : undefined,
      }).run();
    }
  }
}

export const storage = new DatabaseStorage();
