export enum EnergyLevel {
  High = 'high',
  Medium = 'medium',
  Low = 'low',
}

export enum BlockCategory {
  Focus = 'focus',
  Routine = 'routine',
  Errand = 'errand',
  Break = 'break',
}

export interface ScheduleBlock {
  id: string;
  startTime: string; // HH:MM 24h
  endTime: string;   // HH:MM 24h
  durationMinutes: number;
  title: string;
  category: BlockCategory;
  energyDemand: 'High' | 'Medium' | 'Low' | 'Recovery';
  note: string;
  completed: boolean;
  tags?: string[];
}

export interface DeferredItem {
  id: string;
  title: string;
  estimatedMinutes: number;
  reason: string;
}

export interface DayPlan {
  id: string;
  createdAt: string;
  dateLabel: string;
  rawDump: string;
  startWindow: string;
  finishWindow: string;
  energy: EnergyLevel;
  detectedLanguage: string;
  summaryNote: string;
  blocks: ScheduleBlock[];
  deferred: DeferredItem[];
}

export enum LoopMode {
  All = 'all',
  One = 'one',
  Off = 'off',
}

export interface LocalMusicTrack {
  id: string;
  name: string;
  fileName: string;
  sizeBytes: number;
  mimeType: string;
  objectUrl: string;
  durationSeconds?: number;
  addedAt: string;
}

export enum SuggestionCategory {
  Feature = 'feature',
  Improvement = 'improvement',
  Ux = 'ux',
  Bug = 'bug',
}

export enum SuggestionStatus {
  New = 'new',
  Reviewing = 'reviewing',
  Planned = 'planned',
  Implemented = 'implemented',
  Archived = 'archived',
}

export interface SuggestionItem {
  id: string;
  authorUid: string;
  authorName: string;
  authorEmail: string;
  category: SuggestionCategory;
  title: string;
  message: string;
  status: SuggestionStatus;
  ownerReply: string;
  createdAtMs: number;
  updatedAtMs: number;
}

