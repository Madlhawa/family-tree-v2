export type Sex = 'male' | 'female' | 'unknown' | 'other';
export type LivingStatus = 'auto' | 'living' | 'deceased';
export type Confidence = 'confirmed' | 'probable' | 'story';

export const EVENT_TYPES = [
  'birth',
  'death',
  'marriage',
  'baptism',
  'burial',
  'residence',
  'education',
  'occupation',
  'military',
  'migration',
  'custom',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export interface LifeEvent {
  id: string;
  type: EventType;
  /** Free label, used for custom events (e.g. "Emigrated to Canada"). */
  label?: string;
  /** Date exactly as the user typed it. Parsed on the fly. */
  date?: string;
  place?: string;
  note?: string;
  source?: string;
  confidence: Confidence;
  /** Marks one of several conflicting records of the same event. */
  disputed?: boolean;
}

export interface MediaItem {
  id: string;
  kind: 'image' | 'audio';
  /** data: URL or http(s) URL */
  data: string;
  caption?: string;
}

export interface PersonLink {
  id: string;
  label: string;
  url: string;
}

export interface SocialHandle {
  id: string;
  platform: string;
  handle: string;
}

export interface Person {
  id: string;
  given: string;
  surname: string;
  /** Maiden / birth surname */
  birthSurname?: string;
  otherNames: string[];
  title?: string;
  sex: Sex;
  living: LivingStatus;
  occupation?: string;
  bio?: string;
  /** Profile photo (data URL) */
  photo?: string;
  media: MediaItem[];
  links: PersonLink[];
  socials: SocialHandle[];
  events: LifeEvent[];
  /** "Unknown" stand-in person to be filled in later. */
  placeholder?: boolean;
  createdAt: number;
  updatedAt: number;
}

export type ChildKind = 'birth' | 'adopted' | 'step' | 'foster';
export type FamilyStatus = 'married' | 'partners' | 'divorced' | 'widowed' | 'unknown';

export interface FamilyChild {
  id: string;
  kind: ChildKind;
}

/** A union: up to two partners plus their children (like GEDCOM FAM). */
export interface Family {
  id: string;
  partners: string[];
  children: FamilyChild[];
  status: FamilyStatus;
  date?: string;
  place?: string;
  /** When true the children array order is the user's chosen order. */
  manualOrder: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface StoryStep {
  personId: string;
  caption: string;
}

export interface Story {
  id: string;
  title: string;
  steps: StoryStep[];
}

export interface TreeData {
  version: 2;
  id: string;
  name: string;
  homeId?: string;
  people: Record<string, Person>;
  families: Record<string, Family>;
  stories: Story[];
  createdAt: number;
  updatedAt: number;
}

export interface TreeMeta {
  id: string;
  name: string;
  peopleCount: number;
  updatedAt: number;
}
