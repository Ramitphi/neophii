import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express from 'express';
import { config } from './config.js';
import type { AuthVerifier } from './firebase.js';
import { VertexGeminiService, type GeminiService } from './gemini.js';
import { createApiRouter } from './routes.js';
import { createMediaStorage, type MediaStorage } from './storage.js';
import { createStore, type NeophiStore } from './store.js';

export function createApp(overrides?: {
  store?: NeophiStore;
  storage?: MediaStorage;
  gemini?: GeminiService;
  authVerifier?: AuthVerifier;
}): express.Express {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '5mb' }));

  const store = overrides?.store ?? createStore();
  const storage = overrides?.storage ?? createMediaStorage();
  const gemini = overrides?.gemini ?? new VertexGeminiService();

  app.use(
    '/api',
    createApiRouter({
      store,
      storage,
      gemini,
      authVerifier: overrides?.authVerifier,
    })
  );

  // Serve built Vite client if present
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const clientDir = path.resolve(__dirname, '../client');
  const distClientDir = path.resolve(process.cwd(), 'dist/client');
  const staticDir = fs.existsSync(clientDir) ? clientDir : distClientDir;

  if (fs.existsSync(staticDir)) {
    app.use(express.static(staticDir));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) {
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
