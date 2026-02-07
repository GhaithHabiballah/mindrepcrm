import { useEffect, useRef, useState } from 'react';

export function useGridSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ width: 800, height: 520 });

  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const nextWidth = Math.max(300, Math.floor(entry.contentRect.width));
      const nextHeight = Math.max(300, Math.floor(entry.contentRect.height));
      setSize({ width: nextWidth, height: nextHeight });
    });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return { ref, size };
}
