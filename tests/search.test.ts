import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../server/index.js';
import type { GeminiService } from '../server/gemini.js';
import { InMemoryMediaStorage } from '../server/storage.js';
import { InMemoryStore } from '../server/store.js';

describe('search & privacy guarantees', () => {
  function setupApp() {
    const store = new InMemoryStore();
    const storage = new InMemoryMediaStorage();
    const embedMock = vi.fn(async (text: string) => {
      // Deterministic tiny vector for test
      const lower = text.toLowerCase();
      return [
        lower.includes('red') || lower.includes('shirt') || lower.includes('sangeet') ? 1 : 0,
        lower.includes('paneer') || lower.includes('methi') ? 1 : 0,
        lower.includes('goa') || lower.includes('beach') ? 1 : 0,
      ];
    });
    const analyzeMock = vi.fn(async () => null);
    const gemini: GeminiService = {
      analyzeMemory: analyzeMock,
      embedText: embedMock,
      rewriteSearchQuery: vi.fn(async (q) => {
        if (q.includes('laal shirt')) {
          return {
            english: 'red shirt dance',
            hindi: 'लाल शर्ट डांस',
            hinglish: q,
            keywords: ['red', 'shirt', 'dance'],
            timeHint: 'last_month' as const,
          };
        }
        return {
          english: q,
          hindi: q,
          hinglish: q,
          keywords: q.toLowerCase().split(/\s+/),
          timeHint: null,
        };
      }),
      suggestCategory: vi.fn(async () => null),
      buildOutcome: vi.fn(async () => []),
    };

    const app = createApp({
      store,
      storage,
      gemini,
      authVerifier: async (t) => t,
    });

    return { app, embedMock, analyzeMock, gemini };
  }

  it('finds the deleted sample by its note and finds Sangeet sample for Hinglish query', async () => {
    const { app } = setupApp();

    await request(app).post('/api/samples').set('Authorization', 'Bearer uid-a').send();

    const deletedSearch = await request(app)
      .post('/api/search')
      .set('Authorization', 'Bearer uid-a')
      .send({ q: 'caption idea for the cafe launch' });

    expect(deletedSearch.status).toBe(200);
    expect(deletedSearch.body.results.some((r: { memory: { id: string } }) => r.memory.id === 'sample-deleted')).toBe(
      true
    );

    const hinglishSearch = await request(app)
      .post('/api/search')
      .set('Authorization', 'Bearer uid-a')
      .send({ q: 'laal shirt wala dance, pichle mahine' });

    expect(hinglishSearch.status).toBe(200);
    expect(hinglishSearch.body.results.length).toBeGreaterThan(0);
    expect(hinglishSearch.body.results[0].memory.id).toBe('sample-sangeet');
    expect(hinglishSearch.body.results[0].whyMatched).toContain('Your words');
  });

  it('never sends privateNoAI memories to embedding or analysis API', async () => {
    const { app, embedMock, analyzeMock } = setupApp();

    const res = await request(app)
      .post('/api/memories')
      .set('Authorization', 'Bearer uid-priv')
      .send({
        url: 'https://example.com/secret',
        note: 'secret medical note',
        privateNoAI: true,
      });

    expect(res.status).toBe(201);
    expect(res.body.analysisStatus).toBe('skipped');
    await new Promise((r) => setTimeout(r, 50));
    expect(analyzeMock).not.toHaveBeenCalled();
    expect(embedMock).not.toHaveBeenCalled();
  });

  it('never sends privateNoAI memories to the project outcome model call', async () => {
    const { app, gemini } = setupApp();
    const auth = { Authorization: 'Bearer uid-outcome' };

    const project = await request(app)
      .post('/api/projects')
      .set(auth)
      .send({ name: 'Trip', description: 'Weekend plan', outcomeType: 'itinerary' });
    expect(project.status).toBe(201);
    const projectIds = [project.body.id];

    const shared = await request(app).post('/api/memories').set(auth).send({ url: 'https://example.com/open', note: 'open note', projectIds });
    const hidden = await request(app)
      .post('/api/memories')
      .set(auth)
      .send({ url: 'https://example.com/secret', note: 'secret note', projectIds, privateNoAI: true });
    expect(shared.status).toBe(201);
    expect(hidden.status).toBe(201);

    const outcome = await request(app).post(`/api/projects/${project.body.id}/outcome`).set(auth).send();
    expect(outcome.status).toBe(200);

    const sent = vi.mocked(gemini.buildOutcome).mock.calls[0][3].map((m) => m.id);
    expect(sent).toContain(shared.body.id);
    expect(sent).not.toContain(hidden.body.id);
  });

  it('isolates search results strictly by uid', async () => {
    const { app } = setupApp();

    await request(app)
      .post('/api/memories')
      .set('Authorization', 'Bearer uid-1')
      .send({ url: 'https://example.com/a', note: 'unique flamingo note' });

    const resUid2 = await request(app)
      .post('/api/search')
      .set('Authorization', 'Bearer uid-2')
      .send({ q: 'unique flamingo note' });

    expect(resUid2.status).toBe(200);
    expect(resUid2.body.results).toEqual([]);
  });
});
