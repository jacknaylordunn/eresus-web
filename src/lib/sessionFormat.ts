// Reads and writes the session format shared with the iOS app.
// The format is specified in docs/session-format.md; keep that file, docs/fixtures and this
// module in step with the iOS repo. The iOS App Store build decodes this JSON directly, so
// fields are only ever added, never renamed or retyped.

export const SESSION_FORMAT_VERSION = 2;

// iOS encodes dates as seconds since 1 January 2001 UTC.
const APPLE_EPOCH_MS = Date.UTC(2001, 0, 1);

const IOS_EVENT_TYPES = new Set(["status", "cpr", "shock", "analysis", "rhythm", "drug", "airway", "etco2", "cause"]);

export interface SessionEvent {
  id?: string;
  timestamp: number;
  message: string;
  type: string;
}

export interface SessionChecklistItem {
  id: string;
  name: string;
  isCompleted: boolean;
  hypothermiaStatus: string;
}

// The PWA's view of a session, as produced by generateTransferState and consumed on receive.
export interface SessionSnapshot {
  arrestState: string;
  masterTime: number;
  cprTime: number;
  timeOffset: number;
  events: SessionEvent[];
  shockCount: number;
  stackedShockExtra: number;
  adrenalineCount: number;
  amiodaroneCount: number;
  lidocaineCount: number;
  airwayPlaced: boolean;
  antiarrhythmicGiven: string;
  reversibleCauses: SessionChecklistItem[];
  postROSCTasks: SessionChecklistItem[];
  postMortemTasks: SessionChecklistItem[];
  patientAgeCategory: string | null;
  uiState: string;
  hideAdrenalinePrompt: boolean;
  hideAmiodaronePrompt: boolean;
  lastRhythmNonShockable: boolean;
  airwayAdjunct: string | null;
  roscTime: number | null;
  isTimerPaused: boolean;
  startTime: Date | null;
  cprCycleStartTime: number;
  lastAdrenalineTime: number | null;
  shockCountForAmiodarone1: number | null;
  initialRhythm: string | null;
  patientAgeStr: string;
  patientGenderStr: string;
  torTime: number | null;
  vodTime: number | null;
  vodChecklist: SessionChecklistItem[] | null;
  vodConfirmed: boolean;
}

export interface DecodedSession extends SessionSnapshot {
  formatVersion: number;
  arrestType: string;
}

const bytesToUtf8 = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

const utf8ToBase64 = (text: string): string => {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
};

const base64ToUtf8 = (text: string): string => {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytesToUtf8(bytes);
};

const isUUID = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

// iOS needs UUID ids; PWA items sometimes use plain strings.
const deterministicUUID = (seed: string): string => {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (Math.imul(31, hash) + seed.charCodeAt(i)) | 0;
  const hex = Math.abs(hash).toString(16).padStart(8, "0").slice(0, 8);
  return `${hex}-0000-4000-8000-000000000000`;
};

const toChecklist = (items: any[] = []): SessionChecklistItem[] =>
  items.map((item, index) => ({
    id: isUUID(item.id) ? item.id : deterministicUUID(`${item.name ?? "item"}-${item.id ?? index}`),
    name: item.name ?? "",
    isCompleted: item.isCompleted ?? false,
    hypothermiaStatus: item.hypothermiaStatus ?? "none",
  }));

const toWireEvents = (events: SessionEvent[]): SessionEvent[] =>
  events.map((event, index) => ({
    id: isUUID(event.id) ? event.id : deterministicUUID(`event-${index}-${event.timestamp}-${event.message}`),
    timestamp: event.timestamp ?? 0,
    message: event.message ?? "",
    type: IOS_EVENT_TYPES.has(event.type) ? event.type : "status",
  }));

const toAppleDate = (date: Date | null): number | null =>
  date ? (date.getTime() - APPLE_EPOCH_MS) / 1000 : null;

const fromWireDate = (value: unknown): Date | null => {
  if (typeof value === "number") return new Date(APPLE_EPOCH_MS + value * 1000);
  if (typeof value === "string") return new Date(value); // ISO strings from PWA builds before v1.3
  return null;
};

