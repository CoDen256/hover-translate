import { state } from "../state/stateManager.ts";

export class VideoController {
  private userPausedVideo = false;
  private wasPausedByScript = false;
  private replayGuard: (() => void) | null = null;

  public handleVideoPause = () => {
    if (!state.settings.autoPause) return;

    const video = this.getVideoElement();
    if (!video) return;

    this.userPausedVideo = video.paused;
    if (!this.userPausedVideo) {
      video.pause();
      this.wasPausedByScript = true;

      // Some sites (e.g. Cineby) call video.play() when the cursor leaves their
      // controls, which races with our pause. Re-pause whenever play fires while
      // the cursor is still in the subtitle area.
      if (!this.replayGuard) {
        this.replayGuard = () => {
          if (this.wasPausedByScript) {
            video.pause();
          }
        };
        video.addEventListener("play", this.replayGuard);
      }
    }
  };

  public handleVideoPlay = () => {
    if (!state.settings.autoPause) return;

    const video = this.getVideoElement();
    if (!video) return;

    this.removeReplayGuard(video);

    if (this.wasPausedByScript) {
      video.play();
      this.wasPausedByScript = false;
    }
  };

  private removeReplayGuard(video: HTMLVideoElement): void {
    if (this.replayGuard) {
      video.removeEventListener("play", this.replayGuard);
      this.replayGuard = null;
    }
  }

  private getVideoElement(): HTMLVideoElement | null {
    return document.querySelector("video");
  }
}