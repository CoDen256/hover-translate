import { DebugData, DebugSnapshot, DebugSubtitleEvent } from "../../common/types/debug.ts";

const MAX_SUBTITLE_EVENTS = 50;

export class DebugDataService {
  private snapshot: DebugSnapshot | null = null;
  private subtitleEvents: DebugSubtitleEvent[] = [];

  setSnapshot(snapshot: DebugSnapshot): void {
    this.snapshot = snapshot;
  }

  addSubtitleEvent(event: DebugSubtitleEvent): void {
    this.subtitleEvents.unshift(event);
    if (this.subtitleEvents.length > MAX_SUBTITLE_EVENTS) {
      this.subtitleEvents.length = MAX_SUBTITLE_EVENTS;
    }
  }

  getData(): DebugData {
    return {
      snapshot: this.snapshot,
      subtitleEvents: [...this.subtitleEvents],
    };
  }

  clear(): void {
    this.snapshot = null;
    this.subtitleEvents = [];
  }
}