import admin from 'firebase-admin';
import { FieldValue } from '@google-cloud/firestore';
import type { Category, DmNote, Memory, Project } from '../src/types/neophi.js';
import { ensureFirebaseAdmin } from './firebase.js';
import {
  applyAnalysis,
  buildAnalysisJob,
  clearedPayload,
  eventIdForMemory,
  finalizeShare,
  leaseJob,
  noteAttachment,
  plain,
  settleJob,
  shareFinalized,
  analysisJobId,
  type InstagramAnalysisPatch,
  type InstagramCounts,
  type InstagramEventRecord,
  type InstagramJob,
  type JobSettlement,
  type NoteOutcome,
  type ShareFinalizeInput,
} from './instagram/model.js';
import type { InstagramLinkCodeRecord, InstagramLinkRecord } from './instagram/link.js';

export interface StoredMemory extends Memory {
  embedding?: number[] | null;
}

export interface VectorSearchHit {
  memory: Memory;
  distance: number;
}

export interface NeophiStore {
  listMemories(uid: string): Promise<Memory[]>;
  getMemory(uid: string, id: string): Promise<Memory | null>;
  saveMemory(uid: string, memory: Memory, embedding?: number[] | null): Promise<void>;
  updateMemory(
    uid: string,
    id: string,
    patch: Partial<Memory>,
    embedding?: number[] | null
  ): Promise<Memory | null>;
  deleteMemory(uid: string, id: string): Promise<boolean>;
  findNearestMemories(uid: string, queryVector: number[], limit: number): Promise<VectorSearchHit[]>;

  listCategories(uid: string): Promise<Category[]>;
  saveCategory(uid: string, category: Category): Promise<void>;
  updateCategory(uid: string, id: string, name: string): Promise<Category | null>;

  listProjects(uid: string): Promise<Project[]>;
  getProject(uid: string, id: string): Promise<Project | null>;
  saveProject(uid: string, project: Project): Promise<void>;
  updateProject(uid: string, id: string, patch: Partial<Project>): Promise<Project | null>;

  exportAll(uid: string): Promise<{ memories: Memory[]; categories: Category[]; projects: Project[] }>;
  deleteAllUserData(uid: string): Promise<void>;

  // Instagram DM pipeline. Server-only records; never returned to a browser.
  /** Durable intake: creates the event and its job atomically, or reports a duplicate delivery. */
  recordInstagramEvent(event: InstagramEventRecord, job: InstagramJob): Promise<'created' | 'duplicate'>;
  getInstagramEvent(eventId: string): Promise<InstagramEventRecord | null>;
  /** Drops the restricted payload (attachment URL, caption, note text) once it has been processed. */
  clearInstagramEventPayload(eventId: string): Promise<void>;
  leaseInstagramJobs(nowMs: number, leaseMs: number, limit: number, leaseId: string): Promise<InstagramJob[]>;
  settleInstagramJob(jobId: string, leaseId: string, settlement: JobSettlement, nowMs: number): Promise<boolean>;
  /** Most recent share event from this sender to this recipient at or before `atMs`, within `windowMs`. */
  findPrecedingInstagramShare(
    recipientId: string,
    senderId: string,
    atMs: number,
    windowMs: number
  ): Promise<InstagramEventRecord | null>;
  /** Transactional reservation of exactly one memory per share event. A deleted share is never recreated. */
  reserveInstagramShare(
    eventId: string,
    uid: string,
    memory: Memory
  ): Promise<{ state: 'created' | 'existing' | 'deleted'; memory: Memory | null }>;
  /** Records the media outcome and queues analysis (unless private). `ok` is false if the memory is gone. */
  finalizeInstagramShare(
    uid: string,
    memoryId: string,
    input: ShareFinalizeInput,
    nowMs: number
  ): Promise<{ ok: boolean; alreadyFinal: boolean }>;
  attachInstagramNote(uid: string, memoryId: string, note: DmNote, nowMs: number): Promise<NoteOutcome | 'gone'>;
  /** Stores an analysis only if the memory still exists, is not private and is still at `generation`. */
  applyInstagramAnalysis(
    uid: string,
    memoryId: string,
    generation: number,
    patch: InstagramAnalysisPatch,
    embedding: number[] | null,
    nowMs: number
  ): Promise<boolean>;
  /** Tombstones the share behind a DM memory and cancels its analysis job. No-op for other memories. */
  markInstagramShareDeleted(uid: string, memoryId: string): Promise<void>;
  instagramCounts(): Promise<InstagramCounts>;

