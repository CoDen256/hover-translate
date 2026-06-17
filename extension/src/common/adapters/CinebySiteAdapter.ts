import { ISiteAdapter } from "./ISiteAdapter.ts";

export class CinebySiteAdapter implements ISiteAdapter {
  readonly name = "Cineby";

  readonly captionContainerSelector = ".cineby-container";
  readonly captionWindowSelector = "div:has(> .cineby-cue)";
  readonly captionSegmentSelector = ".cineby-cue";

  readonly styles = `
    /* Make the subtitle span (including the <br> gap between lines) interactive
       so the cursor doesn't fall through to the video player between lines. */
    .cineby-cue {
      pointer-events: auto;
    }
    /* Elevate the caption window above the controls layer (z-30) so that
       pointer events in the overlap zone go to the subtitle, not the controls. */
    div:has(> .cineby-cue) {
      z-index: 50 !important;
      pointer-events: auto;
    }
  `;

  isMatch(): boolean {
    return /cineby\./.test(window.location.hostname);
  }

  getBoundingContainer(): Element | null {
    return (
      document.querySelector(".cineby-container") ??
      document.querySelector("video")
    );
  }

  // Styles (font, color, size) live on the parent div, not on .cineby-cue itself
  getStyleReferenceElement(): HTMLElement | null {
    return document.querySelector<HTMLElement>("div:has(> .cineby-cue)");
  }
}