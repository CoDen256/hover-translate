import {
  TOOLTIP_WORD_CLASS,
} from "../consts/consts";

import { SubtitleCore } from "../core/subtitleCore";
import { VideoController } from "../core/videoController";
import { TooltipService } from "./tooltipService.ts";
import { ISiteAdapter } from "../../common/adapters/ISiteAdapter.ts";
import { state } from "../state/stateManager.ts";

const CONFIG = {
  // Poll interval when the caption container hasn't appeared in the DOM yet.
  CONTAINER_POLL_INTERVAL: 1000,
  // How often to check that the observer is still alive.
  HEALTH_CHECK_INTERVAL: 30000,
  // How often to check for SPA navigation (pathname comparison).
  URL_POLL_INTERVAL: 3000,
} as const;

const LOG_MESSAGES = {
  OBSERVING_STARTED: "[MutationObserverService] Observing started",
  NO_CONTAINER: "[MutationObserverService] No container, polling...",
  TAB_VISIBLE: "[MutationObserverService] Tab is visible, reinit observer",
  PAGE_RESTORED: "[MutationObserverService] Page restored from cache, reinit observer",
  URL_CHANGED: "[MutationObserverService] URL changed, reinit observer",
  HISTORY_METHODS_ERROR: "[MutationObserverService] Failed to override history methods:",
} as const;

