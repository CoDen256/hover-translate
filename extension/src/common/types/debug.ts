export interface DebugConfig {
  enabled: boolean;
  subtitleSelector: string;
  snapshotIntervalMs: number;
}

export interface DebugSnapshot {
  html: string;
  scopedHtml: string;
  timestamp: number;
}

export interface DebugSubtitleEvent {
  texts: string[];
  selector: string;
  timestamp: number;
  html: string;
}

export interface DebugData {
  snapshot: DebugSnapshot | null;
  subtitleEvents: DebugSubtitleEvent[];
}

export const defaultDebugConfig: DebugConfig = {
  enabled: false,
  subtitleSelector: "",
  snapshotIntervalMs: 3000,
};