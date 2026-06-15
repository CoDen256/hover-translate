export function isCaptionWindowInUpperHalf(
  captionContainerSelector: string,
  captionWindowSelector: string,
): boolean {
  const container = document.querySelector<HTMLElement>(captionContainerSelector);
  const captionWindow = document.querySelector<HTMLElement>(captionWindowSelector);

  if (!container || !captionWindow) {
    return false;
  }

  const containerRect = container.getBoundingClientRect();
  const captionWindowRect = captionWindow.getBoundingClientRect();

  const containerCenterY = containerRect.top + containerRect.height / 2;

  return captionWindowRect.top + captionWindowRect.height / 2 < containerCenterY;
}