export const encodeSession = (session: SessionSnapshot): string => {
  const wire = {
    formatVersion: SESSION_FORMAT_VERSION,
    arrestState: session.arrestState,
    arrestType: "GENERAL",
    isPreterm: false,
    nlsState: "initialAssessment",
    nlsCycleDuration: 60,
    masterTime: session.masterTime,
    cprTime: session.cprTime,
    timeOffset: session.timeOffset,
    cprCycleStartTime: session.cprCycleStartTime,
    isRhythmCheckDue: false,
    eventsData: utf8ToBase64(JSON.stringify(toWireEvents(session.events))),
    shockCount: session.shockCount,
    stackedShockExtra: session.stackedShockExtra,
    adrenalineCount: session.adrenalineCount,
    amiodaroneCount: session.amiodaroneCount,
    lidocaineCount: session.lidocaineCount,
    lastAdrenalineTime: session.lastAdrenalineTime,
    antiarrhythmicGiven: session.antiarrhythmicGiven,
    shockCountForAmiodarone1: session.shockCountForAmiodarone1,
    airwayPlaced: session.airwayPlaced,
    airwayAdjunct: session.airwayAdjunct ?? "unspecified",
    reversibleCauses: toChecklist(session.reversibleCauses),
    postROSCTasks: toChecklist(session.postROSCTasks),
    postMortemTasks: toChecklist(session.postMortemTasks),
    nlsPretermTasks: [],
    startTime: toAppleDate(session.startTime),
    uiState: { [session.uiState]: {} },
    patientAgeCategory: session.patientAgeCategory,
    hideAdrenalinePrompt: session.hideAdrenalinePrompt,
    hideAmiodaronePrompt: session.hideAmiodaronePrompt,
    lastRhythmNonShockable: session.lastRhythmNonShockable,
    roscTime: session.roscTime,
    isTimerPaused: session.isTimerPaused,
    pauseStartTime: null,
    initialRhythm: session.initialRhythm,
    patientAgeStr: session.patientAgeStr,
    patientGenderStr: session.patientGenderStr,
    torTime: session.torTime,
    vodTime: session.vodTime,
    vodChecklist: session.vodChecklist ? toChecklist(session.vodChecklist) : null,
    vodConfirmed: session.vodConfirmed,
  };
  return JSON.stringify(wire);
};

// stateData arrives as JSON text, or as base64 of JSON from some older PWA builds.
export const parseStateData = (text: string): any => {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) return JSON.parse(trimmed);
  return JSON.parse(base64ToUtf8(trimmed));
};

// cycleDuration is needed only for sessions from older builds that don't carry cprCycleStartTime.
export const decodeSession = (wire: any, cycleDuration: number): DecodedSession => {
  let events: SessionEvent[] = Array.isArray(wire.events) ? wire.events : [];
  if (!Array.isArray(wire.events) && typeof wire.eventsData === "string") {
    try {
      events = JSON.parse(base64ToUtf8(wire.eventsData));
    } catch {
      events = [];
    }
  }

  const uiState =
    typeof wire.uiState === "object" && wire.uiState !== null
      ? (Object.keys(wire.uiState)[0] ?? "default")
      : (wire.uiState ?? "default");

  const masterTime = wire.masterTime ?? 0;
  const timeOffset = wire.timeOffset ?? 0;
  const cprTime = wire.cprTime ?? cycleDuration;
  const cprCycleStartTime =
    typeof wire.cprCycleStartTime === "number"
      ? wire.cprCycleStartTime
      : masterTime + timeOffset - (cycleDuration - cprTime);

  return {
    formatVersion: typeof wire.formatVersion === "number" ? wire.formatVersion : 1,
    arrestType: wire.arrestType ?? "GENERAL",
    arrestState: typeof wire.arrestState === "string" ? wire.arrestState.toUpperCase() : "ACTIVE",
    masterTime,
    cprTime,
    timeOffset,
    cprCycleStartTime,
    events: events.map((event) => ({
      id: event.id,
      timestamp: event.timestamp ?? 0,
      message: event.message ?? "",
      type: event.type ?? "status",
    })),
    shockCount: wire.shockCount ?? 0,
    stackedShockExtra: wire.stackedShockExtra ?? 0,
    adrenalineCount: wire.adrenalineCount ?? 0,
    amiodaroneCount: wire.amiodaroneCount ?? 0,
    lidocaineCount: wire.lidocaineCount ?? 0,
    airwayPlaced: wire.airwayPlaced ?? false,
    antiarrhythmicGiven: wire.antiarrhythmicGiven ?? "none",
    reversibleCauses: wire.reversibleCauses ?? [],
    postROSCTasks: wire.postROSCTasks ?? [],
    postMortemTasks: wire.postMortemTasks ?? [],
    patientAgeCategory: wire.patientAgeCategory ?? null,
    uiState,
    hideAdrenalinePrompt: wire.hideAdrenalinePrompt ?? false,
    hideAmiodaronePrompt: wire.hideAmiodaronePrompt ?? false,
    lastRhythmNonShockable: wire.lastRhythmNonShockable ?? false,
    airwayAdjunct: wire.airwayAdjunct ?? null,
    roscTime: wire.roscTime ?? null,
    isTimerPaused: wire.isTimerPaused ?? false,
    startTime: fromWireDate(wire.startTime),
    lastAdrenalineTime: wire.lastAdrenalineTime ?? null,
    shockCountForAmiodarone1: wire.shockCountForAmiodarone1 ?? null,
    initialRhythm: wire.initialRhythm ?? null,
    patientAgeStr: wire.patientAgeStr ?? "",
    patientGenderStr: wire.patientGenderStr ?? "",
    torTime: wire.torTime ?? null,
    vodTime: wire.vodTime ?? null,
    vodChecklist: wire.vodChecklist ?? null,
    vodConfirmed: wire.vodConfirmed ?? false,
  };
};
