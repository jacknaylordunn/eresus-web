export const HapticManager = {
  impact: (style: 'light' | 'medium' | 'heavy' = 'light') => {
    if (window.navigator.vibrate) {
      const duration = style === 'light' ? 20 : (style === 'medium' ? 40 : 60);
      window.navigator.vibrate(duration);
    }
  },
  notification: (type: 'success' | 'warning' | 'error') => {
    if (window.navigator.vibrate) {
      const pattern = type === 'success' ? [100, 50, 100] : (type === 'warning' ? [100, 50, 100, 50, 100] : [200, 50, 200]);
      window.navigator.vibrate(pattern);
    }
  }
};
