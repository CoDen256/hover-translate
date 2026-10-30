import { ISiteAdapter } from "../../common/adapters/ISiteAdapter.ts";
import { IHoverHandler, HoverServices } from "./IHoverHandler.ts";
import { DirectHoverHandler } from "./DirectHoverHandler.ts";
import { DelegatedHoverHandler } from "./DelegatedHoverHandler.ts";

export function createHoverHandler(adapter: ISiteAdapter, services: HoverServices): IHoverHandler {
  return adapter.hoverMode === "delegated"
    ? new DelegatedHoverHandler(services)
    : new DirectHoverHandler(services);
}