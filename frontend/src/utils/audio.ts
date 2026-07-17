/**
 * Dynamically synthesizes a high-fidelity, futuristic notification chime
 * using the browser's Web Audio API. This avoids loading external MP3 files
 * and bypasses any CORS or asset-loading issues.
 */
export function playNotificationSound() {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    
    // Play a dual-tone pleasant synth chime
    const playTone = (freq: number, start: number, duration: number, type: 'sine' | 'triangle') => {
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      osc.type = type;
      osc.frequency.setValueAtTime(freq, start);
      
      // Pitch slide up slightly for a pleasant "upward" feeling
      osc.frequency.exponentialRampToValueAtTime(freq * 1.2, start + duration);

      gainNode.gain.setValueAtTime(0.0, start);
      gainNode.gain.linearRampToValueAtTime(0.15, start + 0.02); // fade in
      gainNode.gain.exponentialRampToValueAtTime(0.001, start + duration); // fade out

      osc.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      osc.start(start);
      osc.stop(start + duration);
    };

    const now = ctx.currentTime;
    
    // Play chime tones
    playTone(523.25, now, 0.4, 'sine');       // C5
    playTone(659.25, now + 0.08, 0.45, 'sine'); // E5
    playTone(783.99, now + 0.16, 0.5, 'triangle'); // G5
    playTone(1046.50, now + 0.24, 0.6, 'sine');  // C6
  } catch (error) {
    console.warn('Audio feedback failed or was blocked by browser autoplay policy:', error);
  }
}
