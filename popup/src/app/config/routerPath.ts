export enum AppRoutes {
  SETTINGS = "settings",
  CUSTOMIZE = "customize",
  DICTIONARY = "dictionary",
  ABOUT = "about",
  DEBUG = "debug",
  SYNC = "sync",
  LOGIN = "login",
}

export const RouterPath: Record<AppRoutes, string> = {
  [AppRoutes.SETTINGS]: "/",
  [AppRoutes.CUSTOMIZE]: "/customize",
  [AppRoutes.DICTIONARY]: "/dictionary",
  [AppRoutes.ABOUT]: "/about",
  [AppRoutes.DEBUG]: "/debug",
  [AppRoutes.SYNC]: "/sync",
  [AppRoutes.LOGIN]: "/login",
};
