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
    /* The subtitle container sits at z-20 but the video controls are at z-30,
       and their areas overlap by ~16px. Elevate the subtitle container so word
       spans receive pointer events in that overlap zone. The container itself
       keeps pointer-events:none so controls remain fully interactive outside
       the subtitle text area. */
    div:has(> .cineby-cue) {
      z-index: 50 !important;
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