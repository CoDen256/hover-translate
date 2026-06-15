import { Headers as PolyfillHeaders } from "headers-polyfill";
(globalThis as unknown as { Headers: typeof PolyfillHeaders }).Headers = PolyfillHeaders;
import { TranslationCore } from "./core/translationCore.ts";
import { SubtitleCore } from "./core/subtitleCore.ts";
import { TooltipService } from "./services/tooltipService.ts";
import { VideoController } from "./core/videoController.ts";
import { MutationObserverService } from "./services/mutationObserverService.ts";
import { TranslatorFactory } from "../common/translators/TranslatorFactory.ts";
import { SiteAdapterRegistry } from "../common/adapters/SiteAdapterRegistry.ts";
import { YouTubeSiteAdapter } from "../common/adapters/YouTubeSiteAdapter.ts";

SiteAdapterRegistry.register(new YouTubeSiteAdapter());

const main = async () => {
  try {
    const adapter = SiteAdapterRegistry.getActiveAdapter();
    if (!adapter) return;

    const settings = await chrome.storage.sync.get("settings");

    const translatorKey = settings?.settings?.translator || "google";
    const translator = TranslatorFactory.create(translatorKey);

    const translationCore = new TranslationCore(translator);
    const tooltipService = new TooltipService(translationCore, adapter);
    const subtitleCore = new SubtitleCore(tooltipService, adapter);
    const videoController = new VideoController();
    new MutationObserverService(subtitleCore, videoController, tooltipService, adapter);
  } catch (error) {
    console.error(error);
  }
};

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.settings?.newValue) {
    main(); // Reinitialize the settings service when the settings change
  }
});

main();