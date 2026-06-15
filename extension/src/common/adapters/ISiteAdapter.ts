/**
 * Defines how a specific website exposes its subtitle DOM.
 * Implement this interface and register it in SiteAdapterRegistry to add
 * support for a new site without touching any existing code.
 */
export interface ISiteAdapter {
  /** Human-readable name, used in logs and debug output. */
  readonly name: string;

  /** CSS selector for the outermost subtitle container (what MutationObserver watches). */
  readonly captionContainerSelector: string;

  /** CSS selector for the element that wraps an individual caption line/window. */
  readonly captionWindowSelector: string;

  /** CSS selector for a single caption text segment (words are split inside these). */
  readonly captionSegmentSelector: string;

  /** Returns true when this adapter should handle the current page. */
  isMatch(): boolean;

  /**
   * Returns the element used to constrain tooltip positioning (width + horizontal clamp).
   * Typically the player container. Does NOT require a <video> element.
   */
  getBoundingContainer(): Element | null;

  /**
   * Optional: returns the element whose computed styles are used to inherit
   * font/colour/size for the tooltip when "use site settings" is on.
   * Defaults to querying captionSegmentSelector if not implemented.
   */
  getStyleReferenceElement?(): HTMLElement | null;
}