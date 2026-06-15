import { TranslatorFactory } from "../../common/translators/TranslatorFactory.ts";
import { DebugDataService } from "./debugDataService.ts";
import { DebugConfig, DebugSnapshot, DebugSubtitleEvent } from "../../common/types/debug.ts";

const DOM_CAPTURE_MAX_BYTES = 1_000_000; // 1 MB

// These functions are serialised and injected into the active tab via executeScript.
// They must be fully self-contained — no closures over outer variables.

function captureSnapshotFn(selector: string, maxBytes: number) {
  if (window !== window.top) return null;

  let html = document.documentElement.outerHTML;
  if (html.length > maxBytes) {
    html = html.substring(0, maxBytes) + "\n...[truncated]";
  }

  let scopedHtml = "";
  if (selector) {
    try {
      const el = document.querySelector(selector);
      if (el) {
        const scope = el.closest("[class]") ?? el;
        scopedHtml = (scope as HTMLElement).outerHTML ?? "";
      }
    } catch {
      /* invalid selector */
    }
  }

  return { html, scopedHtml, timestamp: Date.now() };
}

function startObserverFn(selector: string) {
  if (window !== window.top) return;

  const win = window as Window & { __htDebugObserver?: MutationObserver };
  win.__htDebugObserver?.disconnect();
  win.__htDebugObserver = undefined;

  if (!selector) return;

  let target: Element;
  try {
    target = document.querySelector(selector)?.parentElement ?? document.body;
  } catch {
    target = document.body;
  }

  const observer = new MutationObserver(() => {
    try {
      const els = document.querySelectorAll(selector);
      if (!els.length) return;
      const texts = Array.from(els)
        .map((e) => e.textContent?.trim() ?? "")
        .filter(Boolean);
      if (!texts.length) return;
      const html = Array.from(els)
        .map((e) => (e as HTMLElement).outerHTML)
        .join("\n");
      chrome.runtime.sendMessage({
        action: "debugSubtitleEvent",
        data: { texts, selector, timestamp: Date.now(), html },
      });
    } catch { /* ignore */ }
  });

  observer.observe(target, { childList: true, subtree: true, characterData: true });
  win.__htDebugObserver = observer;
  console.log("[HoverTranslate Debug] Observer started for:", selector);
}

function stopObserverFn() {
  const win = window as Window & { __htDebugObserver?: MutationObserver };
  win.__htDebugObserver?.disconnect();
  win.__htDebugObserver = undefined;
  console.log("[HoverTranslate Debug] Observer stopped");
}

export class MessageService {
  constructor(
    private readonly debugDataService: DebugDataService = new DebugDataService(),
  ) {
    this.setupMessageListeners();
  }

  private async getActiveTabId(): Promise<number | undefined> {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab?.id;
  }

  private setupMessageListeners(): void {
    chrome.runtime.onMessage.addListener((message, _, sendResponse) => {
      if (message.action === "openPopup") {
        chrome.action.openPopup()
          .then(() => sendResponse({ success: true }))
          .catch(() => sendResponse({ success: false }));
      }

      if (message.action === "getAvailableLanguages") {
        const translator = TranslatorFactory.create(message.value);
        translator.getAvailableLanguages().then((availableLanguages) => {
          sendResponse({ availableLanguages });
        });
      }

      // ── Debug: on-demand DOM + selector snapshot ──────────────────────────
      if (message.action === "captureDebugSnapshot") {
        (async () => {
          const tabId = await this.getActiveTabId();
          if (!tabId) { sendResponse({ success: false, error: "no active tab" }); return; }

          const stored = await chrome.storage.local.get("debugConfig");
          const config: DebugConfig | undefined = stored.debugConfig;
          const selector = config?.subtitleSelector ?? "";

          try {
            const [result] = await chrome.scripting.executeScript({
              target: { tabId, allFrames: false },
              func: captureSnapshotFn,
              args: [selector, DOM_CAPTURE_MAX_BYTES],
            });

            const data = result?.result as DebugSnapshot | null;
            if (data) {
              this.debugDataService.setSnapshot(data);
              console.log(
                `[Debug] Snapshot captured — html: ${data.html.length} bytes,` +
                ` scoped: ${data.scopedHtml.length} bytes`,
              );
            } else {
              console.warn("[Debug] Snapshot returned null (possibly an iframe or blocked page)");
            }
          } catch (err) {
            console.error("[Debug] executeScript capture failed:", err);
          }

          sendResponse({ success: true });
        })();
      }

      // ── Debug: start live subtitle observer in active tab ────────────────
      if (message.action === "startDebugObserver") {
        (async () => {
          const tabId = await this.getActiveTabId();
          if (!tabId) { sendResponse({ success: false }); return; }

          const stored = await chrome.storage.local.get("debugConfig");
          const config: DebugConfig | undefined = stored.debugConfig;
          const selector = config?.subtitleSelector ?? "";

          try {
            await chrome.scripting.executeScript({
              target: { tabId, allFrames: false },
              func: startObserverFn,
              args: [selector],
            });
            console.log("[Debug] Observer injected into tab", tabId, "selector:", selector);
          } catch (err) {
            console.error("[Debug] executeScript observer failed:", err);
          }
          sendResponse({ success: true });
        })();
      }

      // ── Debug: stop live subtitle observer ───────────────────────────────
      if (message.action === "stopDebugObserver") {
        (async () => {
          const tabId = await this.getActiveTabId();
          if (tabId) {
            try {
              await chrome.scripting.executeScript({
                target: { tabId, allFrames: false },
                func: stopObserverFn,
                args: [],
              });
            } catch { /* tab may be gone */ }
          }
          sendResponse({ success: true });
        })();
      }

      // ── Debug: data from injected observer arriving from content script ──
      if (message.action === "debugSubtitleEvent") {
        const event = message.data as DebugSubtitleEvent;
        this.debugDataService.addSubtitleEvent(event);
        console.log("[Debug] Subtitle event:", event.texts.join(" | "));
        sendResponse({ success: true });
      }

      if (message.action === "getDebugData") {
        sendResponse({ debugData: this.debugDataService.getData() });
      }

      if (message.action === "clearDebugData") {
        this.debugDataService.clear();
        console.log("[Debug] Data cleared");
        sendResponse({ success: true });
      }

      return true;
    });
  }
}