  // Self-serve Instagram linking: a signed-in user gets a one-time code; sending it by DM binds that sender to them.
  /** Stores a new live code for the user and drops their earlier ones (one live code per user). */
  createInstagramLinkCode(record: InstagramLinkCodeRecord): Promise<void>;
  /**
   * Consumes a code exactly once. A valid, unexpired code binds `senderId` to the code's owner (replacing any
   * previous link of that owner) and returns the link; anything else returns null.
   */
  redeemInstagramLinkCode(codeHash: string, senderId: string, nowMs: number): Promise<InstagramLinkRecord | null>;
  getInstagramLinkBySender(senderId: string): Promise<InstagramLinkRecord | null>;
  getInstagramLinkForUser(uid: string): Promise<InstagramLinkRecord | null>;
  /** Removes the user's link and any unused codes. Returns whether a link existed. */
  removeInstagramLinkForUser(uid: string): Promise<boolean>;
}

function stripEmbedding(docData: Record<string, unknown>): Memory {
  const copy = { ...docData };
  delete copy.embedding;
  return copy as unknown as Memory;
}

function cosineDistance(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 1;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 1;
  return 1 - dot / denom;
}

export class FirestoreStore implements NeophiStore {
  private db: admin.firestore.Firestore;

  constructor(db: admin.firestore.Firestore) {
    this.db = db;
  }

  private memoriesCol(uid: string) {
    return this.db.collection('users').doc(uid).collection('memories');
  }

  private categoriesCol(uid: string) {
    return this.db.collection('users').doc(uid).collection('categories');
  }

  private projectsCol(uid: string) {
    return this.db.collection('users').doc(uid).collection('projects');
  }

  async listMemories(uid: string): Promise<Memory[]> {
    const snap = await this.memoriesCol(uid).orderBy('createdAt', 'desc').get();
    return snap.docs.map((d) => stripEmbedding(d.data()));
  }

  async getMemory(uid: string, id: string): Promise<Memory | null> {
    const doc = await this.memoriesCol(uid).doc(id).get();
    if (!doc.exists) return null;
    return stripEmbedding(doc.data() ?? {});
  }

  async saveMemory(uid: string, memory: Memory, embedding?: number[] | null): Promise<void> {
    const payload: Record<string, unknown> = { ...memory };
    if (embedding && embedding.length > 0) {
      payload.embedding = FieldValue.vector(embedding);
    } else {
      payload.embedding = null;
    }
    await this.memoriesCol(uid).doc(memory.id).set(payload);
  }

