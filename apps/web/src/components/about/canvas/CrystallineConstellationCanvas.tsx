import React, { useEffect, useRef, useState } from "react";

export const CrystallineConstellationCanvas: React.FC<{
  className?: string;
}> = ({ className = "" }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [canvasSupported, setCanvasSupported] = useState(true);

  useEffect(() => {
    let motionQuery: MediaQueryList | null = null;
    if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
      motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
      setReducedMotion(motionQuery?.matches ?? false);
      const handleMotionChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
      motionQuery.addEventListener?.("change", handleMotionChange);
    }

    const canvas = canvasRef.current;
    if (!canvas || typeof canvas.getContext !== "function") {
      setCanvasSupported(false);
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setCanvasSupported(false);
      return;
    }

    let animationFrameId: number;
    let isVisible = true;
    let isTabActive = typeof document !== "undefined" ? !document.hidden : true;

    let width = (canvas.width = canvas.offsetWidth || 800);
    let height = (canvas.height = canvas.offsetHeight || 600);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = canvas.offsetWidth || 800;
      height = canvas.height = canvas.offsetHeight || 600;
    };
    window.addEventListener("resize", handleResize);

    const handleVisibilityChange = () => {
      isTabActive = !document.hidden;
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    let observer: IntersectionObserver | null = null;
    if (typeof IntersectionObserver === "function" && containerRef.current) {
      observer = new IntersectionObserver(
        ([entry]) => {
          isVisible = entry.isIntersecting;
        },
        { threshold: 0.05 }
      );
      observer.observe(containerRef.current);
    }

    let time = 0;

    const render = () => {
      if (isVisible && isTabActive && !reducedMotion) {
        ctx.clearRect(0, 0, width, height);
        time += 0.012;

        const centerX = width / 2;
        const centerY = height / 2;
        const radius = Math.min(width, height) * 0.38;

        // Structured Sacred Hexagonal / Octagonal Crystal Nodes
        const ringCount = 3;
        const nodes: { x: number; y: number; alpha: number; r: number; color: string }[] = [];

        // Central Anchor
        nodes.push({
          x: centerX,
          y: centerY,
          alpha: 0.9 + 0.1 * Math.sin(time * 2),
          r: 4.5,
          color: "rgba(45, 212, 191, ",
        });

        // Geometric Concentric Rings
        for (let ring = 1; ring <= ringCount; ring++) {
          const currentRadius = (radius / ringCount) * ring;
          const nodeCount = ring * 6; // 6, 12, 18 nodes
          for (let i = 0; i < nodeCount; i++) {
            const angle = (i / nodeCount) * Math.PI * 2 + (ring % 2 === 0 ? time * 0.05 : -time * 0.05);
            const nx = centerX + Math.cos(angle) * currentRadius;
            const ny = centerY + Math.sin(angle) * currentRadius;
            nodes.push({
              x: nx,
              y: ny,
              alpha: 0.5 + 0.3 * Math.sin(time + i),
              r: 2.2 + 0.5 * Math.sin(time * 1.5 + i),
              color: i % 2 === 0 ? "rgba(45, 212, 191, " : "rgba(56, 189, 248, ",
            });
          }
        }

        // Draw Structured Harmonious Connection Lines
        for (let i = 0; i < nodes.length; i++) {
          for (let j = i + 1; j < nodes.length; j++) {
            const dx = nodes[i].x - nodes[j].x;
            const dy = nodes[i].y - nodes[j].y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            // Connect nearby nodes within structured threshold
            const connectThreshold = radius * 0.45;
            if (dist < connectThreshold) {
              const alpha = (1 - dist / connectThreshold) * 0.25;
              ctx.beginPath();
              ctx.moveTo(nodes[i].x, nodes[i].y);
              ctx.lineTo(nodes[j].x, nodes[j].y);
              ctx.strokeStyle = `rgba(45, 212, 191, ${alpha})`;
              ctx.lineWidth = 0.9;
              ctx.stroke();
            }
          }
        }

        // Draw Nodes with Soft Luminous Halo
        for (const n of nodes) {
          // Halo
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.r * 2.5, 0, Math.PI * 2);
          ctx.fillStyle = `${n.color}${n.alpha * 0.25})`;
          ctx.fill();

          // Core
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
          ctx.fillStyle = `${n.color}${n.alpha})`;
          ctx.fill();
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    if (!reducedMotion) {
      render();
    }

    return () => {
      cancelAnimationFrame(animationFrameId);
      observer?.disconnect();
      window.removeEventListener("resize", handleResize);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [reducedMotion]);

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full pointer-events-none overflow-hidden ${className}`}
      aria-hidden="true"
    >
      {canvasSupported && !reducedMotion && (
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full block opacity-70"
        />
      )}

      {(!canvasSupported || reducedMotion) && (
        <div className="absolute inset-0 w-full h-full flex items-center justify-center opacity-60">
          <svg className="w-72 h-72 stroke-teal-400/30 stroke-1" viewBox="0 0 100 100" fill="none">
            <polygon points="50 15, 80 32.5, 80 67.5, 50 85, 20 67.5, 20 32.5" className="stroke-teal-400/40" />
            <polygon points="50 25, 71.6 37.5, 71.6 62.5, 50 75, 28.4 62.5, 28.4 37.5" className="stroke-teal-400/60" />
            <circle cx="50" cy="50" r="4" className="fill-teal-300" />
            <line x1="50" y1="15" x2="50" y2="85" />
            <line x1="20" y1="32.5" x2="80" y2="67.5" />
            <line x1="20" y1="67.5" x2="80" y2="32.5" />
          </svg>
        </div>
      )}
    </div>
  );
};
