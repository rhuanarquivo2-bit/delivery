"use client";

import { useCallback, useEffect, useRef } from "react";

type Tone = { at: number; freq: number; dur: number; type?: OscillatorType };

/** Campainha de pedido novo (sobe) e aviso de cancelado (desce, mais grave). Sem arquivo de áudio. */
const SOUNDS: Record<"new" | "cancel", Tone[]> = {
  new: [
    { at: 0, freq: 880, dur: 0.16 },
    { at: 0.18, freq: 1175, dur: 0.16 },
    { at: 0.36, freq: 1568, dur: 0.3 },
  ],
  cancel: [
    { at: 0, freq: 523, dur: 0.22, type: "square" },
    { at: 0.26, freq: 392, dur: 0.22, type: "square" },
    { at: 0.52, freq: 262, dur: 0.4, type: "square" },
  ],
};

/**
 * Sons da cozinha. O navegador só libera som depois de um toque na tela, por isso
 * `unlock` precisa ser chamado num clique. `repeat` toca a campainha a cada `everyMs`
 * enquanto for true (pedido novo esperando a cozinha aceitar).
 */
export function useKitchenSound(enabled: boolean, repeat: boolean, everyMs = 6000) {
  const ctx = useRef<AudioContext | null>(null);

  const play = useCallback(
    (kind: "new" | "cancel") => {
      if (!enabled) return;
      try {
        ctx.current ??= new AudioContext();
        const ac = ctx.current;
        if (ac.state === "suspended") void ac.resume();
        const now = ac.currentTime;
        for (const tone of SOUNDS[kind]) {
          const osc = ac.createOscillator();
          const gain = ac.createGain();
          osc.type = tone.type ?? "sine";
          osc.frequency.value = tone.freq;
          const volume = tone.type === "square" ? 0.15 : 0.45;
          gain.gain.setValueAtTime(0.0001, now + tone.at);
          gain.gain.exponentialRampToValueAtTime(volume, now + tone.at + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + tone.at + tone.dur);
          osc.connect(gain).connect(ac.destination);
          osc.start(now + tone.at);
          osc.stop(now + tone.at + tone.dur + 0.02);
        }
      } catch {
        // sem áudio neste aparelho: a tela continua funcionando
      }
    },
    [enabled],
  );

  useEffect(() => {
    if (!enabled || !repeat) return;
    play("new");
    const id = window.setInterval(() => play("new"), everyMs);
    return () => window.clearInterval(id);
  }, [enabled, repeat, everyMs, play]);

  const unlock = useCallback(() => {
    try {
      ctx.current ??= new AudioContext();
      void ctx.current.resume();
    } catch {
      // ignore
    }
  }, []);

  return { play, unlock };
}