  async updateMemory(
    uid: string,
    id: string,
    patch: Partial<Memory>,
    embedding?: number[] | null
  ): Promise<Memory | null> {
    const ref = this.memoriesCol(uid).doc(id);
    const existing = await ref.get();
    if (!existing.exists) return null;

    const updatePayload: Record<string, unknown> = {
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    if (embedding !== undefined) {
      updatePayload.embedding =
        embedding && embedding.length > 0 ? FieldValue.vector(embedding) : null;
    }

    await ref.update(updatePayload);
    const updated = await ref.get();
    return stripEmbedding(updated.data() ?? {});
  }

  async deleteMemory(uid: string, id: string): Promise<boolean> {
    const ref = this.memoriesCol(uid).doc(id);
    const doc = await ref.get();
    if (!doc.exists) return false;
    await ref.delete();
    return true;
  }

  async findNearestMemories(
    uid: string,
    queryVector: number[],
    limit: number
  ): Promise<VectorSearchHit[]> {
    const col = this.memoriesCol(uid);
    const vectorQuery = col.findNearest({
      vectorField: 'embedding',
      queryVector: FieldValue.vector(queryVector),
      limit,
      distanceMeasure: 'COSINE',
      distanceResultField: '_distance',
    });
    const snap = await vectorQuery.get();
    return snap.docs.map((d) => {
      const data = d.data();
      const distance = typeof data._distance === 'number' ? data._distance : 1;
      delete data._distance;
      return {
        memory: stripEmbedding(data),
        distance,
      };
    });
  }

  async listCategories(uid: string): Promise<Category[]> {
    const snap = await this.categoriesCol(uid).orderBy('createdAt', 'asc').get();
    return snap.docs.map((d) => d.data() as Category);
  }

  async saveCategory(uid: string, category: Category): Promise<void> {
    await this.categoriesCol(uid).doc(category.id).set(category);
  }

  async updateCategory(uid: string, id: string, name: string): Promise<Category | null> {
    const ref = this.categoriesCol(uid).doc(id);
    const doc = await ref.get();
    if (!doc.exists) return null;
    await ref.update({ name });
    const updated = await ref.get();
    return updated.data() as Category;
  }

  async listProjects(uid: string): Promise<Project[]> {
    const snap = await this.projectsCol(uid).orderBy('createdAt', 'asc').get();
    return snap.docs.map((d) => d.data() as Project);
  }

  async getProject(uid: string, id: string): Promise<Project | null> {
    const doc = await this.projectsCol(uid).doc(id).get();
    if (!doc.exists) return null;
    return doc.data() as Project;
  }

  async saveProject(uid: string, project: Project): Promise<void> {
    await this.projectsCol(uid).doc(project.id).set(project);
  }

  async updateProject(uid: string, id: string, patch: Partial<Project>): Promise<Project | null> {
    const ref = this.projectsCol(uid).doc(id);
    const doc = await ref.get();
    if (!doc.exists) return null;
    await ref.update({ ...patch, updatedAt: new Date().toISOString() });
    const updated = await ref.get();
    return updated.data() as Project;
  }

  async exportAll(uid: string) {
    const [memories, categories, projects] = await Promise.all([
      this.listMemories(uid),
      this.listCategories(uid),
      this.listProjects(uid),
    ]);
    return { memories, categories, projects };
  }

  async deleteAllUserData(uid: string): Promise<void> {
    await this.removeInstagramLinkForUser(uid);
    await this.tombstoneAllInstagramShares(uid);
    const collections = [this.memoriesCol(uid), this.categoriesCol(uid), this.projectsCol(uid)];
    for (const col of collections) {
      const snap = await col.get();
      if (snap.empty) continue;
      const batch = this.db.batch();
      for (const doc of snap.docs) {
        batch.delete(doc.ref);
      }
      await batch.commit();
    }
    await this.db.collection('users').doc(uid).delete().catch(() => {});
  }

  // ---------- Instagram DM pipeline ----------
  private igEvents() {
    return this.db.collection('instagramEvents');
  }

  private igJobs() {
    return this.db.collection('instagramJobs');
  }

  private igLinkCodes() {
    return this.db.collection('instagramLinkCodes');
  }

  private igLinks() {
    return this.db.collection('instagramLinks');
  }

  private static toFs<T extends { expireAtMs: number }>(record: T): Record<string, unknown> {
    // `expireAt` is a real timestamp so a Firestore TTL policy can delete the record.
    return { ...plain(record), expireAt: new Date(record.expireAtMs) };
  }

  private static fromFs<T>(data: Record<string, unknown> | undefined): T {
    const copy = { ...(data ?? {}) };
    delete copy.expireAt;
    return copy as T;
  }

  private memoryPayload(memory: Memory, embedding?: number[] | null): Record<string, unknown> {
    const payload: Record<string, unknown> = plain(memory) as unknown as Record<string, unknown>;
    if (embedding !== undefined) {
      payload.embedding = embedding && embedding.length > 0 ? FieldValue.vector(embedding) : null;
    }
    return payload;
  }

  async recordInstagramEvent(event: InstagramEventRecord, job: InstagramJob): Promise<'created' | 'duplicate'> {
    return this.db.runTransaction(async (tx) => {
      const ref = this.igEvents().doc(event.id);
      const existing = await tx.get(ref);
      if (existing.exists) return 'duplicate';
      tx.create(ref, FirestoreStore.toFs(event));
      tx.set(this.igJobs().doc(job.id), FirestoreStore.toFs(job));
      return 'created';
    });
  }

  async getInstagramEvent(eventId: string): Promise<InstagramEventRecord | null> {
    const doc = await this.igEvents().doc(eventId).get();
    return doc.exists ? FirestoreStore.fromFs<InstagramEventRecord>(doc.data()) : null;
  }

  async clearInstagramEventPayload(eventId: string): Promise<void> {
    await this.db.runTransaction(async (tx) => {
      const ref = this.igEvents().doc(eventId);
      const doc = await tx.get(ref);
      if (!doc.exists) return;
      const cleared = clearedPayload(FirestoreStore.fromFs<InstagramEventRecord>(doc.data()));
      tx.set(ref, FirestoreStore.toFs(cleared));
    });
  }

  async leaseInstagramJobs(nowMs: number, leaseMs: number, limit: number, leaseId: string): Promise<InstagramJob[]> {
    const snap = await this.igJobs()
      .where('status', 'in', ['queued', 'leased'])
      .where('nextRunAt', '<=', nowMs)
      .orderBy('nextRunAt', 'asc')
      .limit(limit)
      .get();
    const leased: InstagramJob[] = [];
    for (const candidate of snap.docs) {
      const job = await this.db.runTransaction(async (tx) => {
        const doc = await tx.get(candidate.ref);
        if (!doc.exists) return null;
        const next = leaseJob(FirestoreStore.fromFs<InstagramJob>(doc.data()), nowMs, leaseMs, leaseId);
        if (next) tx.set(candidate.ref, FirestoreStore.toFs(next));
        return next;
      });
      if (job) leased.push(job);
    }
    return leased;
  }

  async settleInstagramJob(jobId: string, leaseId: string, settlement: JobSettlement, nowMs: number): Promise<boolean> {
    return this.db.runTransaction(async (tx) => {
      const ref = this.igJobs().doc(jobId);
      const doc = await tx.get(ref);
      if (!doc.exists) return false;
      const next = settleJob(FirestoreStore.fromFs<InstagramJob>(doc.data()), leaseId, settlement, nowMs);
      if (!next) return false;
      tx.set(ref, FirestoreStore.toFs(next));
      return true;
    });
  }

  async findPrecedingInstagramShare(
    recipientId: string,
    senderId: string,
    atMs: number,
    windowMs: number
  ): Promise<InstagramEventRecord | null> {
    const snap = await this.igEvents()
      .where('kind', '==', 'share')
      .where('recipientId', '==', recipientId)
      .where('senderId', '==', senderId)
      .where('timestampMs', '<=', atMs)
      .where('timestampMs', '>=', atMs - windowMs)
      .orderBy('timestampMs', 'desc')
      .limit(1)
      .get();
    return snap.empty ? null : FirestoreStore.fromFs<InstagramEventRecord>(snap.docs[0].data());
  }

  async reserveInstagramShare(eventId: string, uid: string, memory: Memory) {
    return this.db.runTransaction(async (tx) => {
      const evRef = this.igEvents().doc(eventId);
      const memRef = this.memoriesCol(uid).doc(memory.id);
      const [ev, mem] = await Promise.all([tx.get(evRef), tx.get(memRef)]);
      if (!ev.exists) throw new Error('instagram event missing');
      const event = FirestoreStore.fromFs<InstagramEventRecord>(ev.data());
      if (event.uid !== uid || event.shareState === 'deleted') return { state: 'deleted' as const, memory: null };
      if (event.shareState === 'active') {
        return mem.exists
          ? { state: 'existing' as const, memory: stripEmbedding(mem.data() ?? {}) }
          : { state: 'deleted' as const, memory: null };
      }
      tx.set(memRef, this.memoryPayload(memory, null));
      tx.set(evRef, FirestoreStore.toFs({ ...event, shareState: 'active', memoryId: memory.id }));
      return { state: 'created' as const, memory };
    });
  }

  async finalizeInstagramShare(uid: string, memoryId: string, input: ShareFinalizeInput, nowMs: number) {
    return this.db.runTransaction(async (tx) => {
      const memRef = this.memoriesCol(uid).doc(memoryId);
      const doc = await tx.get(memRef);
      if (!doc.exists) return { ok: false, alreadyFinal: false };
      const raw = doc.data() ?? {};
      const next = finalizeShare(stripEmbedding(raw), input, new Date(nowMs).toISOString());
      if (!next) return { ok: true, alreadyFinal: true };
      tx.set(memRef, { ...this.memoryPayload(next), embedding: raw.embedding ?? null });
      if (!next.privateNoAI && next.dm) {
        const job = buildAnalysisJob(uid, memoryId, next.dm.analysisGeneration, nowMs);
        tx.set(this.igJobs().doc(job.id), FirestoreStore.toFs(job));
      }
      return { ok: true, alreadyFinal: false };
    });
  }

  async attachInstagramNote(uid: string, memoryId: string, note: DmNote, nowMs: number) {
    return this.db.runTransaction(async (tx) => {
      const memRef = this.memoriesCol(uid).doc(memoryId);
      const doc = await tx.get(memRef);
      if (!doc.exists) return 'gone' as const;
      const raw = doc.data() ?? {};
      const { outcome, next } = noteAttachment(stripEmbedding(raw), note, new Date(nowMs).toISOString());
      if (outcome === 'duplicate') return outcome;
      const queue = outcome === 'primary' && !next.privateNoAI && shareFinalized(next) && next.dm;
      const stored = queue ? { ...next, analysisStatus: 'pending' as const } : next;
      // Keep the existing embedding untouched; the reanalysis replaces it.
      tx.set(memRef, { ...this.memoryPayload(stored), embedding: raw.embedding ?? null });
      if (queue && next.dm) {
        const job = buildAnalysisJob(uid, memoryId, next.dm.analysisGeneration, nowMs);
        tx.set(this.igJobs().doc(job.id), FirestoreStore.toFs(job));
      }
      return outcome;
    });
  }

  async applyInstagramAnalysis(
    uid: string,
    memoryId: string,
    generation: number,
    patch: InstagramAnalysisPatch,
    embedding: number[] | null,
    nowMs: number
  ): Promise<boolean> {
    return this.db.runTransaction(async (tx) => {
      const memRef = this.memoriesCol(uid).doc(memoryId);
      const doc = await tx.get(memRef);
      if (!doc.exists) return false;
      const next = applyAnalysis(stripEmbedding(doc.data() ?? {}), generation, patch, new Date(nowMs).toISOString());
      if (!next) return false;
      tx.set(memRef, this.memoryPayload(next, embedding));
      return true;
    });
  }

  async markInstagramShareDeleted(uid: string, memoryId: string): Promise<void> {
    const eventId = eventIdForMemory(memoryId);
    if (!eventId) return;
    await this.db.runTransaction(async (tx) => {
      const ref = this.igEvents().doc(eventId);
      const doc = await tx.get(ref);
      if (doc.exists) {
        const event = FirestoreStore.fromFs<InstagramEventRecord>(doc.data());
        if (event.uid === uid) {
          tx.set(ref, FirestoreStore.toFs({ ...clearedPayload(event), shareState: 'deleted' }));
        }
      }
      tx.delete(this.igJobs().doc(analysisJobId(memoryId)));
    });
  }

  private async tombstoneAllInstagramShares(uid: string): Promise<void> {
    const [events, jobs] = await Promise.all([
      this.igEvents().where('uid', '==', uid).get(),
      this.igJobs().where('uid', '==', uid).get(),
    ]);
    const writes: Array<(b: admin.firestore.WriteBatch) => void> = [];
    for (const doc of events.docs) {
      const event = FirestoreStore.fromFs<InstagramEventRecord>(doc.data());
      const next = event.kind === 'share' ? { ...clearedPayload(event), shareState: 'deleted' as const } : clearedPayload(event);
      writes.push((b) => b.set(doc.ref, FirestoreStore.toFs(next)));
    }
    for (const doc of jobs.docs) writes.push((b) => b.delete(doc.ref));
    for (let i = 0; i < writes.length; i += 400) {
      const batch = this.db.batch();
      for (const w of writes.slice(i, i + 400)) w(batch);
      await batch.commit();
    }
  }

  async instagramCounts(): Promise<InstagramCounts> {
    const count = async (q: admin.firestore.Query) => (await q.count().get()).data().count;
    const ev = this.igEvents();
    const jobs = this.igJobs();
    const [shares, notes, activeShares, deletedShares, queued, leased, done, dead] = await Promise.all([
      count(ev.where('kind', '==', 'share')),
      count(ev.where('kind', '==', 'note')),
      count(ev.where('shareState', '==', 'active')),
      count(ev.where('shareState', '==', 'deleted')),
      count(jobs.where('status', '==', 'queued')),
      count(jobs.where('status', '==', 'leased')),
      count(jobs.where('status', '==', 'done')),
      count(jobs.where('status', '==', 'dead')),
    ]);
    return { events: { shares, notes, activeShares, deletedShares }, jobs: { queued, leased, done, dead } };
  }

  // ---------- Instagram linking ----------
  async createInstagramLinkCode(record: InstagramLinkCodeRecord): Promise<void> {
    const earlier = await this.igLinkCodes().where('uid', '==', record.uid).get();
    const batch = this.db.batch();
    for (const doc of earlier.docs) batch.delete(doc.ref);
    batch.set(this.igLinkCodes().doc(record.id), FirestoreStore.toFs(record));
    await batch.commit();
  }

  async redeemInstagramLinkCode(codeHash: string, senderId: string, nowMs: number): Promise<InstagramLinkRecord | null> {
    return this.db.runTransaction(async (tx) => {
      const codeRef = this.igLinkCodes().doc(codeHash);
      const codeDoc = await tx.get(codeRef);
      if (!codeDoc.exists) return null;
      const code = FirestoreStore.fromFs<InstagramLinkCodeRecord>(codeDoc.data());
      const ownersLinks = await tx.get(this.igLinks().where('uid', '==', code.uid));
      tx.delete(codeRef); // single use, whether or not it was still valid
      if (code.expiresAtMs <= nowMs) return null;
      for (const doc of ownersLinks.docs) if (doc.id !== senderId) tx.delete(doc.ref);
      const link: InstagramLinkRecord = { senderId, uid: code.uid, linkedAtMs: nowMs };
      tx.set(this.igLinks().doc(senderId), link);
      return link;
    });
  }

  async getInstagramLinkBySender(senderId: string): Promise<InstagramLinkRecord | null> {
    const doc = await this.igLinks().doc(senderId).get();
    return doc.exists ? (doc.data() as InstagramLinkRecord) : null;
  }

  async getInstagramLinkForUser(uid: string): Promise<InstagramLinkRecord | null> {
    const snap = await this.igLinks().where('uid', '==', uid).limit(1).get();
    return snap.empty ? null : (snap.docs[0].data() as InstagramLinkRecord);
  }

  async removeInstagramLinkForUser(uid: string): Promise<boolean> {
    const [links, codes] = await Promise.all([
      this.igLinks().where('uid', '==', uid).get(),
      this.igLinkCodes().where('uid', '==', uid).get(),
    ]);
    if (links.empty && codes.empty) return false;
    const batch = this.db.batch();
    for (const doc of links.docs) batch.delete(doc.ref);
    for (const doc of codes.docs) batch.delete(doc.ref);
    await batch.commit();
    return !links.empty;
  }
}

interface UserBucket {
  memories: Map<string, StoredMemory>;
  categories: Map<string, Category>;
  projects: Map<string, Project>;
}

export class InMemoryStore implements NeophiStore {
  private users = new Map<string, UserBucket>();

