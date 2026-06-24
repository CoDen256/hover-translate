import { TOOLTIP_WORD_CLASS, DATA_ATTRIBUTES } from "../consts/consts.ts";
import { TooltipService } from "../services/tooltipService.ts";
import { state } from "../state/stateManager.ts";
import { ISiteAdapter } from "../../common/adapters/ISiteAdapter.ts";

export class SubtitleCore {
  constructor(
    private readonly tooltipService: TooltipService,
    private readonly siteAdapter: ISiteAdapter,
  ) {}

  public setWordsIndexes = () => {
    const allWords = document.querySelectorAll(`.${TOOLTIP_WORD_CLASS}`);
    allWords.forEach((word, index) => {
      if (word instanceof HTMLElement) {
        word.setAttribute(DATA_ATTRIBUTES.INDEX, String(index));
      }
    });
  };

  private createWordSpan(word: string): HTMLElement {
    const wordSpan = document.createElement("span");
    wordSpan.classList.add(TOOLTIP_WORD_CLASS);
    wordSpan.textContent = word + " ";
    if (!this.siteAdapter.usePointerDelegation) {
      wordSpan.addEventListener("pointerenter", this.tooltipService.handleWordMouseEnter);
      wordSpan.addEventListener("pointerleave", this.tooltipService.handleWordMouseLeave);
    }
    let isDrag = false;
    let startX = 0;
    let startY = 0;
    const DRAG_THRESHOLD = 5;

    wordSpan.addEventListener("pointerdown", (e: PointerEvent) => {
      isDrag = false;
      startX = e.clientX;
      startY = e.clientY;
    });

    wordSpan.addEventListener("pointermove", (e: PointerEvent) => {
      const diffX = Math.abs(e.clientX - startX);
      const diffY = Math.abs(e.clientY - startY);
      if (diffX > DRAG_THRESHOLD || diffY > DRAG_THRESHOLD) {
        isDrag = true;
      }
    });

    wordSpan.addEventListener("pointerup", () => {
      if (!isDrag) {
        switch (state.settings.leftClickAction) {
        case "save-to-dictionary":
          this.tooltipService.saveTranslationToDictionary();
          break;
        case "copy-original":
          this.tooltipService.saveOriginalTextToClipboard();
          break;
        case "copy-translation":
          this.tooltipService.saveTranslationToClipboard();
          break;
        case "nothing":
          break;
        default:
          break;
        }
      }
    });

    return wordSpan;
  }

  // Recursively walks `node`'s children, appending word spans for text and
  // cloned <br> elements for forced line breaks into `fragment`.
  // Other element children are recursed into so nested inline wrappers
  // (e.g. bold/italic spans) don't lose their text.
  private collectSpans(node: Node, fragment: DocumentFragment): void {
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        const words = (child.textContent ?? "").split(/\s+/).filter(Boolean);
        words.forEach((word) => fragment.appendChild(this.createWordSpan(word)));
      } else if (child instanceof HTMLElement) {
        if (child.tagName === "BR") {
          fragment.appendChild(document.createElement("br"));
        } else {
          this.collectSpans(child, fragment);
        }
      }
    });
  }

  public splitCaptionIntoSpans(captionSegment: HTMLElement) {
    const fragment = document.createDocumentFragment();
    this.collectSpans(captionSegment, fragment);
    if (!fragment.hasChildNodes()) return;
    captionSegment.textContent = "";
    captionSegment.appendChild(fragment);
  }

  public updateCaptionWindowSize(): void {
    const segments = document.querySelectorAll(this.siteAdapter.captionSegmentSelector);
    let maxWidth = 0;

    segments.forEach((segment) => {
      if (segment instanceof HTMLElement) {
        const rect = segment.getBoundingClientRect();
        maxWidth = Math.max(maxWidth, rect.width);
      }
    });

    const captionWindow = document.querySelector(this.siteAdapter.captionWindowSelector);
    if (captionWindow instanceof HTMLElement) {
      captionWindow.style.width = `${maxWidth}px`;
    }
  }

  public handlePointerLeaveOnCaptionWindow = ((event: Event) => {
    const pointerEvent = event as PointerEvent;
    if (state.settings.alwaysMultipleSelection && !pointerEvent.shiftKey) {
      this.tooltipService.clearSelectedWords();
    }
  }) as EventListener;
}