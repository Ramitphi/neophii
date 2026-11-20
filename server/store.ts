import admin from 'firebase-admin';
import { FieldValue } from '@google-cloud/firestore';
import type { Category, Memory, Project } from '../src/types/neophi.js';
import { ensureFirebaseAdmin } from './firebase.js';

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
    this.users.delete(uid);
  }
}

export function createStore(): NeophiStore {
  const app = ensureFirebaseAdmin();
  if (app && process.env.NEOPHI_LOCAL_STORE !== 'memory') {
    return new FirestoreStore(admin.firestore(app));
  }
  return new InMemoryStore();
}
