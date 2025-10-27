// Check if Vibration API is supported (works on Android Chrome, not on iOS Safari)
const isVibrationSupported = () => {
  return 'vibrate' in navigator;
};

// For iOS, we can try to provide audio feedback as an alternative
const playTapSound = () => {
  try {
    // Create a very short audio context for tactile feedback
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = 200;
    gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.02);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.02);
  } catch (e) {
    // Silently fail if audio context is not available
  }
};

export const HapticManager = {
  impact: (style: 'light' | 'medium' | 'heavy' = 'light') => {
    if (isVibrationSupported()) {
      const duration = style === 'light' ? 20 : (style === 'medium' ? 40 : 60);
      navigator.vibrate(duration);
    } else {
      // Fallback for iOS - provide subtle audio feedback
      playTapSound();
    }
  },
  notification: (type: 'success' | 'warning' | 'error') => {
    if (isVibrationSupported()) {
      const pattern = type === 'success' ? [100, 50, 100] : (type === 'warning' ? [100, 50, 100, 50, 100] : [200, 50, 200]);
      navigator.vibrate(pattern);
    } else {
      // For iOS, play sound pattern
      if (type === 'success') {
        playTapSound();
        setTimeout(() => playTapSound(), 150);
      } else if (type === 'warning') {
        playTapSound();
        setTimeout(() => playTapSound(), 100);
        setTimeout(() => playTapSound(), 200);
      } else {
        playTapSound();
        setTimeout(() => playTapSound(), 250);
      }
    }
  }
};
