import type {
  ActionableEntity,
  CaptionSignal,
  CaptionUsefulness,
  KeyPoint,
  KeyPointKind,
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
  ReelType,
  SuggestedAction,
  TypeDetail,
  TypeDetailField,
} from '../src/types/neophi.js';
import {
  ASK_KINDS,
  ASK_STATUSES,
  CAPTION_USEFULNESS,
  KEY_POINT_KINDS,
  REEL_TYPES,
  TYPE_DETAIL_FIELDS,
  type AskKind,
  type AskStatus,
  type UserAsk,
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
const VALID_REEL_TYPES = new Set<ReelType>(REEL_TYPES);
const VALID_DETAIL_FIELDS = new Set<TypeDetailField>(TYPE_DETAIL_FIELDS);
/** At most this many type details are kept, so one reading cannot flood the page. */
export const MAX_TYPE_DETAILS = 12;

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
  /** The caption as saved; used to check that "useful parts" really come from it. */
  caption?: string | null;
}

const VALID_USEFULNESS = new Set<CaptionUsefulness>(CAPTION_USEFULNESS);
const VALID_KEY_POINT_KINDS = new Set<KeyPointKind>(KEY_POINT_KINDS);
const VALID_ASK_KINDS = new Set<AskKind>(ASK_KINDS);
const VALID_ASK_STATUSES = new Set<AskStatus>(ASK_STATUSES);
export const MAX_KEY_POINTS = 6;
const MAX_LINE = 160;
/** What the person asked for can be long (a whole speech or recipe), so the answer has its own, larger limit. */
export const MAX_ANSWER = 20000;
/** A "what this is" line must describe the item, not guess the person's reason. */
const REASON_GUESS = /\b(you|user|they|the person)\b[^.]{0,40}\b(saved|save|want|wants|wanted|plan|plans|planning|because|intend|might like)\b/i;

const squash = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
const clip = (s: string) => (s.length > MAX_LINE ? `${s.slice(0, MAX_LINE - 1).trimEnd()}…` : s);
const clipAnswer = (s: string) => (s.length > MAX_ANSWER ? `${s.slice(0, MAX_ANSWER - 1).trimEnd()}…` : s);

