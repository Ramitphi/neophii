// Private worker trigger. Mounted only when worker authentication is configured:
//  - Google OIDC ID token from Cloud Scheduler / Cloud Tasks (audience + caller service account), or
//  - a shared bearer secret for a VM cron.
// Returns counts only.
import express from 'express';
import { OAuth2Client } from 'google-auth-library';
import type { NeophiStore } from '../store.js';
import type { InstagramConfig } from './config.js';
import { logEvent } from './log.js';
import { safeEqual } from './parse.js';
import type { WebhookStats } from './webhook.js';
import type { InstagramWorker } from './worker.js';

export type WorkerCallerVerifier = (bearerToken: string) => Promise<boolean>;

export function workerAuthConfigured(cfg: InstagramConfig): boolean {
  return Boolean(cfg.workerSecret || (cfg.workerOidcAudience && cfg.workerServiceAccount));
}

export function createWorkerCallerVerifier(cfg: InstagramConfig): WorkerCallerVerifier {
  const oidc = new OAuth2Client();
  return async (token) => {
    if (cfg.workerSecret && safeEqual(token, cfg.workerSecret)) return true;
    if (!cfg.workerOidcAudience || !cfg.workerServiceAccount) return false;
    // Only something shaped like a JWT is worth fetching Google's signing certificates for.
    if (!/^[\w-]+\.[\w-]+\.[\w-]+$/.test(token)) return false;
    try {
      const ticket = await oidc.verifyIdToken({ idToken: token, audience: cfg.workerOidcAudience });
      const payload = ticket.getPayload();
      return Boolean(
        payload?.email_verified && payload.email?.toLowerCase() === cfg.workerServiceAccount
      );
    } catch {
      return false;
    }
  };
}

export function createInstagramInternalRouter(deps: {
  worker: InstagramWorker;
  store: NeophiStore;
  stats: WebhookStats;
  verifyCaller: WorkerCallerVerifier;
}): express.Router {
  const router = express.Router();

  router.use(async (req, res, next) => {
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
    if (!token) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    if (!(await deps.verifyCaller(token).catch(() => false))) {
      logEvent('instagram_worker_rejected', {});
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    next();
  });

  router.post('/instagram/worker/run', async (_req, res) => {
    try {
      res.json(await deps.worker.drain());
    } catch {
      logEvent('instagram_worker_error', { where: 'endpoint' });
      res.status(500).json({ error: 'worker failed' });
    }
  });

  router.get('/instagram/status', async (_req, res) => {
    res.json({ webhook: deps.stats, ...(await deps.store.instagramCounts()) });
  });

  return router;
}
