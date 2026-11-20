import type { FirebaseApp } from 'firebase/app';
import type { Auth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
};

let app: FirebaseApp | null = null;
let auth: Auth | null = null;

function isFirebaseConfigured(): boolean {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);
}

function getLocalDevToken(): string {
  const key = 'neophi_local_dev_uid';
  let uid = localStorage.getItem(key);
  if (!uid) {
    uid = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    localStorage.setItem(key, uid);
  }
  return `dev-uid:${uid}`;
}

export async function getAuthToken(): Promise<string> {
  if (!isFirebaseConfigured()) {
    return getLocalDevToken();
  }
  if (!app) {
    // Loaded on first use, so the landing page does not wait for the sign-in library.
    const [{ initializeApp }, { getAuth }] = await Promise.all([import('firebase/app'), import('firebase/auth')]);
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
  }
  if (!auth!.currentUser) {
    const { signInAnonymously } = await import('firebase/auth');
    await signInAnonymously(auth!);
  }
  return auth!.currentUser!.getIdToken();
}

export function isInstagramInAppBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Instagram/i.test(navigator.userAgent);
}
