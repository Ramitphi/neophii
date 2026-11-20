import admin from 'firebase-admin';
import type { NextFunction, Request, Response } from 'express';
import { config } from './config.js';

let initialized = false;

export function ensureFirebaseAdmin(): admin.app.App | null {
  if (initialized) {
    return admin.apps[0] ?? null;
  }
  initialized = true;

  if (admin.apps.length > 0) {
    return admin.apps[0] ?? null;
  }

  // Only initialize Firebase Admin when a project is configured or emulator is running
  if (!config.project && !process.env.FIRESTORE_EMULATOR_HOST && !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    return null;
  }

  return admin.initializeApp({
    ...(config.project ? { projectId: config.project } : {}),
    ...(config.mediaBucket ? { storageBucket: config.mediaBucket } : {}),
  });
}

export interface AuthenticatedRequest extends Request {
  uid: string;
}

export function getUid(req: Request): string {
  return (req as unknown as AuthenticatedRequest).uid;
}

export type AuthVerifier = (token: string) => Promise<string>;

export function createAuthMiddleware(customVerifier?: AuthVerifier) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing Authorization Bearer token' });
      return;
    }

    const idToken = authHeader.slice('Bearer '.length).trim();
    if (!idToken) {
      res.status(401).json({ error: 'Empty Bearer token' });
      return;
    }

    try {
      let uid: string;
      if (customVerifier) {
        uid = await customVerifier(idToken);
      } else {
        const app = ensureFirebaseAdmin();
        if (app) {
          const decoded = await admin.auth(app).verifyIdToken(idToken);
          uid = decoded.uid;
        } else if (process.env.NODE_ENV !== 'production' && idToken.startsWith('dev-uid:')) {
          // Local dev fallback only when no Firebase project is configured
          uid = idToken.slice('dev-uid:'.length).replace(/[^a-zA-Z0-9_-]/g, '');
          if (!uid) {
            res.status(401).json({ error: 'Invalid dev token' });
            return;
          }
        } else {
          res.status(503).json({ error: 'Firebase Auth is not configured on the server' });
          return;
        }
      }

      (req as AuthenticatedRequest).uid = uid;
      next();
    } catch {
      res.status(401).json({ error: 'Invalid or expired Firebase ID token' });
    }
  };
}
