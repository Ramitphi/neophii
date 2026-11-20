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
