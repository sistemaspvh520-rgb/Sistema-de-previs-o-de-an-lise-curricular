"use client";
import { useEffect, useRef, type ReactNode } from "react";

/** Progressive motion: content remains visible if JavaScript or observers are unavailable. */
export function PortalEffects({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (
      !root.current ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting);
        visible.forEach((entry, index) => {
          entry.target.animate(
            [
              { opacity: 0, transform: "translateY(18px)" },
              { opacity: 1, transform: "translateY(0)" },
            ],
            {
              duration: 550,
              delay: Math.min(index * 65, 260),
              easing: "cubic-bezier(.2,.7,.2,1)",
              fill: "backwards",
            },
          );
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.06 },
    );
    root.current
      .querySelectorAll(
        "main > section, main > div > section, main > div > div > section, .portal-reveal",
      )
      .forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={root} className="portal-experience">
      {children}
    </div>
  );
}
