"use client";

import { useEffect, useRef } from "react";

/** Toca um alerta curto (sem arquivo de áudio) a cada `everyMs` enquanto `active` for true. */
export function useAlertSound(active: boolean, enabled: boolean, everyMs = 4000) {
  const ctx = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (!active || !enabled) return;
    const beep = () => {
      ctx.current ??= new AudioContext();
      const ac = ctx.current;
      const now = ac.currentTime;
      [0, 0.18, 0.36].forEach((offset, i) => {
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.type = "sine";
        osc.frequency.value = i === 2 ? 1320 : 880;
        gain.gain.setValueAtTime(0.0001, now + offset);
        gain.gain.exponentialRampToValueAtTime(0.4, now + offset + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.16);
        osc.connect(gain).connect(ac.destination);
        osc.start(now + offset);
        osc.stop(now + offset + 0.17);
      });
    };
    beep();
    const id = window.setInterval(beep, everyMs);
    return () => window.clearInterval(id);
  }, [active, enabled, everyMs]);

  /** Precisa ser chamado num clique (o navegador só libera som depois de uma interação). */
  return function unlock() {
    ctx.current ??= new AudioContext();
    void ctx.current.resume();
  };
}