  private bucket(uid: string): UserBucket {
    let b = this.users.get(uid);
    if (!b) {
      b = {
        memories: new Map(),
        categories: new Map(),
        projects: new Map(),
      };
      this.users.set(uid, b);
    }
    return b;
  }

  async listMemories(uid: string): Promise<Memory[]> {
    return Array.from(this.bucket(uid).memories.values())
      .map((m) => stripEmbedding(m as unknown as Record<string, unknown>))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getMemory(uid: string, id: string): Promise<Memory | null> {
    const m = this.bucket(uid).memories.get(id);
    return m ? stripEmbedding(m as unknown as Record<string, unknown>) : null;
  }

  async saveMemory(uid: string, memory: Memory, embedding?: number[] | null): Promise<void> {
    this.bucket(uid).memories.set(memory.id, {
      ...structuredClone(memory),
      embedding: embedding ? [...embedding] : null,
    });
  }

  async updateMemory(
    uid: string,
    id: string,
    patch: Partial<Memory>,
    embedding?: number[] | null
  ): Promise<Memory | null> {
    const existing = this.bucket(uid).memories.get(id);
    if (!existing) return null;
    const updated: StoredMemory = {
      ...existing,
      ...structuredClone(patch),
      updatedAt: new Date().toISOString(),
      embedding: embedding !== undefined ? (embedding ? [...embedding] : null) : existing.embedding,
    };
    this.bucket(uid).memories.set(id, updated);
    return stripEmbedding(updated as unknown as Record<string, unknown>);
  }

  async deleteMemory(uid: string, id: string): Promise<boolean> {
    return this.bucket(uid).memories.delete(id);
  }

  async findNearestMemories(
    uid: string,
    queryVector: number[],
    limit: number
  ): Promise<VectorSearchHit[]> {
    const hits: VectorSearchHit[] = [];
    for (const m of this.bucket(uid).memories.values()) {
      if (!m.embedding || m.embedding.length === 0 || m.privateNoAI) continue;
      const distance = cosineDistance(queryVector, m.embedding);
      hits.push({
        memory: stripEmbedding(m as unknown as Record<string, unknown>),
        distance,
      });
    }
    hits.sort((a, b) => a.distance - b.distance);
    return hits.slice(0, limit);
  }

  async listCategories(uid: string): Promise<Category[]> {
    return Array.from(this.bucket(uid).categories.values()).sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt)
    );
  }

