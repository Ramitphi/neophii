import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import compression from 'compression';
import cors from 'cors';
import express from 'express';
import { config } from './config.js';
import type { AuthVerifier } from './firebase.js';
import { VertexGeminiService, type GeminiService } from './gemini.js';
import { createDemoSender } from './instagram/demo.js';
import { loadInstagramConfig, type InstagramConfig } from './instagram/config.js';
import {
  createInstagramInternalRouter,
  createWorkerCallerVerifier,
  workerAuthConfigured,
  type WorkerCallerVerifier,
} from './instagram/internal.js';
import { logEvent } from './instagram/log.js';
import type { FetchLike } from './instagram/media.js';
import { createInstagramWebhookRouter, newWebhookStats } from './instagram/webhook.js';
import { createInstagramWorker, startInstagramPoller, type InstagramWorker } from './instagram/worker.js';
import { createApiRouter } from './routes.js';
import { createMediaStorage, type MediaStorage } from './storage.js';
import { createStore, type NeophiStore } from './store.js';

export interface InstagramOverrides {
  config?: InstagramConfig;
  fetchImpl?: FetchLike;
  now?: () => number;
  verifyWorkerCaller?: WorkerCallerVerifier;
}

export function createApp(overrides?: {
  store?: NeophiStore;
  storage?: MediaStorage;
  gemini?: GeminiService;
  authVerifier?: AuthVerifier;
  instagram?: InstagramOverrides;
}): express.Express {
  const app = express();
  app.use(cors());

  const store = overrides?.store ?? createStore();
  const storage = overrides?.storage ?? createMediaStorage();
  const gemini = overrides?.gemini ?? new VertexGeminiService();

  // Instagram DM webhook: mounted BEFORE the global JSON parser so its HMAC sees the untouched raw body.
  const igConfig = overrides?.instagram?.config ?? loadInstagramConfig();
  const igStats = newWebhookStats();
  app.use(
    '/webhooks/instagram',
    createInstagramWebhookRouter({ store, config: igConfig, stats: igStats, now: overrides?.instagram?.now })
  );

  const worker = createInstagramWorker({
    store,
    storage,
    gemini,
    config: igConfig,
    fetchImpl: overrides?.instagram?.fetchImpl,
    now: overrides?.instagram?.now,
  });
  app.locals.instagramWorker = worker;

  // Private worker trigger: only mounted when a caller identity (OIDC or shared secret) is configured.
  const verifyWorkerCaller =
    overrides?.instagram?.verifyWorkerCaller ??
    (workerAuthConfigured(igConfig) ? createWorkerCallerVerifier(igConfig) : null);
  if (verifyWorkerCaller) {
    app.use('/internal', createInstagramInternalRouter({ worker, store, stats: igStats, verifyCaller: verifyWorkerCaller }));
  }

  // Cloud Run does not compress, so do it here: the app script is about 3.5 times smaller on the wire.
  app.use(compression());
  app.use(express.json({ limit: '5mb' }));

  app.use(
    '/api',
    createApiRouter({
      store,
      storage,
      gemini,
      authVerifier: overrides?.authVerifier,
      instagramWebhookConfigured: Boolean(igConfig.appSecret && igConfig.verifyToken && igConfig.recipientId),
      instagramHandle: igConfig.handle,
      instagramDemo: igConfig.demoSender
        ? createDemoSender({ store, config: igConfig, worker, now: overrides?.instagram?.now })
        : undefined,
      now: overrides?.instagram?.now,
    })
  );

  // Serve built Vite client if present
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const clientDir = path.resolve(__dirname, '../client');
  const distClientDir = path.resolve(process.cwd(), 'dist/client');
  const staticDir = fs.existsSync(clientDir) ? clientDir : distClientDir;

  if (fs.existsSync(staticDir)) {
    // `extensions` lets /privacy, /terms and /data-deletion serve their .html pages.
    app.use(
      express.static(staticDir, {
        extensions: ['html'],
        setHeaders: (res, filePath) => {
          // Built files have a hash in their name, so they can be cached for a year; the page itself is always fresh.
          if (filePath.split(path.sep).includes('assets')) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          else if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
        },
      })
    );
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/webhooks') || req.path.startsWith('/internal')) {
        next();
        return;
      }
      res.sendFile(path.join(staticDir, 'index.html'));
    });
  }

  return app;
}

// Start server when run directly
// Normalise Windows backslashes so this also works with `npm run dev` on Windows.
const entry = (process.argv[1] ?? '').replace(/\\/g, '/');
const isMain = entry.endsWith('server/index.ts') || entry.endsWith('server/index.js');

if (isMain) {
  const app = createApp();
  const igConfig = loadInstagramConfig();
  if (igConfig.pollMs > 0) {
    startInstagramPoller(app.locals.instagramWorker as InstagramWorker, igConfig.pollMs);
    logEvent('instagram_poller_started', { intervalMs: igConfig.pollMs });
  }
  app.listen(config.port, () => {
    console.info(
      JSON.stringify({
        event: 'server_started',
        port: config.port,
        region: config.region,
        analysisModel: config.analysisModel,
        embeddingModel: config.embeddingModel,
      })
    );
  });
}
