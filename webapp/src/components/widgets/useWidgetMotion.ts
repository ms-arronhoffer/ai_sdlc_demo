"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Shared client-side motion helpers for the interactive demo widgets.
 *
 * These power the "world-class" feel of the widgets — cinematic step playback,
 * live-ticking counters, and typewriter answer reveals — while always honouring
 * the user's `prefers-reduced-motion` setting so the experience stays
 * accessible and never becomes distracting.
 */

/** Tracks the user's reduced-motion preference reactively. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return reduced;
}

/**
 * Reveals `text` one character at a time. When `active` is false, or the user
 * prefers reduced motion, the full text is shown immediately. Returns the
 * currently visible slice and whether typing has finished.
 */
export function useTypewriter(
  text: string,
  active: boolean,
  speedMs = 14,
): { shown: string; done: boolean } {
  const reduced = usePrefersReducedMotion();
  const [count, setCount] = useState(active ? 0 : text.length);

  useEffect(() => {
    if (!active || reduced) {
      setCount(text.length);
      return;
    }
    setCount(0);
    if (!text) return;
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setCount(i);
      if (i >= text.length) window.clearInterval(id);
    }, speedMs);
    return () => window.clearInterval(id);
  }, [text, active, reduced, speedMs]);

  return { shown: text.slice(0, count), done: count >= text.length };
}

/**
 * Eases a number from 0 up to `target` over `durationMs` using a smooth
 * ease-out curve, driven by `requestAnimationFrame`. Restarts whenever
 * `runKey` changes. When `active` is false or reduced motion is preferred, the
 * target value is returned immediately.
 */
export function useCountUp(
  target: number,
  active: boolean,
  runKey: unknown,
  durationMs = 700,
): number {
  const reduced = usePrefersReducedMotion();
  const [value, setValue] = useState(active ? 0 : target);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    if (!active || reduced) {
      setValue(target);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(target * eased);
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, active, reduced, durationMs, runKey]);

  return value;
}
