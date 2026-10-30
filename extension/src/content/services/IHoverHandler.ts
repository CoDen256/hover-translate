import { TooltipService } from "./tooltipService.ts";
import { VideoController } from "../core/videoController.ts";

export interface HoverServices {
  tooltipService: TooltipService;
  videoController: VideoController;
}

export interface IHoverHandler {
  /** Add per-span event listeners for hover/click detection */
  setupWordSpan(span: HTMLElement): void;
  /** Wire up listeners when a caption window enters the DOM */
  onCaptionWindowAdded(window: HTMLElement): void;
  /** Clean up listeners and state when a caption window leaves the DOM */
  onCaptionWindowRemoved(window: HTMLElement): void;
  /** Called once at initialization — register any document-level listeners */
  mount(): void;
}