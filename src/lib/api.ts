import type {
  Category,
  Memory,
  Project,
  ProjectOutcome,
  SearchResponse,
  TodayResponse,
} from '../types/neophi';
import { getAuthToken } from './firebase';

export interface HealthInfo {
  ok: boolean;
  models: {
    analysis: string;
    embedding: string;
    embeddingDims: number;
  };
  project: string;
  region: string;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getAuthToken();
  const headers = new Headers(init?.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  if (!(init?.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(`/api${path}`, { ...init, headers });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(errBody.error || `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  health: async (): Promise<HealthInfo> => {
    const res = await fetch('/api/health');
    return res.json() as Promise<HealthInfo>;
  },
  getToday: (tz: string, ready: boolean) =>
    apiFetch<TodayResponse>(
      `/today?tz=${encodeURIComponent(tz)}&ready=${ready ? '1' : '0'}`
    ),
  listMemories: () => apiFetch<Memory[]>('/memories'),
  getMemory: (id: string, markOpen = false) =>
    apiFetch<Memory>(`/memories/${encodeURIComponent(id)}${markOpen ? '?open=1' : ''}`),
  createMemory: (formData: FormData) =>
    apiFetch<Memory>('/memories', { method: 'POST', body: formData }),
  patchMemory: (id: string, patch: Record<string, unknown>) =>
    apiFetch<Memory>(`/memories/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  deleteMemory: (id: string) =>
    apiFetch<{ ok: boolean }>(`/memories/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  undoLedger: (id: string, ledgerIndex: number) =>
    apiFetch<Memory>(`/memories/${encodeURIComponent(id)}/undo/${ledgerIndex}`, {
      method: 'POST',
    }),
  search: (q: string) =>
    apiFetch<SearchResponse>('/search', {
      method: 'POST',
      body: JSON.stringify({ q }),
    }),
  listCategories: () => apiFetch<Category[]>('/categories'),
  createCategory: (name: string) =>
    apiFetch<Category>('/categories', { method: 'POST', body: JSON.stringify({ name }) }),
  renameCategory: (id: string, name: string) =>
    apiFetch<Category>(`/categories/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    }),
  listProjects: () => apiFetch<Project[]>('/projects'),
  createProject: (data: { name: string; description: string; outcomeType: 'itinerary' | 'content_brief' }) =>
    apiFetch<Project>('/projects', { method: 'POST', body: JSON.stringify(data) }),
  buildProjectOutcome: (id: string) =>
    apiFetch<ProjectOutcome>(`/projects/${encodeURIComponent(id)}/outcome`, {
      method: 'POST',
    }),
  loadSamples: () => apiFetch<{ ok: boolean; count: number }>('/samples', { method: 'POST' }),
  exportAll: () => apiFetch<unknown>('/export'),
  importAll: (data: unknown) =>
    apiFetch<{ ok: boolean; imported: number }>('/import', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  deleteMe: () => apiFetch<{ ok: boolean }>('/me', { method: 'DELETE' }),
};

export async function fetchAuthorizedMediaUrl(memoryId: string, thumb = false): Promise<string | null> {
  const token = await getAuthToken();
  const res = await fetch(
    `/api/media/${encodeURIComponent(memoryId)}${thumb ? '?thumb=1' : ''}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  if (!res.ok) return null;
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}
