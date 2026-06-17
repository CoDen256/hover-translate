import { AnkiService, AnkiAuthError, AnkiHistoryEntry } from "../../common/services/AnkiService.ts";

interface AnkiCredentials {
  email: string;
  password: string;
}

interface AnkiSettings {
  enabled: boolean;
  deckId: number | null;
  notetypeId: number | null;
  frontFieldIndex: number;
  backFieldIndex: number;
}

const DEFAULT_ANKI_SETTINGS: AnkiSettings = {
  enabled: false,
  deckId: null,
  notetypeId: null,
  frontFieldIndex: 0,
  backFieldIndex: 1,
};

const HISTORY_MAX = 50;

export class AnkiBackgroundService {
  private readonly anki = new AnkiService();
  private loggedInEmail: string | null = null;

  constructor() {
    this.setupMessageListeners();
  }

  private setupMessageListeners(): void {
    chrome.runtime.onMessage.addListener((message, _, sendResponse) => {
      if (message.action === "ankiLogin") {
        this.handleLogin(message.data).then(sendResponse);
        return true;
      }

      if (message.action === "ankiLogout") {
        this.handleLogout().then(sendResponse);
        return true;
      }

      if (message.action === "ankiGetStatus") {
        this.handleGetStatus().then(sendResponse);
        return true;
      }

      if (message.action === "ankiGetInfo") {
        this.handleGetInfo().then(sendResponse);
        return true;
      }

      if (message.action === "ankiGetNotetypeFields") {
        this.handleGetNotetypeFields(message.data).then(sendResponse);
        return true;
      }

      if (message.action === "ankiAddCard") {
        this.handleAddCard(message.data).then(sendResponse);
        return true;
      }

      if (message.action === "ankiGetHistory") {
        this.handleGetHistory().then(sendResponse);
        return true;
      }

      if (message.action === "ankiTestCard") {
        this.handleTestCard(message.data).then(sendResponse);
        return true;
      }
    });
  }

  private async handleLogin(data: { email: string; password: string }) {
    try {
      await this.anki.login(data.email, data.password);
      this.loggedInEmail = data.email;
      await chrome.storage.local.set({ ankiCredentials: { email: data.email, password: data.password } as AnkiCredentials });
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Login failed" };
    }
  }

  private async handleLogout() {
    this.loggedInEmail = null;
    await chrome.storage.local.remove("ankiCredentials");
    return { success: true };
  }

  private async handleGetStatus() {
    if (this.loggedInEmail !== null) {
      return { success: true, data: { loggedIn: true, email: this.loggedInEmail } };
    }
    // SW may have restarted — check persisted credentials and try to restore session
    const stored = await chrome.storage.local.get("ankiCredentials");
    const creds: AnkiCredentials | undefined = stored.ankiCredentials;
    if (!creds) return { success: true, data: { loggedIn: false, email: null } };

    try {
      await this.anki.login(creds.email, creds.password);
      this.loggedInEmail = creds.email;
      return { success: true, data: { loggedIn: true, email: this.loggedInEmail } };
    } catch {
      return { success: true, data: { loggedIn: false, email: null } };
    }
  }

  private async handleGetInfo() {
    return this.withRelogin(async () => {
      const info = await this.anki.getInfo();
      return { success: true, data: info };
    });
  }

  private async handleGetNotetypeFields(data: { notetypeId: number }) {
    return this.withRelogin(async () => {
      const fields = await this.anki.getNotetypeFields(data.notetypeId);
      return { success: true, data: fields };
    });
  }

  private async handleAddCard(data: { front: string; back: string; tags?: string }) {
    const stored = await chrome.storage.sync.get("ankiSettings");
    const settings: AnkiSettings = stored.ankiSettings ?? DEFAULT_ANKI_SETTINGS;

    if (!settings.enabled) return { success: true };
    if (!settings.deckId || !settings.notetypeId) return { success: false, error: "Anki not configured" };

    const result = await this.withRelogin(async () => {
      const fieldsResult = await this.anki.getNotetypeFields(settings.notetypeId!);
      const fields = Array(fieldsResult.length).fill("");
      fields[settings.frontFieldIndex] = data.front;
      fields[settings.backFieldIndex] = data.back;
      await this.anki.addCard(settings.deckId!, settings.notetypeId!, fields, data.tags);
      return { success: true };
    });

    await this.appendHistory({
      front: data.front,
      back: data.back,
      timestamp: Date.now(),
      success: (result as { success: boolean }).success,
      error: (result as { error?: string }).error,
    });

    return result;
  }

  private async handleTestCard(data: { front: string; back: string }) {
    const stored = await chrome.storage.sync.get("ankiSettings");
    const settings: AnkiSettings = stored.ankiSettings ?? DEFAULT_ANKI_SETTINGS;

    if (!settings.deckId || !settings.notetypeId) {
      return { success: false, error: "Anki not configured — select a deck and note type first" };
    }

    return this.withRelogin(async () => {
      const fieldsResult = await this.anki.getNotetypeFields(settings.notetypeId!);
      const fields = Array(fieldsResult.length).fill("");
      fields[settings.frontFieldIndex] = data.front;
      fields[settings.backFieldIndex] = data.back;
      await this.anki.addCard(settings.deckId!, settings.notetypeId!, fields);
      return { success: true };
    });
  }

  private async handleGetHistory() {
    const stored = await chrome.storage.local.get("ankiHistory");
    return { success: true, data: (stored.ankiHistory ?? []) as AnkiHistoryEntry[] };
  }

  private async appendHistory(entry: AnkiHistoryEntry): Promise<void> {
    const stored = await chrome.storage.local.get("ankiHistory");
    const history: AnkiHistoryEntry[] = stored.ankiHistory ?? [];
    history.unshift(entry);
    if (history.length > HISTORY_MAX) history.length = HISTORY_MAX;
    await chrome.storage.local.set({ ankiHistory: history });
  }

  private async withRelogin<T>(fn: () => Promise<T>): Promise<T | { success: false; error: string }> {
    try {
      return await fn();
    } catch (err) {
      if (!(err instanceof AnkiAuthError)) {
        return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
      }

      const stored = await chrome.storage.local.get("ankiCredentials");
      const creds: AnkiCredentials | undefined = stored.ankiCredentials;
      if (!creds) return { success: false, error: "Not logged in" };

      try {
        await this.anki.login(creds.email, creds.password);
        this.loggedInEmail = creds.email;
        return await fn();
      } catch {
        this.loggedInEmail = null;
        return { success: false, error: "Session expired — please log in again" };
      }
    }
  }
}
