import { ISiteAdapter } from "./ISiteAdapter.ts";

/**
 * Central registry for site adapters.
 * Register adapters once at startup; the registry picks the right one for
 * the current page automatically.
 *
 * To add a new site: implement ISiteAdapter, then call
 * SiteAdapterRegistry.register(new MySiteAdapter()) in content.ts.
 */
export class SiteAdapterRegistry {
  private static readonly adapters: ISiteAdapter[] = [];

  static register(adapter: ISiteAdapter): void {
    this.adapters.push(adapter);
  }

  /** Returns the first registered adapter whose isMatch() returns true, or null. */
  static getActiveAdapter(): ISiteAdapter | null {
    return this.adapters.find((a) => a.isMatch()) ?? null;
  }

  /** For debugging: lists all registered adapter names. */
  static getRegisteredNames(): string[] {
    return this.adapters.map((a) => a.name);
  }
}