import crypto from 'node:crypto';
import express from 'express';
import multer from 'multer';
import type {
  Category,
  IngestKind,
  LedgerEntry,
  Memory,
  MemoryChip,
  Platform,
  Project,
  ProjectOutcome,
} from '../src/types/neophi.js';
import { suggestCategoryForMemory } from './analysis.js';
import { config } from './config.js';
import { createAuthMiddleware, getUid, type AuthVerifier } from './firebase.js';
import { buildEmbeddingText, type GeminiService } from './gemini.js';
import { guardAnalysis, normalizeUserNote } from './guard.js';
import { buildSampleLibrary } from './samples.js';
import { searchMemories } from './search.js';
import {
  ALLOWED_MIME_TYPES,
  MAX_UPLOAD_BYTES,
  MAX_VIDEO_DURATION_SEC,
  type MediaStorage,
} from './storage.js';
import type { NeophiStore } from './store.js';
import { buildTodayFeed } from './today.js';

const VALID_CHIPS = new Set<MemoryChip>([
  'Try',
  'Buy',
  'Learn',
  'Remix',
  'Go there',
  'Share with',
  'Just remember',
]);

function detectPlatform(url: string | null, hasFile: boolean): Platform {
  if (hasFile) return 'upload';
  if (!url) return 'other';
  const lower = url.toLowerCase();
  if (lower.includes('instagram.com') || lower.includes('instagr.am')) return 'instagram';
  if (lower.includes('youtube.com') || lower.includes('youtu.be')) return 'youtube';
  if (lower.startsWith('http://') || lower.startsWith('https://')) return 'web';
  return 'other';
}

function deriveTitle(
  explicitTitle: unknown,
  caption: string | null,
  note: string | null,
  url: string | null,
  hasFile: boolean
): string {
  if (typeof explicitTitle === 'string' && explicitTitle.trim().length > 0) {
    return explicitTitle.trim().slice(0, 100);
  }
  if (caption && caption.trim().length > 0) {
    return caption.trim().slice(0, 72);
  }
  if (note && note.trim().length > 0) {
    return note.trim().slice(0, 72);
  }
  if (url) {
    try {
      const parsed = new URL(url);
      return `${parsed.hostname}${parsed.pathname}`.slice(0, 72);
    } catch {
      return url.slice(0, 72);
    }
  }
  return hasFile ? 'Uploaded media' : 'Saved item';
}

export interface ApiDeps {
  store: NeophiStore;
  storage: MediaStorage;
  gemini: GeminiService;
  authVerifier?: AuthVerifier;
  instagramWebhookConfigured?: boolean;
}

