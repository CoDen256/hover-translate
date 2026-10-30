import { IHoverHandler, HoverServices } from "./IHoverHandler.ts";
import { state } from "../state/stateManager.ts";

export class DirectHoverHandler implements IHoverHandler {
  private lastSeekTime = 0;

  constructor(private readonly services: HoverServices) {}

  setupWordSpan(span: HTMLElement): void {
    span.addEventListener("pointerenter", this.services.tooltipService.handleWordMouseEnter);
    span.addEventListener("pointerleave", this.services.tooltipService.handleWordMouseLeave);

    let isDrag = false;
    let startX = 0;
    let startY = 0;
    const DRAG_THRESHOLD = 5;

    span.addEventListener("pointerdown", (e: PointerEvent) => {
      isDrag = false;
      startX = e.clientX;
      startY = e.clientY;
    });

    span.addEventListener("pointermove", (e: PointerEvent) => {
      if (Math.abs(e.clientX - startX) > DRAG_THRESHOLD || Math.abs(e.clientY - startY) > DRAG_THRESHOLD) {
        isDrag = true;
      }
    });

    span.addEventListener("pointerup", () => {
      if (!isDrag) {
        this.services.tooltipService.handleWordClick();
      }
    });
  }

  onCaptionWindowAdded(window: HTMLElement): void {
    window.addEventListener("pointerenter", this.services.videoController.handleVideoPause);
    window.addEventListener("pointerleave", this.services.videoController.handleVideoPlay);
    window.addEventListener("pointerleave", this.handleCaptionWindowLeave);
    window.addEventListener("wheel", this.handleWheel, { passive: false });
  }

  onCaptionWindowRemoved(window: HTMLElement): void {
    window.removeEventListener("pointerenter", this.services.videoController.handleVideoPause);
    window.removeEventListener("pointerleave", this.services.videoController.handleVideoPlay);
    window.removeEventListener("pointerleave", this.handleCaptionWindowLeave);
    window.removeEventListener("wheel", this.handleWheel);
    this.services.tooltipService.deleteActiveTooltip();
    this.services.tooltipService.clearSelectedWords();
    this.services.videoController.handleVideoPlay();
  }

  mount(): void {}

  private handleCaptionWindowLeave = (event: Event): void => {
    if (state.settings.alwaysMultipleSelection && !(event as PointerEvent).shiftKey) {
      this.services.tooltipService.clearSelectedWords();
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
}