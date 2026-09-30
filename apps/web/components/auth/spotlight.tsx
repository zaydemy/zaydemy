"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * The sign-in stage's light: one pool of light that eases toward the pointer
 * like a heavy stage light (8% of the distance per frame), writing its
 * position to `--spot-x` / `--spot-y` for everything below (the card border
 * lights up where it falls; see globals.css).
 *
 * It rests on the card (`data-spot-home`), or on an element that declares
 * itself the target (`data-spot-target`, e.g. the active code digit), and
 * returns there after 1.5s without pointer movement. On touch screens it stays
 * home and breathes; with reduced motion it does not move.
 */
export function Spotlight({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = root.current;
    if (!element) return;

    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const touch = window.matchMedia("(pointer: coarse)").matches;

    const center = (node: Element | null) => {
      if (!node) return null;
      const rect = node.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    };
    const home = () =>
      center(document.querySelector("[data-spot-target]")) ??
      center(document.querySelector("[data-spot-home]")) ?? {
        x: window.innerWidth / 2,
        y: window.innerHeight * 0.45,
      };

    let current = home();
    let target = current;
    let frame = 0;
    let lastMove = 0;
    let idle = 0;

    const paint = () => {
      element.style.setProperty("--spot-x", `${current.x.toFixed(1)}px`);
      element.style.setProperty("--spot-y", `${current.y.toFixed(1)}px`);
    };
    paint();

    if (still) {
      const onResize = () => {
        current = home();
        paint();
      };
      window.addEventListener("resize", onResize);
      return () => window.removeEventListener("resize", onResize);
    }

    const tick = () => {
      const dx = target.x - current.x;
      const dy = target.y - current.y;
      current = { x: current.x + dx * 0.08, y: current.y + dy * 0.08 };
      paint();
      frame = Math.abs(dx) + Math.abs(dy) > 0.5 ? requestAnimationFrame(tick) : 0;
    };
    const follow = (x: number, y: number) => {
      target = { x, y };
      if (!frame) frame = requestAnimationFrame(tick);
    };
    const goHome = () => {
      const h = home();
      follow(h.x, h.y);
    };

    const onMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      lastMove = Date.now();
      follow(event.clientX, event.clientY);
      window.clearTimeout(idle);
      idle = window.setTimeout(goHome, 1500);
    };
    // A new target (the active digit, a new step) draws the light while the
    // pointer rests.
    const retarget = () => {
      if (!touch && Date.now() - lastMove < 1500) return;
      goHome();
    };

    const observer = new MutationObserver(retarget);
    observer.observe(element, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-spot-target"],
    });
    window.addEventListener("resize", retarget);
    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", goHome);
    // Once fonts and layout settle, start from the card's real position.
    requestAnimationFrame(() => {
      current = home();
      target = current;
      paint();
    });

    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(idle);
      observer.disconnect();
      window.removeEventListener("resize", retarget);
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", goHome);
    };
  }, []);

  return (
    <div ref={root} className="spot-stage relative isolate min-h-svh overflow-hidden">
      <div aria-hidden className="spot-light pointer-events-none fixed inset-0 -z-10" />
      {children}
    </div>
  );
}
