export type Platform = 'instagram' | 'youtube' | 'web' | 'upload' | 'other';

export type MemoryChip =
  | 'Try'
  | 'Buy'
  | 'Learn'
  | 'Remix'
  | 'Go there'
  | 'Share with'
  | 'Just remember';

export type IngestKind = 'full_media' | 'link_metadata' | 'unsupported';

export type AnalysisStatus = 'pending' | 'done' | 'failed' | 'skipped';

export interface BBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type EvidenceKind = 'frame' | 'quote' | 'caption' | 'note';

export interface EvidenceItem {
  id: string;
  kind: EvidenceKind;
  ref: string;
  t?: number;
  tEnd?: number;
  bbox?: BBox | null;
}

export interface ObservedObject {
  label: string;
  where: string;
  bbox: BBox | null;
  confidence: number;
  evidence: string[];
  uncertain?: boolean;
}

export interface InferredIntent {
  intent: string;
  confidence: number;
  evidence: string[];
  origin: 'ai';
  label: 'AI suggestion';
  uncertain?: boolean;
}

export type EntityType = 'product' | 'place' | 'recipe' | 'tool' | 'person' | 'other';

export interface ActionableEntity {
  type: EntityType;
  name: string;
  evidence: string[];
  uncertain?: boolean;
}

export type SuggestedAction =
  | 'content_brief'
  | 'recipe_steps'
  | 'set_reminder'
  | 'itinerary_stop';

export type MemoryPurpose =
  | 'shop'
  | 'learn'
  | 'create'
  | 'travel'
  | 'food'
  | 'try_later'
  | 'other';

/** What kind of Reel or post this is, from a fixed list. `personal_other` when nothing fits or the source is unreadable. */
export const REEL_TYPES = [
  'recipe',
  'travel_place',
  'product_shopping',
  'tutorial_howto',
  'diy_home',
  'fitness',
  'fashion_style',
  'tech_tool',
  'finance',
  'news_explainer',
  'humour_meme',
  'music_dance',
  'quote_motivation',
  'event_offer',
  'personal_other',
] as const;
export type ReelType = (typeof REEL_TYPES)[number];

/**
 * Type-specific facts worth keeping (ingredients for a recipe, price and hours for a place).
 * Each one must cite evidence; the guard drops any that do not.
 */
export const TYPE_DETAIL_FIELDS = [
  'dish',
  'ingredient',
  'step',
  'time',
  'place',
  'area',
  'price',
  'hours',
  'product',
  'brand',
  'where_to_buy',
  'tool',
  'material',
  'exercise',
  'sets_reps',
  'item',
  'topic',
  'figure',
  'claim',
  'source',
  'date',
  'venue',
  'offer',
  'deadline',
  'song',
  'quote',
  'other',
] as const;
export type TypeDetailField = (typeof TYPE_DETAIL_FIELDS)[number];

export interface TypeDetail {
  field: TypeDetailField;
  value: string;
  evidence: string[];
}

/** How much the caption says about the item itself. `none` when there is no caption. */
export const CAPTION_USEFULNESS = ['informative', 'mixed', 'noise', 'none'] as const;
export type CaptionUsefulness = (typeof CAPTION_USEFULNESS)[number];

export interface CaptionSignal {
  usefulness: CaptionUsefulness;
  /** Short pieces copied from the caption that carry real information. */
  useful_parts: string[];
  /** One short line on what was ignored (hashtags, mentions, hooks), or empty. */
  ignored_reason: string;
}

export const KEY_POINT_KINDS = ['step', 'item', 'place', 'price', 'tool', 'date', 'fact'] as const;
export type KeyPointKind = (typeof KEY_POINT_KINDS)[number];

export interface KeyPoint {
  kind: KeyPointKind;
  text: string;
  evidence: string[];
}

/** What the person asked of a save in their own note. */
export const ASK_KINDS = ['full_text', 'summary', 'translate', 'explain', 'steps', 'details', 'place_or_product', 'reminder', 'remember', 'other'] as const;
export type AskKind = (typeof ASK_KINDS)[number];

/** Whether this save, as read, can give them what they asked for. */
export const ASK_STATUSES = ['found', 'partly', 'not_in_save'] as const;
export type AskStatus = (typeof ASK_STATUSES)[number];

export interface UserAsk {
  /** The person's own words, exactly as typed. Set by code, never by the model. */
  asked: string;
  kind: AskKind;
  status: AskStatus;
  /** The deliverable: only what the save's own evidence gives toward the ask (the whole text when they asked for it). Empty when there is nothing. */
  answer: string;
  answer_evidence: string[];
  /** What is missing and the simplest way to get it. Empty when the ask is found. */
  missing: string;
}

export type NoteGroundingStatus =
  | 'grounded'
  | 'not_sure'
  | 'no_note'
  | 'not_attempted';

export interface NoteGrounding {
  status: NoteGroundingStatus;
  evidence: string[];
  explanation: string;
}

export interface MemoryAnalysis {
  source_summary: string;
  evidence: EvidenceItem[];
  observed_objects: ObservedObject[];
  visible_text: string[];
  transcript_summary: string;
  inferred_possible_intents: InferredIntent[];
  actionable_entities: ActionableEntity[];
  suggested_actions: SuggestedAction[];
  purpose: MemoryPurpose;
  note_grounding: NoteGrounding;
  /** Added later; older readings do not have these. */
  reel_type?: ReelType;
  reel_type_confidence?: number;
  reel_type_evidence?: string[];
  /** True when the type has no evidence or a confidence under the not-sure threshold. */
  reel_type_uncertain?: boolean;
  type_details?: TypeDetail[];
  caption_signal?: CaptionSignal;
  /** One line saying what the item is. Never why the person saved it. */
  what_this_is?: string;
  key_points?: KeyPoint[];
  /** What the person's note asked of this save, and how far the save can answer it. Only when there is a note. */
  user_ask?: UserAsk;
}

