"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Manages Web Audio API for bubble pop sounds.
 * Creates triangle/sine wave oscillators depending on bubble type.
 */
export function useSessionAudio() {
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioUnavailableRef = useRef(false);

  const playPopSound = useCallback((isBonus: boolean) => {
    if (typeof window === "undefined" || audioUnavailableRef.current) {
      return;
    }
    try {
      const contextCandidate = window as typeof window & {
        webkitAudioContext?: typeof AudioContext;
      };
      const AudioContextCtor = window.AudioContext || contextCandidate.webkitAudioContext;
      if (!AudioContextCtor) {
        audioUnavailableRef.current = true;
        return;
      }

      let audioContext = audioContextRef.current;
      if (!audioContext) {
        audioContext = new AudioContextCtor();
        audioContextRef.current = audioContext;
      }
      if (audioContext.state === "suspended") {
        void audioContext.resume();
      }

      const now = audioContext.currentTime;
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      oscillator.type = isBonus ? "triangle" : "sine";
      oscillator.frequency.setValueAtTime(isBonus ? 780 : 560, now);
      oscillator.frequency.exponentialRampToValueAtTime(
        isBonus ? 280 : 180,
        now + (isBonus ? 0.16 : 0.12),
      );

      gainNode.gain.setValueAtTime(0.0001, now);
      gainNode.gain.exponentialRampToValueAtTime(isBonus ? 0.08 : 0.06, now + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, now + (isBonus ? 0.2 : 0.14));

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      oscillator.start(now);
      oscillator.stop(now + (isBonus ? 0.22 : 0.16));
    } catch {
      audioUnavailableRef.current = true;
    }
  }, []);

  useEffect(() => {
    return () => {
      const currentAudioContext = audioContextRef.current;
      if (currentAudioContext) {
        void currentAudioContext.close();
      }
      audioContextRef.current = null;
    };
  }, []);

  return { playPopSound };
}
