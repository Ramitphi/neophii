import type {
  ActionableEntity,
  BBox,
  EntityType,
  EvidenceItem,
  EvidenceKind,
  InferredIntent,
  IngestKind,
  MemoryAnalysis,
  MemoryPurpose,
  NoteGrounding,
  NoteGroundingStatus,
  ObservedObject,
  SuggestedAction,
} from '../src/types/neophi.js';

export const NOT_SURE_CONFIDENCE_THRESHOLD = 0.45;

const VALID_EVIDENCE_KINDS = new Set<EvidenceKind>(['frame', 'quote', 'caption', 'note']);
const VALID_ENTITY_TYPES = new Set<EntityType>(['product', 'place', 'recipe', 'tool', 'person', 'other']);
const VALID_PURPOSES = new Set<MemoryPurpose>([
  'shop',
  'learn',
  'create',
  'travel',
  'food',
  'try_later',
  'other',
]);
const VALID_ACTIONS = new Set<SuggestedAction>([
  'content_brief',
  'recipe_steps',
  'set_reminder',
  'itinerary_stop',
]);
const VALID_GROUNDING_STATUSES = new Set<NoteGroundingStatus>([
  'grounded',
  'not_sure',
  'no_note',
  'not_attempted',
]);

/**
 * Preserves the user's note byte-for-byte.
 * Only an empty or whitespace-only note becomes null.
 */
export function normalizeUserNote(rawNote: string | null | undefined): string | null {
  if (typeof rawNote !== 'string') return null;
  if (rawNote.trim().length === 0) return null;
  return rawNote;
}

function clamp(val: unknown, min: number, max: number): number {
  const num = typeof val === 'number' && Number.isFinite(val) ? val : 0;
  return Math.min(max, Math.max(min, num));
}

function clampBBox(raw: unknown): BBox | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (
    typeof obj.x !== 'number' &&
    typeof obj.y !== 'number' &&
    typeof obj.w !== 'number' &&
    typeof obj.h !== 'number'
  ) {
    return null;
  }
  return {
    x: clamp(obj.x, 0, 100),
    y: clamp(obj.y, 0, 100),
    w: clamp(obj.w, 0, 100),
    h: clamp(obj.h, 0, 100),
  };
}

export interface GuardMemoryContext {
  ingest: IngestKind;
  note: string | null;
}

/**
 * Pure guard function that every AI output must pass through before storage or display.
 */
