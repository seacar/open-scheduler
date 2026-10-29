"use client";

import { useEffect, useRef, type ReactNode } from "react";

export function EmbedResize({ children }: { children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = rootRef.current;
    if (!node || window.parent === window) return;

    let last = 0;
    let frame = 0;
    const post = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const height = Math.ceil(node.getBoundingClientRect().height);
        if (!Number.isFinite(height) || Math.abs(height - last) < 2) return;
        last = height;
        window.parent.postMessage(
          { source: "open-scheduler", type: "resize", height },
          "*"
        );
      });
    };

    post();
    const observer = new ResizeObserver(post);
    observer.observe(node);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  return (
    <div ref={rootRef} className="bg-background p-1 text-foreground">
      {children}
    </div>
  );
}
