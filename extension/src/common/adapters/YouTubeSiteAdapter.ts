import { ISiteAdapter } from "./ISiteAdapter.ts";

export class YouTubeSiteAdapter implements ISiteAdapter {
  readonly name = "YouTube";

  readonly captionContainerSelector = ".ytp-caption-window-container";
  readonly captionWindowSelector = ".caption-window";
  readonly captionSegmentSelector = ".ytp-caption-segment";

  isMatch(): boolean {
    return /youtube\.com/.test(window.location.hostname);
  }

  getBoundingContainer(): Element | null {
    return (
      document.querySelector(".ytp-player-content") ??
      document.querySelector("video")
    );
  }

  getStyleReferenceElement(): HTMLElement | null {
    return document.querySelector<HTMLElement>(this.captionSegmentSelector);
  }
}