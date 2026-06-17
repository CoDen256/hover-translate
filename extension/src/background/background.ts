// import { TokenService } from "./services/tokenService.ts";
import { SettingsService } from "./services/settingsService.ts";
import {  MessageService } from "./services/messageService.ts";
import { DebugDataService } from "./services/debugDataService.ts";
import { AnkiBackgroundService } from "./services/ankiBackgroundService.ts";

const main = () => {
  try {
    // new TokenService();

    const debugDataService = new DebugDataService();
    new MessageService(debugDataService);
    new SettingsService();
    new AnkiBackgroundService();
  } catch (error) {
    console.error(error);
  }
};

main();