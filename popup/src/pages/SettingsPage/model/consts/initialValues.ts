import { SettingsFormValues } from "../types/schema.ts";

export const initialFormValues: SettingsFormValues = {
  sourceLanguageCode: "auto",
  targetLanguageCode: "en",
  targetLanguageCodes: [],
  autoPause: true,
  translator: "google",
  leftClickAction: "save-to-dictionary",
  alwaysMultipleSelection: false,
  showNotifications: true,
};