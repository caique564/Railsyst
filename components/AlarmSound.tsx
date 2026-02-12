
import React, { useEffect, useRef } from 'react';

interface AlarmSoundProps {
  play: boolean;
}

const AlarmSound: React.FC<AlarmSoundProps> = ({ play }) => {
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (play) {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      
      const ctx = audioContextRef.current;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();

      oscillator.type = 'square';
      oscillator.frequency.setValueAtTime(880, ctx.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.5);
      
      gain.gain.setValueAtTime(0.5, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1);

      oscillator.connect(gain);
      gain.connect(ctx.destination);

      oscillator.start();
      oscillator.stop(ctx.currentTime + 1);
    }
  }, [play]);

  return null;
};

export default AlarmSound;