  async saveCategory(uid: string, category: Category): Promise<void> {
    this.bucket(uid).categories.set(category.id, structuredClone(category));
  }

  async updateCategory(uid: string, id: string, name: string): Promise<Category | null> {
    const existing = this.bucket(uid).categories.get(id);
    if (!existing) return null;
    const updated = { ...existing, name };
    this.bucket(uid).categories.set(id, updated);
    return structuredClone(updated);
  }

  async listProjects(uid: string): Promise<Project[]> {
    return Array.from(this.bucket(uid).projects.values()).sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt)
    );
  }

  async getProject(uid: string, id: string): Promise<Project | null> {
    const p = this.bucket(uid).projects.get(id);
    return p ? structuredClone(p) : null;
  }

  async saveProject(uid: string, project: Project): Promise<void> {
    this.bucket(uid).projects.set(project.id, structuredClone(project));
  }

  async updateProject(uid: string, id: string, patch: Partial<Project>): Promise<Project | null> {
    const existing = this.bucket(uid).projects.get(id);
    if (!existing) return null;
    const updated = {
      ...existing,
      ...structuredClone(patch),
      updatedAt: new Date().toISOString(),
    };
    this.bucket(uid).projects.set(id, updated);
    return structuredClone(updated);
  }

  async exportAll(uid: string) {
    return {
      memories: await this.listMemories(uid),
      categories: await this.listCategories(uid),
      projects: await this.listProjects(uid),
    };
  }

  async deleteAllUserData(uid: string): Promise<void> {
    await this.removeInstagramLinkForUser(uid);
    for (const [id, event] of this.igEvents) {
      if (event.uid !== uid) continue;
      this.igEvents.set(id, event.kind === 'share' ? { ...clearedPayload(event), shareState: 'deleted' } : clearedPayload(event));
    }
    for (const [id, job] of this.igJobs) if (job.uid === uid) this.igJobs.delete(id);
    this.users.delete(uid);
  }

  // ---------- Instagram DM pipeline ----------
  // Every method below runs without awaiting between its read and its write, so each one is atomic
  // with respect to concurrent callers in this process (the Firestore store uses transactions).
  private igEvents = new Map<string, InstagramEventRecord>();
  private igJobs = new Map<string, InstagramJob>();
  private igLinkCodes = new Map<string, InstagramLinkCodeRecord>();
  private igLinks = new Map<string, InstagramLinkRecord>();
  /** Test hook: number of times each method ran. */
  readonly calls = { recordInstagramEvent: 0 };

  async recordInstagramEvent(event: InstagramEventRecord, job: InstagramJob): Promise<'created' | 'duplicate'> {
    this.calls.recordInstagramEvent++;
    if (this.igEvents.has(event.id)) return 'duplicate';
    this.igEvents.set(event.id, plain(event));
    this.igJobs.set(job.id, plain(job));
    return 'created';
  }

  async getInstagramEvent(eventId: string): Promise<InstagramEventRecord | null> {
    const e = this.igEvents.get(eventId);
    return e ? plain(e) : null;
  }

  async clearInstagramEventPayload(eventId: string): Promise<void> {
    const e = this.igEvents.get(eventId);
    if (e) this.igEvents.set(eventId, clearedPayload(e));
  }

  async leaseInstagramJobs(nowMs: number, leaseMs: number, limit: number, leaseId: string): Promise<InstagramJob[]> {
    const runnable = [...this.igJobs.values()]
      .filter((j) => (j.status === 'queued' || j.status === 'leased') && j.nextRunAt <= nowMs)
      .sort((a, b) => a.nextRunAt - b.nextRunAt)
      .slice(0, limit);
    const out: InstagramJob[] = [];
    for (const j of runnable) {
      const next = leaseJob(j, nowMs, leaseMs, leaseId);
      if (!next) continue;
      this.igJobs.set(j.id, next);
      out.push(plain(next));
    }
    return out;
  }

  async settleInstagramJob(jobId: string, leaseId: string, settlement: JobSettlement, nowMs: number): Promise<boolean> {
    const j = this.igJobs.get(jobId);
    const next = j ? settleJob(j, leaseId, settlement, nowMs) : null;
    if (!next) return false;
    this.igJobs.set(jobId, next);
    return true;
  }

  async findPrecedingInstagramShare(recipientId: string, senderId: string, atMs: number, windowMs: number) {
    let best: InstagramEventRecord | null = null;
    for (const e of this.igEvents.values()) {
      if (e.kind !== 'share' || e.recipientId !== recipientId || e.senderId !== senderId) continue;
      if (e.timestampMs > atMs || e.timestampMs < atMs - windowMs) continue;
      if (!best || e.timestampMs > best.timestampMs) best = e;
    }
    return best ? plain(best) : null;
  }

  async reserveInstagramShare(eventId: string, uid: string, memory: Memory) {
    const event = this.igEvents.get(eventId);
    if (!event) throw new Error('instagram event missing');
    if (event.uid !== uid || event.shareState === 'deleted') return { state: 'deleted' as const, memory: null };
    if (event.shareState === 'active') {
      const existing = this.bucket(uid).memories.get(memory.id);
      return existing
        ? { state: 'existing' as const, memory: stripEmbedding(existing as unknown as Record<string, unknown>) }
        : { state: 'deleted' as const, memory: null };
    }
    this.bucket(uid).memories.set(memory.id, { ...plain(memory), embedding: null });
    this.igEvents.set(eventId, { ...event, shareState: 'active', memoryId: memory.id });
    return { state: 'created' as const, memory: plain(memory) };
  }

  async finalizeInstagramShare(uid: string, memoryId: string, input: ShareFinalizeInput, nowMs: number) {
    const existing = this.bucket(uid).memories.get(memoryId);
    if (!existing) return { ok: false, alreadyFinal: false };
    const next = finalizeShare(stripEmbedding(existing as unknown as Record<string, unknown>), input, new Date(nowMs).toISOString());
    if (!next) return { ok: true, alreadyFinal: true };
    this.bucket(uid).memories.set(memoryId, { ...plain(next), embedding: existing.embedding ?? null });
    if (!next.privateNoAI && next.dm) {
      const job = buildAnalysisJob(uid, memoryId, next.dm.analysisGeneration, nowMs);
      this.igJobs.set(job.id, job);
    }
    return { ok: true, alreadyFinal: false };
  }

  async attachInstagramNote(uid: string, memoryId: string, note: DmNote, nowMs: number) {
    const existing = this.bucket(uid).memories.get(memoryId);
    if (!existing) return 'gone' as const;
    const { outcome, next } = noteAttachment(
      stripEmbedding(existing as unknown as Record<string, unknown>),
      note,
      new Date(nowMs).toISOString()
    );
    if (outcome === 'duplicate') return outcome;
    const queue = outcome === 'primary' && !next.privateNoAI && shareFinalized(next) && next.dm;
    const stored = queue ? { ...next, analysisStatus: 'pending' as const } : next;
    this.bucket(uid).memories.set(memoryId, { ...plain(stored), embedding: existing.embedding ?? null });
    if (queue && next.dm) {
      const job = buildAnalysisJob(uid, memoryId, next.dm.analysisGeneration, nowMs);
      this.igJobs.set(job.id, job);
    }
    return outcome;
  }

  async applyInstagramAnalysis(
    uid: string,
    memoryId: string,
    generation: number,
    patch: InstagramAnalysisPatch,
    embedding: number[] | null,
    nowMs: number
  ): Promise<boolean> {
    const existing = this.bucket(uid).memories.get(memoryId);
    if (!existing) return false;
    const next = applyAnalysis(
      stripEmbedding(existing as unknown as Record<string, unknown>),
      generation,
      patch,
      new Date(nowMs).toISOString()
    );
    if (!next) return false;
    this.bucket(uid).memories.set(memoryId, { ...plain(next), embedding: embedding ? [...embedding] : null });
    return true;
  }

  async markInstagramShareDeleted(uid: string, memoryId: string): Promise<void> {
    const eventId = eventIdForMemory(memoryId);
    if (!eventId) return;
    const event = this.igEvents.get(eventId);
    if (event && event.uid === uid) this.igEvents.set(eventId, { ...clearedPayload(event), shareState: 'deleted' });
    this.igJobs.delete(analysisJobId(memoryId));
  }

  async instagramCounts(): Promise<InstagramCounts> {
    const events = [...this.igEvents.values()];
    const jobs = [...this.igJobs.values()];
    const by = (s: InstagramJob['status']) => jobs.filter((j) => j.status === s).length;
    return {
      events: {
        shares: events.filter((e) => e.kind === 'share').length,
        notes: events.filter((e) => e.kind === 'note').length,
        activeShares: events.filter((e) => e.shareState === 'active').length,
        deletedShares: events.filter((e) => e.shareState === 'deleted').length,
      },
      jobs: { queued: by('queued'), leased: by('leased'), done: by('done'), dead: by('dead') },
    };
  }

  // ---------- Instagram linking ----------
  async createInstagramLinkCode(record: InstagramLinkCodeRecord): Promise<void> {
    for (const [id, c] of this.igLinkCodes) if (c.uid === record.uid) this.igLinkCodes.delete(id);
    this.igLinkCodes.set(record.id, plain(record));
  }

  async redeemInstagramLinkCode(codeHash: string, senderId: string, nowMs: number): Promise<InstagramLinkRecord | null> {
    const code = this.igLinkCodes.get(codeHash);
    if (!code) return null;
    this.igLinkCodes.delete(codeHash); // single use, whether or not it was still valid
    if (code.expiresAtMs <= nowMs) return null;
    for (const [id, l] of this.igLinks) if (l.uid === code.uid && id !== senderId) this.igLinks.delete(id);
    const link: InstagramLinkRecord = { senderId, uid: code.uid, linkedAtMs: nowMs };
    this.igLinks.set(senderId, link);
    return { ...link };
  }

  async getInstagramLinkBySender(senderId: string): Promise<InstagramLinkRecord | null> {
    const l = this.igLinks.get(senderId);
    return l ? { ...l } : null;
  }

  async getInstagramLinkForUser(uid: string): Promise<InstagramLinkRecord | null> {
    for (const l of this.igLinks.values()) if (l.uid === uid) return { ...l };
    return null;
  }

  async removeInstagramLinkForUser(uid: string): Promise<boolean> {
    let had = false;
    for (const [id, l] of this.igLinks) {
      if (l.uid !== uid) continue;
      this.igLinks.delete(id);
      had = true;
    }
    for (const [id, c] of this.igLinkCodes) if (c.uid === uid) this.igLinkCodes.delete(id);
    return had;
  }

  /** Test hook: raw restricted records, to prove payloads are cleared. */
  debugInstagramRecords(): { events: InstagramEventRecord[]; jobs: InstagramJob[] } {
    return { events: plain([...this.igEvents.values()]), jobs: plain([...this.igJobs.values()]) };
  }
}

export function createStore(): NeophiStore {
  const app = ensureFirebaseAdmin();
  if (app && process.env.NEOPHI_LOCAL_STORE !== 'memory') {
    return new FirestoreStore(admin.firestore(app));
  }
  return new InMemoryStore();
}
