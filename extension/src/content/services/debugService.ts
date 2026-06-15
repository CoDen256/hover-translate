import { DebugConfig } from "../../common/types/debug.ts";

const DOM_SNAPSHOT_MAX_BYTES = 150_000;

export class DebugService {
  private subtitleObserver: MutationObserver | null = null;

  constructor(private readonly config: DebugConfig) {}

  start(): void {
    if (this.config.subtitleSelector) {
      this.startSubtitleObserver();
    }
  }

  stop(): void {
    this.subtitleObserver?.disconnect();
    this.subtitleObserver = null;
  }

  captureSnapshot(): void {
    if (window !== window.top) return; // only capture from the main frame

    let html = document.documentElement.outerHTML;
    if (html.length > DOM_SNAPSHOT_MAX_BYTES) {
      html = html.substring(0, DOM_SNAPSHOT_MAX_BYTES) + "\n...[truncated]";
    }

    let scopedHtml = "";
    if (this.config.subtitleSelector) {
      try {
        const el = document.querySelector(this.config.subtitleSelector);
        if (el) {
          const scope = el.closest("[class]") ?? el;
          scopedHtml = (scope as HTMLElement).outerHTML ?? "";
        }
      } catch {
        scopedHtml = "";
      }
    }

    chrome.runtime.sendMessage({
      action: "debugSnapshot",
      data: { html, scopedHtml, timestamp: Date.now() },
    }).catch(() => {});
  }

  private startSubtitleObserver(): void {
    if (window !== window.top) return; // only observe in the main frame
    let observeTarget: Element;
    try {
      const el = document.querySelector(this.config.subtitleSelector);
      observeTarget = el?.parentElement ?? document.body;
    } catch {
      observeTarget = document.body;
    }

    this.subtitleObserver = new MutationObserver(() => {
      try {
        const elements = document.querySelectorAll(this.config.subtitleSelector);
        if (elements.length === 0) return;

        const texts = Array.from(elements)
          .map((el) => el.textContent?.trim() ?? "")
          .filter(Boolean);

        if (texts.length === 0) return;

        const html = Array.from(elements)
          .map((el) => (el as HTMLElement).outerHTML)
          .join("\n");

        chrome.runtime.sendMessage({
          action: "debugSubtitleEvent",
          data: {
            texts,
            selector: this.config.subtitleSelector,
            timestamp: Date.now(),
            html,
          },
        }).catch(() => {});
      } catch {
        // Selector may be invalid — silently ignore
      }
    });

    this.subtitleObserver.observe(observeTarget, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }
}