export class MutationObserverService {
  private observer: MutationObserver;
  private urlObserver?: MutationObserver;
  // setInterval ID used while polling for the caption container to appear.
  private containerPollId: ReturnType<typeof setInterval> | null = null;
  private lastSeekTime = 0;
  private currentHoveredWordSpan: HTMLElement | null = null;
  private wordLeaveTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly subtitleCore: SubtitleCore,
    private readonly videoController: VideoController,
    private readonly tooltipService: TooltipService,
    private readonly siteAdapter: ISiteAdapter,
  ) {
    this.observer = new MutationObserver(this.handleMutations);

    this.startObserving();
    this.initVisibilityListener();
    this.initUrlObserver();

    if (this.siteAdapter.usePointerDelegation) {
      document.addEventListener("pointermove", this.handleDocumentPointerMove, { capture: true });
      document.addEventListener("click", this.handleDocumentClick, { capture: true });
    }
  }

  private handleMutations = (mutations: MutationRecord[]): void => {
    mutations.forEach((mutation) => {
      if (mutation.type === "characterData") {
        this.handleCharacterDataMutation(mutation);
        return;
      }

      this.checkForNewWords(mutation);

      mutation.addedNodes.forEach((node) => {
        this.handleAddedNode(node);
      });

      mutation.removedNodes.forEach((node) => {
        this.handleRemovedNode(node);
      });
    });
  };

  private handleCharacterDataMutation(mutation: MutationRecord): void {
    const textNode = mutation.target;
    const parent = textNode.parentElement;
    if (!parent) return;

    if (parent.matches(this.siteAdapter.captionSegmentSelector)) {
      this.subtitleCore.splitCaptionIntoSpans(parent);
      return;
    }

    const segment = parent.closest(this.siteAdapter.captionSegmentSelector);
    if (segment instanceof HTMLElement) {
      this.subtitleCore.splitCaptionIntoSpans(segment);
    }
  }

  private checkForNewWords(mutation: MutationRecord): void {
    const hasNewWord = Array.from(mutation.addedNodes).some(
      (node) => node instanceof Element && node.classList.contains(TOOLTIP_WORD_CLASS)
    );

    if (hasNewWord) {
      this.tooltipService.clearSelectedWords();
      this.subtitleCore.setWordsIndexes();
    }
  }

  private handleAddedNode(node: Node): void {
    if (node instanceof Element) {
      if (node instanceof HTMLElement && node.matches(this.siteAdapter.captionSegmentSelector)) {
        this.subtitleCore.splitCaptionIntoSpans(node);
      }

      node.querySelectorAll(this.siteAdapter.captionSegmentSelector).forEach((segment) => {
        if (segment instanceof HTMLElement) {
          this.subtitleCore.splitCaptionIntoSpans(segment);
        }
      });

      if (this.siteAdapter.manageCaptionWindowWidth) {
        this.subtitleCore.updateCaptionWindowSize();
      }

      if (node.matches(this.siteAdapter.captionWindowSelector)) {
        node.addEventListener("pointerenter", this.videoController.handleVideoPause);
        node.addEventListener("pointerleave", this.videoController.handleVideoPlay);
        node.addEventListener("pointerleave", this.subtitleCore.handlePointerLeaveOnCaptionWindow);
        node.addEventListener("wheel", this.handleCaptionWheel, { passive: false });
      }
    }

    if (node.nodeType === Node.TEXT_NODE) {
      const captionSegment = node.parentElement;
      if (captionSegment && captionSegment.matches(this.siteAdapter.captionSegmentSelector)) {
        this.subtitleCore.splitCaptionIntoSpans(captionSegment);
      }
    }
  }

  private handleRemovedNode(node: Node): void {
    if (node instanceof Element && node.matches(this.siteAdapter.captionWindowSelector)) {
      node.removeEventListener("pointerenter", this.videoController.handleVideoPause);
      node.removeEventListener("pointerleave", this.videoController.handleVideoPlay);
      node.removeEventListener("pointerleave", this.subtitleCore.handlePointerLeaveOnCaptionWindow);
      node.removeEventListener("wheel", this.handleCaptionWheel);
      this.tooltipService.deleteActiveTooltip();
      this.tooltipService.clearSelectedWords();
      if (this.siteAdapter.usePointerDelegation) {
        // Don't resume — user is likely still hovering. Reset tracking so the
        // next pointermove re-detects the new spans and re-pauses if needed.
        if (this.wordLeaveTimeout !== null) {
          clearTimeout(this.wordLeaveTimeout);
          this.wordLeaveTimeout = null;
        }
        this.currentHoveredWordSpan = null;
      } else {
        this.videoController.handleVideoPlay();
      }
    }
  }

  /**
   * Attaches the MutationObserver to the caption container.
   * If the container is not in the DOM yet, starts a 1s polling interval
   * that self-cancels the moment the container appears. Only one poll is
   * ever active at a time, so rapid calls (e.g. from URL changes) don't stack.
   */
  private startObserving(): void {
    this.stopObserving();

    const captionContainer = document.querySelector(this.siteAdapter.captionContainerSelector);
    if (captionContainer) {
      this.observer.observe(captionContainer, {
        childList: true,
        subtree: true,
        characterData: true,
      });
      // eslint-disable-next-line no-console
      console.log(LOG_MESSAGES.OBSERVING_STARTED);
      return;
    }

    // eslint-disable-next-line no-console
    console.log(LOG_MESSAGES.NO_CONTAINER);

    // Poll cheaply until the container appears. The guard in stopObserving()
    // ensures we never run more than one interval at a time.
    this.containerPollId = setInterval(() => {
      const container = document.querySelector(this.siteAdapter.captionContainerSelector);
      if (container) {
        this.stopObserving(); // clears the interval
        this.startObserving(); // now finds the container
      }
    }, CONFIG.CONTAINER_POLL_INTERVAL);
  }

  private handleCaptionWheel = (event: Event): void => {
    const seconds = state.settings.replaySeconds;
    if (!seconds) return;
    if ((event as WheelEvent).deltaY <= 0) return;
    event.preventDefault();
    event.stopPropagation();
    const now = Date.now();
    if (now - this.lastSeekTime < 400) return;
    this.lastSeekTime = now;
    this.videoController.seekBack(seconds);
  };

  private handleDocumentClick = (event: MouseEvent): void => {
    const elements = document.elementsFromPoint(event.clientX, event.clientY);
    const wordSpan = elements.find(
      (el) => el instanceof HTMLElement && el.classList.contains(TOOLTIP_WORD_CLASS)
    );
    if (wordSpan) {
      this.tooltipService.handleWordClick();
    }
  };

  private handleDocumentPointerMove = (event: PointerEvent): void => {
    const elements = document.elementsFromPoint(event.clientX, event.clientY);
    const wordSpan = (elements.find(
      (el) => el instanceof HTMLElement && el.classList.contains(TOOLTIP_WORD_CLASS)
    ) ?? null) as HTMLElement | null;

    if (wordSpan !== null) {
      // Entering a word — cancel any pending leave debounce
      if (this.wordLeaveTimeout !== null) {
        clearTimeout(this.wordLeaveTimeout);
        this.wordLeaveTimeout = null;
      }
      if (wordSpan === this.currentHoveredWordSpan) return;
      if (this.currentHoveredWordSpan) {
        this.tooltipService.onWordLeave(this.currentHoveredWordSpan, event.shiftKey);
      }
      this.videoController.handleVideoPause();
      this.tooltipService.onWordEnter(wordSpan);
      this.currentHoveredWordSpan = wordSpan;
    } else if (this.currentHoveredWordSpan !== null && this.wordLeaveTimeout === null) {
      // Left all word spans — debounce to skip transient gaps between adjacent spans
      const shiftKey = event.shiftKey;
      this.wordLeaveTimeout = setTimeout(() => {
        this.wordLeaveTimeout = null;
        if (this.currentHoveredWordSpan) {
          this.tooltipService.onWordLeave(this.currentHoveredWordSpan, shiftKey);
          this.currentHoveredWordSpan = null;
        }
        this.videoController.handleVideoPlay();
      }, 80);
    }
  };

  private stopObserving(): void {
    this.observer.disconnect();
    if (this.containerPollId !== null) {
      clearInterval(this.containerPollId);
      this.containerPollId = null;
    }
  }

  private initVisibilityListener(): void {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        // eslint-disable-next-line no-console
        console.log(LOG_MESSAGES.TAB_VISIBLE);
        this.startObserving();
      }
    });

    window.addEventListener("pageshow", (event) => {
      if (event.persisted) {
        // eslint-disable-next-line no-console
        console.log(LOG_MESSAGES.PAGE_RESTORED);
        this.startObserving();
      }
    });

    // Safety net: restart if somehow neither observer nor poll is active.
    setInterval(() => {
      if (this.containerPollId === null) {
        const captionContainer = document.querySelector(this.siteAdapter.captionContainerSelector);
        if (!captionContainer) this.startObserving();
      }
    }, CONFIG.HEALTH_CHECK_INTERVAL);
  }

  /**
   * Detects SPA navigations and restarts the observer for the new page.
   *
   * history.replaceState is intentionally NOT overridden — sites like Netflix
   * call it dozens of times per second (tracking playback position), which
   * would cause startObserving() to be hammered and freeze the page.
   * pushState, popstate, hashchange, and title-mutation cover real navigations.
   */
  private initUrlObserver(): void {
    // Compare pathname only — ignores query-param changes (e.g. Netflix ?t=123).
    let oldPath = document.location.pathname;

    const handleUrlChange = () => {
      const newPath = document.location.pathname;
      if (oldPath !== newPath) {
        oldPath = newPath;
        // eslint-disable-next-line no-console
        console.log(LOG_MESSAGES.URL_CHANGED);
        this.startObserving();
      }
    };

    // Title mutations fire on most SPA navigations.
    const titleElement = document.querySelector("title");
    if (titleElement) {
      this.urlObserver = new MutationObserver(handleUrlChange);
      this.urlObserver.observe(titleElement, { childList: true });
    }

    window.addEventListener("popstate", handleUrlChange);
    window.addEventListener("hashchange", handleUrlChange);

    const originalPushState = history.pushState;
    try {
      history.pushState = function (...args) {
        originalPushState.apply(this, args);
        handleUrlChange();
      };
    } catch (error) {
      console.error(LOG_MESSAGES.HISTORY_METHODS_ERROR, error);
    }

    // Periodic fallback for sites that navigate only via replaceState.
    setInterval(handleUrlChange, CONFIG.URL_POLL_INTERVAL);
  }
}