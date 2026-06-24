import { ISiteAdapter } from "./ISiteAdapter.ts";

export class NetflixSiteAdapter implements ISiteAdapter {
  readonly name = "Netflix";

  readonly captionContainerSelector = ".player-timedtext";
  readonly captionWindowSelector = ".player-timedtext-text-container";
  // Direct child combinators prevent injected .ht-tooltip-word spans (one level
  // deeper) from matching and creating an infinite splitCaptionIntoSpans loop.
  readonly captionSegmentSelector = ".player-timedtext-text-container > span > span";

  readonly usePointerDelegation = true;

  readonly styles = `
    .player-timedtext-text-container,
    .player-timedtext-text-container span {
      pointer-events: auto !important;
    }
  `;

  isMatch(): boolean {
    return /netflix\.com/.test(window.location.hostname);
  }

  getBoundingContainer(): Element | null {
    return (
      document.querySelector(".player-timedtext")?.parentElement ??
      document.querySelector("video")
    );
  }

  getStyleReferenceElement(): HTMLElement | null {
    return document.querySelector<HTMLElement>(this.captionSegmentSelector);
  }
}