function guardCaptionSignal(raw: unknown, caption: string | null | undefined): CaptionSignal {
  const text = typeof caption === 'string' ? caption : '';
  if (!text.trim()) return { usefulness: 'none', useful_parts: [], ignored_reason: '' };
  const rec = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const rawUse = typeof rec.usefulness === 'string' ? rec.usefulness : '';
  let usefulness: CaptionUsefulness = VALID_USEFULNESS.has(rawUse as CaptionUsefulness)
    ? (rawUse as CaptionUsefulness)
    : 'mixed';
  if (usefulness === 'none') usefulness = 'noise';
  const hay = squash(text);
  const parts = Array.isArray(rec.useful_parts) ? rec.useful_parts : [];
  const useful_parts: string[] = [];
  if (usefulness !== 'noise') {
    for (const p of parts) {
      if (typeof p !== 'string') continue;
      const part = p.trim();
      // Only pieces that are really in the caption; nothing rewritten or added.
      if (!part || part.length > MAX_LINE || !hay.includes(squash(part))) continue;
      if (useful_parts.some((u) => squash(u) === squash(part))) continue;
      useful_parts.push(part);
      if (useful_parts.length >= 5) break;
    }
  }
  const reason = typeof rec.ignored_reason === 'string' ? clip(rec.ignored_reason.trim()) : '';
  return { usefulness, useful_parts, ignored_reason: reason };
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
      reel_type: 'personal_other',
      reel_type_confidence: 0,
      reel_type_evidence: [],
      reel_type_uncertain: true,
      type_details: [],
      caption_signal: { usefulness: 'none', useful_parts: [], ignored_reason: '' },
      what_this_is: '',
      key_points: [],
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

  // 0. Caption signal. A noise caption is not evidence for anything.
  const caption_signal = guardCaptionSignal(input.caption_signal, memory.caption);
  const captionIsNoise = caption_signal.usefulness === 'noise' || caption_signal.usefulness === 'none';

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

    // Rule: a caption judged to be noise (or no caption at all) cannot be cited.
    if (kind === 'caption' && captionIsNoise && memory.caption !== undefined) continue;

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

  // 5b. Reel type (fixed list) and type-specific details. A detail is a fact, so it needs surviving evidence.
  const rawType = typeof input.reel_type === 'string' ? input.reel_type : '';
  const reel_type: ReelType = VALID_REEL_TYPES.has(rawType as ReelType) ? (rawType as ReelType) : 'personal_other';
  const typeRefs = filterEvidenceRefs(input.reel_type_evidence);
  const reel_type_evidence = typeRefs.reliedOnlyOnDroppedMedia ? [] : typeRefs.surviving;
  const reel_type_confidence = clamp(input.reel_type_confidence, 0, 1);
  const reel_type_uncertain =
    reel_type_evidence.length === 0 || reel_type_confidence < NOT_SURE_CONFIDENCE_THRESHOLD;

  const rawDetails = Array.isArray(input.type_details) ? input.type_details : [];
  const type_details: TypeDetail[] = [];
  const seenDetails = new Set<string>();
  for (const item of rawDetails) {
    if (type_details.length >= MAX_TYPE_DETAILS) break;
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const field = typeof rec.field === 'string' ? rec.field : '';
    const value = typeof rec.value === 'string' ? rec.value.trim() : '';
    if (!value || !VALID_DETAIL_FIELDS.has(field as TypeDetailField)) continue;
    const { surviving } = filterEvidenceRefs(rec.evidence);
    if (surviving.length === 0) continue;
    const key = `${field}\u0000${value.toLowerCase()}`;
    if (seenDetails.has(key)) continue;
    seenDetails.add(key);
    type_details.push({ field: field as TypeDetailField, value, evidence: surviving });
  }

  // 5c. One line on what this is, and short key points. Points are facts, so they need surviving evidence.
  const rawWhat = typeof input.what_this_is === 'string' ? input.what_this_is.trim() : '';
  const what_this_is = rawWhat && !REASON_GUESS.test(rawWhat) ? clip(rawWhat) : '';

  const rawPoints = Array.isArray(input.key_points) ? input.key_points : [];
  const key_points: KeyPoint[] = [];
  for (const item of rawPoints) {
    if (key_points.length >= MAX_KEY_POINTS) break;
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const kindRaw = typeof rec.kind === 'string' ? rec.kind : 'fact';
    const kind: KeyPointKind = VALID_KEY_POINT_KINDS.has(kindRaw as KeyPointKind) ? (kindRaw as KeyPointKind) : 'fact';
    const text = typeof rec.text === 'string' ? rec.text.trim() : '';
    if (!text || REASON_GUESS.test(text)) continue;
    const { surviving } = filterEvidenceRefs(rec.evidence);
    if (surviving.length === 0) continue;
    if (key_points.some((k) => squash(k.text) === squash(text))) continue;
    key_points.push({ kind, text: clip(text), evidence: surviving });
  }

  // 5d. What the person asked in their note, and how far this save can answer it. The asking words are theirs and
  // come from the note, never from the model. A claim that the save answers it needs evidence that survived.
  let user_ask: UserAsk | undefined;
  if (hasNote && typeof memory.note === 'string') {
    const rawAsk = input.user_ask && typeof input.user_ask === 'object' ? (input.user_ask as Record<string, unknown>) : {};
    const kindRaw = typeof rawAsk.kind === 'string' ? rawAsk.kind : 'other';
    const kind: AskKind = VALID_ASK_KINDS.has(kindRaw as AskKind) ? (kindRaw as AskKind) : 'other';
    const statusRaw = typeof rawAsk.status === 'string' ? rawAsk.status : 'not_in_save';
    let status: AskStatus = VALID_ASK_STATUSES.has(statusRaw as AskStatus) ? (statusRaw as AskStatus) : 'not_in_save';
    const { surviving: askEvidence } = filterEvidenceRefs(rawAsk.answer_evidence);
    let answer = typeof rawAsk.answer === 'string' ? rawAsk.answer.trim() : '';
    // Only a short, line-like answer can be a guess at the person's reason; a long deliverable (a speech) may say "you" freely.
    if (answer.length <= 300 && REASON_GUESS.test(answer)) answer = '';
    if (status !== 'not_in_save' && (askEvidence.length === 0 || !answer)) {
      status = 'not_in_save';
      answer = '';
    }
    if (status === 'not_in_save') answer = '';
    let missing = typeof rawAsk.missing === 'string' ? rawAsk.missing.trim() : '';
    if (status !== 'found' && kind !== 'remember' && !missing) {
      missing = memory.ingest === 'full_media' ? 'This part is not in what was read.' : 'Only the link and caption were available, not the video.';
    }
    // A label ('for Maa') or a reminder asks nothing of the save's content, so there is nothing to answer or miss.
    if (kind === 'remember' || kind === 'reminder') {
      status = 'found';
      answer = '';
      missing = '';
    }
    if (status === 'found') missing = '';
    user_ask = {
      asked: memory.note,
      kind,
      status,
      answer: clipAnswer(answer),
      answer_evidence: status === 'not_in_save' ? [] : askEvidence,
      missing: clip(missing),
    };
  }

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
    reel_type,
    reel_type_confidence,
    reel_type_evidence,
    reel_type_uncertain,
    type_details,
    caption_signal,
    what_this_is,
    key_points,
    ...(user_ask ? { user_ask } : {}),
  };
}
