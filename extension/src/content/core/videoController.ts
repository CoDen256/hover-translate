import { state } from "../state/stateManager.ts";

export class VideoController {
  private userPausedVideo = false;
  private wasPausedByScript = false;
  private replayGuard: (() => void) | null = null;
  private seekingUntil = 0;

  public handleVideoPause = () => {
    if (!state.settings.autoPause) return;
    if (Date.now() < this.seekingUntil) return;

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

  public seekBack(seconds: number): void {
    const video = this.getVideoElement();
    if (!video) return;
    this.removeReplayGuard(video);
    this.wasPausedByScript = false;
    // Suppress handleVideoPause for 1s so a subtitle DOM re-enter after the seek
    // doesn't immediately re-pause the video.
    this.seekingUntil = Date.now() + 1000;
    video.currentTime = Math.max(0, video.currentTime - seconds);
    video.play();
  }

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