export function createApiRouter(deps: ApiDeps): express.Router {
  const router = express.Router();
  const verifyAuth = createAuthMiddleware(deps.authVerifier);

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_UPLOAD_BYTES },
  });

  // Public health endpoint (never returns secrets)
  router.get('/health', (_req, res) => {
    res.json({
      ok: true,
      models: {
        analysis: config.analysisModel,
        embedding: config.embeddingModel,
        embeddingDims: config.embeddingDims,
      },
      project: config.project || 'local-dev',
      region: config.region,
      instagram: { webhookConfigured: Boolean(deps.instagramWebhookConfigured) },
    });
  });

  router.use(verifyAuth);

  // Create memory (multipart or JSON)
  router.post(
    '/memories',
    (req, res, next) => {
      upload.single('file')(req, res, (err) => {
        if (err) {
          if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
            res.status(413).json({ error: 'File exceeds 15 MB limit' });
            return;
          }
          res.status(400).json({ error: 'Invalid upload payload' });
          return;
        }
        next();
      });
    },
    async (req, res) => {
      const uid = getUid(req);
      const startMs = Date.now();
      const file = req.file;

      if (file) {
        if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
          res.status(400).json({ error: 'Unsupported MIME type' });
          return;
        }
        const durationSec = Number(req.body?.videoDurationSec);
        if (
          file.mimetype.startsWith('video/') &&
          Number.isFinite(durationSec) &&
          durationSec > MAX_VIDEO_DURATION_SEC
        ) {
          res.status(400).json({ error: 'Video exceeds 60 second limit' });
          return;
        }
      }

      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const rawUrl = typeof req.body?.url === 'string' && req.body.url.trim() ? req.body.url.trim() : null;
      const rawCaption =
        typeof req.body?.caption === 'string' && req.body.caption.trim()
          ? req.body.caption.trim()
          : null;
      const note = normalizeUserNote(req.body?.note);
      const rawChip = req.body?.chip;
      const chip: MemoryChip | null =
        typeof rawChip === 'string' && VALID_CHIPS.has(rawChip as MemoryChip)
          ? (rawChip as MemoryChip)
          : null;
      const privateNoAI =
        req.body?.privateNoAI === true || req.body?.privateNoAI === 'true';

      let ingest: IngestKind = 'link_metadata';
      if (file) {
        ingest = 'full_media';
      } else if (req.body?.ingest === 'unsupported' || req.body?.markUnsupported === 'true') {
        ingest = 'unsupported';
      } else if (!rawUrl && !rawCaption) {
        ingest = 'unsupported';
      }

      let media: Memory['media'] = null;
      if (file) {
        const stored = await deps.storage.putMedia(uid, id, file.buffer, file.mimetype);
        const durationSec = Number(req.body?.videoDurationSec);
        media = {
          kind: stored.kind,
          mime: stored.mime,
          gcsPath: stored.gcsPath,
          thumbPath: stored.thumbPath,
          ...(Number.isFinite(durationSec) && durationSec > 0 ? { durationSec } : {}),
        };
      }

      const ledger: LedgerEntry[] = [
        {
          at: now,
          who: 'you',
          text: note ? 'Saved with your note' : 'Saved item',
          undoable: false,
        },
      ];

      const memory: Memory = {
        id,
        createdAt: now,
        updatedAt: now,
        title: deriveTitle(req.body?.title, rawCaption, note, rawUrl, Boolean(file)),
        platform: detectPlatform(rawUrl, Boolean(file)),
        url: rawUrl,
        caption: rawCaption,
        note,
        chip,
        ingest,
        media,
        privateNoAI,
        analysis: null,
        analysisStatus: privateNoAI ? 'skipped' : 'pending',
        categoryId: null,
        categoryWhy: null,
        categoryByAI: false,
        projectIds: Array.isArray(req.body?.projectIds) ? req.body.projectIds : [],
        remindAt: typeof req.body?.remindAt === 'string' ? req.body.remindAt : null,
        doneAt: null,
        snoozedUntil: null,
        lastOpenedAt: null,
        ledger,
        sample: false,
      };

      await deps.store.saveMemory(uid, memory, null);
      console.info(
        JSON.stringify({ event: 'memory_saved', id, ingest, privateNoAI, ms: Date.now() - startMs })
      );

      res.status(201).json(memory);

      // Run analysis asynchronously in the same request lifecycle (unless privateNoAI)
      if (!privateNoAI) {
        void (async () => {
          const aiStart = Date.now();
          try {
            const analysis = await deps.gemini.analyzeMemory(memory);
            const guarded = analysis
              ? guardAnalysis(analysis, { ingest: memory.ingest, note: memory.note })
              : memory.ingest === 'unsupported'
                ? guardAnalysis({}, { ingest: 'unsupported', note: memory.note })
                : null;

            const updatedMemory: Memory = {
              ...memory,
              analysis: guarded,
              analysisStatus: guarded ? 'done' : 'failed',
            };

            const patch: Partial<Memory> = {
              analysis: guarded,
              analysisStatus: guarded ? 'done' : 'failed',
            };

            // Suggest category if available
            const catSuggestion = await suggestCategoryForMemory(deps.store, deps.gemini, uid, updatedMemory);
            if (catSuggestion) {
              patch.categoryId = catSuggestion.categoryId;
              patch.categoryWhy = catSuggestion.categoryWhy;
              patch.categoryByAI = true;
              patch.ledger = [...memory.ledger, catSuggestion.ledger];
            }

            const embedText = buildEmbeddingText(updatedMemory);
            const embedding = await deps.gemini.embedText(embedText).catch(() => null);

            await deps.store.updateMemory(uid, id, patch, embedding);
            console.info(
              JSON.stringify({
                event: 'memory_analyzed',
                id,
                status: patch.analysisStatus,
                ms: Date.now() - aiStart,
              })
            );
          } catch {
            await deps.store
              .updateMemory(uid, id, { analysisStatus: 'failed' })
              .catch(() => {});
            console.info(
              JSON.stringify({
                event: 'memory_analyzed',
                id,
                status: 'failed',
                ms: Date.now() - aiStart,
              })
            );
          }
        })();
      }
    }
  );

  router.get('/memories', async (req, res) => {
    const uid = getUid(req);
    const memories = await deps.store.listMemories(uid);
    res.json(memories);
  });

  router.get('/memories/:id', async (req, res) => {
    const uid = getUid(req);
    const memory = await deps.store.getMemory(uid, req.params.id);
    if (!memory) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    if (req.query.open === '1') {
      const updated = await deps.store.updateMemory(uid, memory.id, {
        lastOpenedAt: new Date().toISOString(),
      });
      res.json(updated ?? memory);
      return;
    }
    res.json(memory);
  });

  router.patch('/memories/:id', async (req, res) => {
    const uid = getUid(req);
    const existing = await deps.store.getMemory(uid, req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    const patch: Partial<Memory> = {};
    let noteChanged = false;

    if ('note' in req.body) {
      patch.note = normalizeUserNote(req.body.note);
      noteChanged = patch.note !== existing.note;
    }
    if ('chip' in req.body) {
      patch.chip =
        typeof req.body.chip === 'string' && VALID_CHIPS.has(req.body.chip as MemoryChip)
          ? (req.body.chip as MemoryChip)
          : null;
    }
    if ('title' in req.body && typeof req.body.title === 'string') {
      patch.title = req.body.title.trim() || existing.title;
    }
    if ('categoryId' in req.body) {
      patch.categoryId = typeof req.body.categoryId === 'string' ? req.body.categoryId : null;
      patch.categoryByAI = false;
      patch.categoryWhy = null;
    }
    if ('projectIds' in req.body && Array.isArray(req.body.projectIds)) {
      patch.projectIds = req.body.projectIds.filter((p: unknown): p is string => typeof p === 'string');
    }
    if ('remindAt' in req.body) {
      patch.remindAt = typeof req.body.remindAt === 'string' ? req.body.remindAt : null;
    }
    if ('doneAt' in req.body) {
      patch.doneAt = typeof req.body.doneAt === 'string' ? req.body.doneAt : null;
    }
    if ('snoozedUntil' in req.body) {
      patch.snoozedUntil = typeof req.body.snoozedUntil === 'string' ? req.body.snoozedUntil : null;
    }
    if ('lastOpenedAt' in req.body) {
      patch.lastOpenedAt = typeof req.body.lastOpenedAt === 'string' ? req.body.lastOpenedAt : null;
    }

    let newEmbedding: number[] | null | undefined = undefined;
    if (typeof req.body?.privateNoAI === 'boolean' && req.body.privateNoAI !== existing.privateNoAI) {
      patch.privateNoAI = req.body.privateNoAI;
      if (req.body.privateNoAI) {
        // Private from now on: drop the vector and stop any queued analysis from landing.
        patch.analysisStatus = 'skipped';
        newEmbedding = null;
      }
    }
    if (noteChanged && !existing.privateNoAI && patch.privateNoAI !== true) {
      const merged: Memory = { ...existing, ...patch };
      newEmbedding = await deps.gemini.embedText(buildEmbeddingText(merged)).catch(() => null);
    }

    const updated = await deps.store.updateMemory(uid, existing.id, patch, newEmbedding);
    res.json(updated);
  });

  router.delete('/memories/:id', async (req, res) => {
    const uid = getUid(req);
    const existing = await deps.store.getMemory(uid, req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    // Tombstone a DM share first so a queued or retried job cannot recreate or re-analyse it.
    if (existing.dm) {
      await deps.store.markInstagramShareDeleted(uid, existing.id);
    }
    if (existing.media) {
      await deps.storage.deleteMedia(existing.media.gcsPath, existing.media.thumbPath);
    }
    await deps.store.deleteMemory(uid, existing.id);
    res.json({ ok: true });
  });

  router.post('/memories/:id/undo/:ledgerIndex', async (req, res) => {
    const uid = getUid(req);
    const idx = Number(req.params.ledgerIndex);
    const existing = await deps.store.getMemory(uid, req.params.id);
    if (!existing || !Number.isInteger(idx) || idx < 0 || idx >= existing.ledger.length) {
      res.status(404).json({ error: 'Ledger entry not found' });
      return;
    }

    const entry = existing.ledger[idx];
    if (!entry.undoable || !entry.undoAction) {
      res.status(400).json({ error: 'Entry is not undoable' });
      return;
    }

    const patch: Partial<Memory> = {};
    if (entry.undoAction.field === 'categoryId') {
      patch.categoryId = (entry.undoAction.previousValue as string | null) ?? null;
      patch.categoryByAI = false;
      patch.categoryWhy = null;
    }

    const nextLedger = existing.ledger.map((item, i) =>
      i === idx ? { ...item, undoable: false, text: `${item.text} (undone)` } : item
    );
    patch.ledger = nextLedger;

    const updated = await deps.store.updateMemory(uid, existing.id, patch);
    res.json(updated);
  });

  router.get('/media/:id', async (req, res) => {
    const uid = getUid(req);
    const memory = await deps.store.getMemory(uid, req.params.id);
    if (!memory || !memory.media) {
      res.status(404).json({ error: 'Media not found' });
      return;
    }

    const targetPath =
      req.query.thumb === '1' && memory.media.thumbPath
        ? memory.media.thumbPath
        : memory.media.gcsPath;

    if (!targetPath) {
      res.status(404).json({ error: 'No stored file' });
      return;
    }

    const data = await deps.storage.getSignedOrStreamData(targetPath);
    if (!data) {
      res.status(404).json({ error: 'Media object missing' });
      return;
    }

    if (data.type === 'url') {
      res.redirect(data.url);
      return;
    }
    res.setHeader('Content-Type', data.mime);
    res.send(data.buffer);
  });

  // Search
  router.post('/search', async (req, res) => {
    const uid = getUid(req);
    const q = typeof req.body?.q === 'string' ? req.body.q.trim() : '';
    if (!q) {
      res.json({
        understoodAs: { english: '', hindi: '', hinglish: '', keywords: [], timeHint: null },
        results: [],
      });
      return;
    }
    const result = await searchMemories(uid, q, deps.store, deps.gemini);
    res.json(result);
  });

  // Today feed
  router.get('/today', async (req, res) => {
    const uid = getUid(req);
    const timeZone = typeof req.query.tz === 'string' ? req.query.tz : 'Asia/Kolkata';
    const readyForHourEnabled = req.query.ready !== '0';
    const [memories, projects] = await Promise.all([
      deps.store.listMemories(uid),
      deps.store.listProjects(uid),
    ]);
    const feed = buildTodayFeed({
      memories,
      projects,
      timeZone,
      readyForHourEnabled,
    });
    res.json(feed);
  });

  // Categories
  router.get('/categories', async (req, res) => {
    const uid = getUid(req);
    res.json(await deps.store.listCategories(uid));
  });

  router.post('/categories', async (req, res) => {
    const uid = getUid(req);
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (!name) {
      res.status(400).json({ error: 'Category name is required' });
      return;
    }
    const category: Category = {
      id: crypto.randomUUID(),
      name,
      createdAt: new Date().toISOString(),
    };
    await deps.store.saveCategory(uid, category);
    res.status(201).json(category);
  });

  router.patch('/categories/:id', async (req, res) => {
    const uid = getUid(req);
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (!name) {
      res.status(400).json({ error: 'Category name is required' });
      return;
    }
    const updated = await deps.store.updateCategory(uid, req.params.id, name);
    if (!updated) {
      res.status(404).json({ error: 'Category not found' });
      return;
    }
    res.json(updated);
  });

  // Projects & Outcomes
  router.get('/projects', async (req, res) => {
    const uid = getUid(req);
    res.json(await deps.store.listProjects(uid));
  });

  router.post('/projects', async (req, res) => {
    const uid = getUid(req);
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (!name) {
      res.status(400).json({ error: 'Project name is required' });
      return;
    }
    const now = new Date().toISOString();
    const project: Project = {
      id: crypto.randomUUID(),
      name,
      description: typeof req.body?.description === 'string' ? req.body.description.trim() : '',
      outcomeType: req.body?.outcomeType === 'content_brief' ? 'content_brief' : 'itinerary',
      createdAt: now,
      updatedAt: now,
    };
    await deps.store.saveProject(uid, project);
    res.status(201).json(project);
  });

  router.patch('/projects/:id', async (req, res) => {
    const uid = getUid(req);
    const patch: Partial<Project> = {};
    if (typeof req.body?.name === 'string' && req.body.name.trim()) {
      patch.name = req.body.name.trim();
    }
    if (typeof req.body?.description === 'string') {
      patch.description = req.body.description.trim();
    }
    if (req.body?.outcomeType === 'itinerary' || req.body?.outcomeType === 'content_brief') {
      patch.outcomeType = req.body.outcomeType;
    }
    const updated = await deps.store.updateProject(uid, req.params.id, patch);
    if (!updated) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    res.json(updated);
  });

  router.post('/projects/:id/outcome', async (req, res) => {
    const uid = getUid(req);
    const project = await deps.store.getProject(uid, req.params.id);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    const allMemories = await deps.store.listMemories(uid);
    // Saves marked private are never sent to an AI model, including when drafting a project outcome.
    const projectMemories = allMemories.filter((m) => m.projectIds.includes(project.id) && !m.privateNoAI);
    const sections = await deps.gemini.buildOutcome(
      project.outcomeType,
      project.name,
      project.description,
      projectMemories
    );

    const outcome: ProjectOutcome = {
      projectId: project.id,
      outcomeType: project.outcomeType,
      draft: true,
      sections,
      notKnown:
        project.outcomeType === 'itinerary'
          ? 'Some places have no name in the source. Distances, opening hours and the order between days are not known. Nothing was looked up.'
          : 'Publishing times, audio licensing, and final shot durations are not known from your saves. Nothing was looked up.',
      generatedAt: new Date().toISOString(),
    };
    res.json(outcome);
  });

  // Sample library
  router.post('/samples', async (req, res) => {
    const uid = getUid(req);
    const { categories, projects, memories } = buildSampleLibrary();

    await Promise.all([
      ...categories.map((c) => deps.store.saveCategory(uid, c)),
      ...projects.map((p) => deps.store.saveProject(uid, p)),
    ]);

    for (const m of memories) {
      const embedding = !m.privateNoAI
        ? await deps.gemini.embedText(buildEmbeddingText(m)).catch(() => null)
        : null;
      await deps.store.saveMemory(uid, m, embedding);
    }

    res.status(201).json({ ok: true, count: memories.length });
  });

  // Export / Import / Delete me
  router.get('/export', async (req, res) => {
    const uid = getUid(req);
    const data = await deps.store.exportAll(uid);
    res.json({
      exportedAt: new Date().toISOString(),
      version: 1,
      ...data,
    });
  });

  router.post('/import', async (req, res) => {
    const uid = getUid(req);
    const categories = Array.isArray(req.body?.categories) ? (req.body.categories as Category[]) : [];
    const projects = Array.isArray(req.body?.projects) ? (req.body.projects as Project[]) : [];
    const memories = Array.isArray(req.body?.memories) ? (req.body.memories as Memory[]) : [];

    for (const c of categories) {
      if (c && c.id && c.name) await deps.store.saveCategory(uid, c);
    }
    for (const p of projects) {
      if (p && p.id && p.name) await deps.store.saveProject(uid, p);
    }
    for (const m of memories) {
      if (m && m.id) {
        const cleanNote = normalizeUserNote(m.note);
        const cleanMemory: Memory = { ...m, note: cleanNote };
        const embedding = !cleanMemory.privateNoAI
          ? await deps.gemini.embedText(buildEmbeddingText(cleanMemory)).catch(() => null)
          : null;
        await deps.store.saveMemory(uid, cleanMemory, embedding);
      }
    }

    res.json({ ok: true, imported: memories.length });
  });

  router.delete('/me', async (req, res) => {
    const uid = getUid(req);
    await deps.storage.deleteAllUserMedia(uid);
    await deps.store.deleteAllUserData(uid);
    res.json({ ok: true });
  });

  return router;
}
