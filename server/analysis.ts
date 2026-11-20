import crypto from 'node:crypto';
import type { LedgerEntry, Memory } from '../src/types/neophi.js';
import type { GeminiService } from './gemini.js';
import type { NeophiStore } from './store.js';

/** Asks for a category suggestion and files it under an existing or new category. Shared by every capture path. */
export async function suggestCategoryForMemory(
  store: NeophiStore,
  gemini: GeminiService,
  uid: string,
  memory: Memory
): Promise<{ categoryId: string; categoryWhy: string; ledger: LedgerEntry } | null> {
  const existingCats = await store.listCategories(uid);
  const suggestion = await gemini.suggestCategory(memory, existingCats);
  if (!suggestion) return null;
  let cat = existingCats.find((c) => c.name.toLowerCase() === suggestion.categoryName.toLowerCase());
  if (!cat) {
    cat = { id: crypto.randomUUID(), name: suggestion.categoryName, createdAt: new Date().toISOString() };
    await store.saveCategory(uid, cat);
  }
  return {
    categoryId: cat.id,
    categoryWhy: suggestion.why,
    ledger: {
      at: new Date().toISOString(),
      who: 'ai',
      text: `Filed under ${cat.name}`,
      undoable: true,
      undoAction: { field: 'categoryId', previousValue: null },
    },
  };
}