export interface MemoryMedia {
  kind: 'image' | 'video' | 'none';
  mime: string;
  gcsPath: string;
  thumbPath: string | null;
  durationSec?: number;
  svgThumb?: string;
}

export interface LedgerEntry {
  at: string;
  who: 'you' | 'ai';
  text: string;
  undoable: boolean;
  undoAction?: {
    field: 'categoryId' | 'analysis' | 'projectIds';
    previousValue: unknown;
  };
}

/**
 * Outcome of trying the Meta-provided attachment route for an Instagram DM share.
 * Status classes only; never a URL.
 */
export type DmMediaOutcome =
  | 'pending'
  | 'stored'
  | 'no_link'
  | 'html'
  | 'expired'
  | 'forbidden'
  | 'too_large'
  | 'unsupported_type'
  | 'signature_mismatch'
  | 'origin_blocked'
  | 'timeout'
  | 'error';

/** What the stored analysis was actually based on. */
export type DmAnalysisBasis = 'media' | 'caption' | 'none';

/** Instagram DM capture facts for a memory that arrived by DM. Optional and backward compatible. */
export interface MemoryDmSource {
  channel: 'instagram_dm';
  /** Meta message ID of the share delivery. */
  shareMessageId: string;
  attachmentKind: 'ig_reel' | 'ig_post' | 'other';
  /** Time Meta reports for the share event (ISO). */
  capturedAt: string;
  mediaOutcome: DmMediaOutcome;
  mediaMime?: string;
  mediaBytes?: number;
  /** Set once an analysis is stored: whether the model actually received media. */
  analysisBasis?: DmAnalysisBasis;
  /** Bumped whenever the inputs to analysis change; older analysis jobs cannot overwrite newer results. */
  analysisGeneration: number;
  /** Delivery ID of the DM note currently held in `memory.note`, if any. */
  primaryNoteId: string | null;
  /** True when the share came from the "try without Instagram" sender, not from Instagram. Always labelled as such. */
  simulated?: boolean;
  /** The video could not be fetched by any source yet; it is tried again later. Cleared once the video is in. */
  mediaRetry?: MediaRetry;
}

export interface MediaRetry {
  state: 'waiting' | 'gave_up';
  /** Tries made so far, and the most that will be made. */
  attempt: number;
  max: number;
  /** When the next try is due (ISO). Only while waiting. */
  nextAt?: string;
}

/** One DM note, kept exactly as sent and keyed by its own delivery ID. */
export interface DmNote {
  deliveryId: string;
  text: string;
  /** Time Meta reports for the note event (ISO). */
  sentAt: string;
  attachedAt: string;
}

export interface Memory {
  id: string;
  createdAt: string;
  updatedAt: string;
  title: string;
  platform: Platform;
  url: string | null;
  caption: string | null;
  note: string | null;
  chip: MemoryChip | null;
  ingest: IngestKind;
  media: MemoryMedia | null;
  privateNoAI: boolean;
  analysis: MemoryAnalysis | null;
  analysisStatus: AnalysisStatus;
  categoryId: string | null;
  categoryWhy: string | null;
  categoryByAI: boolean;
  projectIds: string[];
  remindAt: string | null;
  doneAt: string | null;
  snoozedUntil: string | null;
  lastOpenedAt: string | null;
  ledger: LedgerEntry[];
  sample: boolean;
  /** Present only for memories captured from an Instagram DM. */
  dm?: MemoryDmSource;
  /** Every DM note for this memory, including the one shown as `note`. Never merged or rewritten. */
  dmNotes?: DmNote[];
}

export interface Category {
  id: string;
  name: string;
  createdAt: string;
}

export type OutcomeType = 'itinerary' | 'content_brief';

export interface Project {
  id: string;
  name: string;
  description: string;
  outcomeType: OutcomeType;
  createdAt: string;
  updatedAt: string;
}

export interface OutcomeLine {
  text: string;
  sourceMemoryId: string;
  sourceField: 'note' | 'caption' | 'ai_reading';
}

export interface OutcomeSection {
  title: string;
  lines: OutcomeLine[];
}

export interface ProjectOutcome {
  projectId: string;
  outcomeType: OutcomeType;
  draft: true;
  sections: OutcomeSection[];
  notKnown: string;
  generatedAt: string;
}

export interface SearchQueryUnderstanding {
  english: string;
  hindi: string;
  hinglish: string;
  keywords: string[];
  timeHint: 'last_week' | 'last_month' | null;
}

export interface SearchResultItem {
  memory: Memory;
  whyMatched: string;
  score: number;
}

export interface SearchResponse {
  understoodAs: SearchQueryUnderstanding;
  results: SearchResultItem[];
}

export interface TodayCard {
  memory: Memory;
  whySeeing: string;
  section:
    | 'just_arrived'
    | 'you_asked'
    | 'active_projects'
    | 'ready_for_hour'
    | 'before_it_fades'
    | 'weekly';
  projectName?: string;
}

export interface TodayResponse {
  isEmptyLibrary: boolean;
  justArrived: TodayCard[];
  youAskedForThis: TodayCard[];
  activeProjects: {
    project: Project;
    cards: TodayCard[];
  }[];
  readyForThisHour: {
    enabled: boolean;
    windowLabel: string;
    cards: TodayCard[];
  };
  beforeItFades: TodayCard | null;
  weeklyCard: {
    visible: boolean;
    savesCount: number;
    opensCount: number;
    cards: TodayCard[];
  };
}

export type LanguageCode = 'en' | 'hi' | 'hinglish';