export function guardAnalysis(raw: unknown, memory: GuardMemoryContext): MemoryAnalysis {
  const hasNote = normalizeUserNote(memory.note) !== null;

  // Rule: unsupported keeps nothing about the source.
  if (memory.ingest === 'unsupported') {
    return {
      source_summary: '',
      evidence: [],
      observed_objects: [],
      visible_text: [],
      transcript_summary: '',
      inferred_possible_intents: [],
      actionable_entities: [],
      suggested_actions: [],
      purpose: 'other',
      note_grounding: hasNote
        ? {
            status: 'not_attempted',
            evidence: [],
            explanation: 'The source could not be read, so your note was not matched against it.',
          }
        : {
            status: 'no_note',
            evidence: [],
            explanation: '',
          },
    };
  }

  const input = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};

  // 1. Validate & deduplicate evidence
  const rawEvidence = Array.isArray(input.evidence) ? input.evidence : [];
  const seenIds = new Set<string>();
  const droppedFrameOrQuoteIds = new Set<string>();
  const evidence: EvidenceItem[] = [];

  for (const item of rawEvidence) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const id = typeof rec.id === 'string' ? rec.id.trim() : '';
    const ref = typeof rec.ref === 'string' ? rec.ref.trim() : '';
    const kind = rec.kind as EvidenceKind;

    if (!id || !ref || !VALID_EVIDENCE_KINDS.has(kind)) continue;
    if (seenIds.has(id)) continue;
    seenIds.add(id);

    // Rule: link_metadata keeps only caption and note evidence, drops frame and quote.
    if (memory.ingest === 'link_metadata' && (kind === 'frame' || kind === 'quote')) {
      droppedFrameOrQuoteIds.add(id);
      continue;
    }

    const ev: EvidenceItem = {
      id,
      kind,
      ref,
    };
    if (typeof rec.t === 'number' && Number.isFinite(rec.t)) {
      ev.t = Math.max(0, rec.t);
    }
    if (typeof rec.tEnd === 'number' && Number.isFinite(rec.tEnd)) {
      ev.tEnd = Math.max(ev.t ?? 0, rec.tEnd);
    }
    if (rec.bbox !== undefined) {
      ev.bbox = clampBBox(rec.bbox);
    }
    evidence.push(ev);
  }

  const validEvidenceIds = new Set(evidence.map((e) => e.id));

  const filterEvidenceRefs = (
    refs: unknown
  ): { surviving: string[]; reliedOnlyOnDroppedMedia: boolean } => {
    const arr = Array.isArray(refs)
      ? refs.filter((r): r is string => typeof r === 'string' && r.trim().length > 0)
      : [];
    const surviving = arr.filter((id) => validEvidenceIds.has(id));
    const hadDroppedMediaRef = arr.some((id) => droppedFrameOrQuoteIds.has(id));
    const reliedOnlyOnDroppedMedia =
      memory.ingest === 'link_metadata' && hadDroppedMediaRef && surviving.length === 0;
    return { surviving, reliedOnlyOnDroppedMedia };
  };

  // 2. Observed objects
  const rawObserved = Array.isArray(input.observed_objects) ? input.observed_objects : [];
  const observed_objects: ObservedObject[] = [];
  for (const item of rawObserved) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const label = typeof rec.label === 'string' ? rec.label.trim() : '';
    if (!label) continue;
    const { surviving, reliedOnlyOnDroppedMedia } = filterEvidenceRefs(rec.evidence);
    if (reliedOnlyOnDroppedMedia) continue;

    const confidence = clamp(rec.confidence, 0, 1);
    const uncertain = surviving.length === 0 || confidence < NOT_SURE_CONFIDENCE_THRESHOLD;
    observed_objects.push({
      label,
      where: typeof rec.where === 'string' ? rec.where : '',
      bbox: clampBBox(rec.bbox),
      confidence,
      evidence: surviving,
      ...(uncertain ? { uncertain: true } : {}),
    });
  }

  // 3. Inferred possible intents (always tagged origin: "ai", label: "AI suggestion")
  const rawIntents = Array.isArray(input.inferred_possible_intents)
    ? input.inferred_possible_intents
    : [];
  const inferred_possible_intents: InferredIntent[] = [];
  for (const item of rawIntents) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const intent = typeof rec.intent === 'string' ? rec.intent.trim() : '';
    if (!intent) continue;
    const { surviving, reliedOnlyOnDroppedMedia } = filterEvidenceRefs(rec.evidence);
    if (reliedOnlyOnDroppedMedia) continue;

    const confidence = clamp(rec.confidence, 0, 1);
    const uncertain = surviving.length === 0 || confidence < NOT_SURE_CONFIDENCE_THRESHOLD;
    inferred_possible_intents.push({
      intent,
      confidence,
      evidence: surviving,
      origin: 'ai',
      label: 'AI suggestion',
      ...(uncertain ? { uncertain: true } : {}),
    });
  }

  // 4. Actionable entities
  const rawEntities = Array.isArray(input.actionable_entities) ? input.actionable_entities : [];
  const actionable_entities: ActionableEntity[] = [];
  for (const item of rawEntities) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const name = typeof rec.name === 'string' ? rec.name.trim() : '';
    if (!name) continue;
    const { surviving, reliedOnlyOnDroppedMedia } = filterEvidenceRefs(rec.evidence);
    if (reliedOnlyOnDroppedMedia) continue;

    const rawType = typeof rec.type === 'string' ? rec.type : 'other';
    const type: EntityType = VALID_ENTITY_TYPES.has(rawType as EntityType)
      ? (rawType as EntityType)
      : 'other';

    actionable_entities.push({
      type,
      name,
      evidence: surviving,
      ...(surviving.length === 0 ? { uncertain: true } : {}),
    });
  }

  // 5. Suggested actions & purpose
  const rawActions = Array.isArray(input.suggested_actions) ? input.suggested_actions : [];
  const suggested_actions: SuggestedAction[] = [];
  for (const act of rawActions) {
    if (typeof act === 'string' && VALID_ACTIONS.has(act as SuggestedAction)) {
      if (!suggested_actions.includes(act as SuggestedAction)) {
        suggested_actions.push(act as SuggestedAction);
      }
    }
  }

  const rawPurpose = typeof input.purpose === 'string' ? input.purpose : 'other';
  const purpose: MemoryPurpose = VALID_PURPOSES.has(rawPurpose as MemoryPurpose)
    ? (rawPurpose as MemoryPurpose)
    : 'other';

  // 6. Visible text & transcript (dropped for link_metadata since no media)
  const visible_text =
    memory.ingest === 'link_metadata'
      ? []
      : Array.isArray(input.visible_text)
        ? input.visible_text.filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
        : [];

  const transcript_summary =
    memory.ingest === 'link_metadata'
      ? ''
      : typeof input.transcript_summary === 'string'
        ? input.transcript_summary
        : '';

  // 7. Note grounding
  let note_grounding: NoteGrounding;
  if (!hasNote) {
    note_grounding = {
      status: 'no_note',
      evidence: [],
      explanation: '',
    };
  } else {
    const rawGrounding =
      input.note_grounding && typeof input.note_grounding === 'object'
        ? (input.note_grounding as Record<string, unknown>)
        : {};
    const rawStatus = typeof rawGrounding.status === 'string' ? rawGrounding.status : 'not_sure';
    let status: NoteGroundingStatus = VALID_GROUNDING_STATUSES.has(rawStatus as NoteGroundingStatus)
      ? (rawStatus as NoteGroundingStatus)
      : 'not_sure';

    if (status === 'no_note') {
      status = 'not_sure';
    }

    const { surviving } = filterEvidenceRefs(rawGrounding.evidence);
    if (status === 'grounded' && surviving.length === 0) {
      status = 'not_sure';
    }

    note_grounding = {
      status,
      evidence: surviving,
      explanation:
        typeof rawGrounding.explanation === 'string' ? rawGrounding.explanation : '',
    };
  }

  return {
    source_summary: typeof input.source_summary === 'string' ? input.source_summary : '',
    evidence,
    observed_objects,
    visible_text,
    transcript_summary,
    inferred_possible_intents,
    actionable_entities,
    suggested_actions,
    purpose,
    note_grounding,
  };
}
