import { IHoverHandler, HoverServices } from "./IHoverHandler.ts";
import { TOOLTIP_WORD_CLASS } from "../consts/consts.ts";
import { state } from "../state/stateManager.ts";

export class DelegatedHoverHandler implements IHoverHandler {
  private currentHoveredWordSpan: HTMLElement | null = null;
  private wordLeaveTimeout: ReturnType<typeof setTimeout> | null = null;
  private lastSeekTime = 0;

  constructor(private readonly services: HoverServices) {}

  // Delegation intercepts all hover at the document level, so spans need no per-element listeners.
  setupWordSpan(_span: HTMLElement): void {}

  onCaptionWindowAdded(window: HTMLElement): void {
    window.addEventListener("wheel", this.handleWheel, { passive: false });
  }

  onCaptionWindowRemoved(window: HTMLElement): void {
    window.removeEventListener("wheel", this.handleWheel);
    this.services.tooltipService.deleteActiveTooltip();
    this.services.tooltipService.clearSelectedWords();
    // Don't resume video — user is likely still hovering the overlay above the removed window.
    // Reset tracking so the next pointermove re-detects spans if the subtitle re-appears.
    if (this.wordLeaveTimeout !== null) {
      clearTimeout(this.wordLeaveTimeout);
      this.wordLeaveTimeout = null;
    }
    this.currentHoveredWordSpan = null;
  }

  mount(): void {
    document.addEventListener("pointermove", this.handlePointerMove, { capture: true });
    document.addEventListener("click", this.handleClick, { capture: true });
  }

  private handlePointerMove = (event: PointerEvent): void => {
    const wordSpan = this.wordSpanAt(event.clientX, event.clientY);

    if (wordSpan !== null) {
      if (this.wordLeaveTimeout !== null) {
        clearTimeout(this.wordLeaveTimeout);
        this.wordLeaveTimeout = null;
      }
      if (wordSpan === this.currentHoveredWordSpan) return;
      if (this.currentHoveredWordSpan) {
        this.services.tooltipService.onWordLeave(this.currentHoveredWordSpan, event.shiftKey);
      }
      this.services.videoController.handleVideoPause();
      this.services.tooltipService.onWordEnter(wordSpan);
      this.currentHoveredWordSpan = wordSpan;
    } else if (this.currentHoveredWordSpan !== null && this.wordLeaveTimeout === null) {
      // Debounce leave to skip transient gaps between adjacent spans.
      const shiftKey = event.shiftKey;
      this.wordLeaveTimeout = setTimeout(() => {
        this.wordLeaveTimeout = null;
        if (this.currentHoveredWordSpan) {
          this.services.tooltipService.onWordLeave(this.currentHoveredWordSpan, shiftKey);
          this.currentHoveredWordSpan = null;
        }
        this.services.videoController.handleVideoPlay();
      }, 80);
    }
  };

  private handleClick = (event: MouseEvent): void => {
    if (this.wordSpanAt(event.clientX, event.clientY)) {
      this.services.tooltipService.handleWordClick();
    }
  };

  private handleWheel = (event: Event): void => {
    const seconds = state.settings.replaySeconds;
    if (!seconds) return;
    if ((event as WheelEvent).deltaY <= 0) return;
    event.preventDefault();
    event.stopPropagation();
    const now = Date.now();
    if (now - this.lastSeekTime < 400) return;
    this.lastSeekTime = now;
    this.services.videoController.seekBack(seconds);
  };

  private wordSpanAt(x: number, y: number): HTMLElement | null {
    return (document.elementsFromPoint(x, y).find(
      (el) => el instanceof HTMLElement && el.classList.contains(TOOLTIP_WORD_CLASS)
    ) ?? null) as HTMLElement | null;
  }
}