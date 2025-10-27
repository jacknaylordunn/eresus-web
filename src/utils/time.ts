export const TimeFormatter = {
  format: (timeInterval: number): string => {
    const time = Math.max(0, Math.floor(timeInterval));
    const minutes = Math.floor(time / 60);
    const seconds = time % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
};
