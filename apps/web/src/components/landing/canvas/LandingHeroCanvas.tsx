import React, { useEffect, useRef, useState } from "react";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  alpha: number;
  pulseSpeed: number;
  pulseVal: number;
}

export const LandingHeroCanvas: React.FC<{
  className?: string;
}> = ({ className = "" }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [canvasSupported, setCanvasSupported] = useState(true);

  useEffect(() => {
    // Check prefers-reduced-motion
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

    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = canvas.getContext("2d");
    } catch {
      setCanvasSupported(false);
      return;
    }

    if (!ctx) {
      setCanvasSupported(false);
      return;
    }

    let animationFrameId: number;
    let isVisible = true;
    let isTabActive = typeof document !== "undefined" ? !document.hidden : true;

    // Detect mobile for particle count and connection threshold
    const isMobile = typeof window !== "undefined" ? window.innerWidth < 768 : false;
    const particleCount = isMobile ? 16 : 38;
    const maxConnectionDist = isMobile ? 80 : 135;

    let width = (canvas.width = canvas.offsetWidth || 800);
    let height = (canvas.height = canvas.offsetHeight || 600);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = canvas.offsetWidth || 800;
      height = canvas.height = canvas.offsetHeight || 600;
    };
    window.addEventListener("resize", handleResize);

    // Subtle mouse proximity interaction (desktop only)
    const mouse = { x: -1000, y: -1000, radius: 150 };
    const handleMouseMove = (e: MouseEvent) => {
      if (isMobile) return;
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
    };
    const handleMouseLeave = () => {
      mouse.x = -1000;
      mouse.y = -1000;
    };
    window.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseleave", handleMouseLeave);

    // Pause on hidden tab
    const handleVisibilityChange = () => {
      isTabActive = !document.hidden;
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Pause when offscreen using IntersectionObserver
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

    // Palette: AVANA Brand Teal, Sky, Light Blue, Soft Purple
    const palette = [
      "rgba(45, 212, 191, ",   // Teal 400
      "rgba(0, 128, 128, ",    // Primary Teal (#008080)
      "rgba(56, 189, 248, ",   // Sky 400
      "rgba(167, 208, 230, ",  // Brand Light Blue (#a7d0e6)
      "rgba(139, 92, 246, ",   // Brand Purple (#8b5cf6)
    ];

    const particles: Particle[] = [];
    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * (isMobile ? 0.25 : 0.5),
        vy: (Math.random() - 0.5) * (isMobile ? 0.25 : 0.5),
        radius: Math.random() * 2 + 1.2,
        color: palette[Math.floor(Math.random() * palette.length)],
        alpha: Math.random() * 0.45 + 0.3,
        pulseSpeed: Math.random() * 0.02 + 0.01,
        pulseVal: Math.random() * Math.PI,
      });
    }

    const render = () => {
      if (isVisible && isTabActive && !reducedMotion && ctx) {
        ctx.clearRect(0, 0, width, height);

        for (let i = 0; i < particles.length; i++) {
          const p = particles[i];

          // Gentle mouse interaction (smooth, non-intrusive)
          const dx = p.x - mouse.x;
          const dy = p.y - mouse.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < mouse.radius && dist > 0) {
            const force = (mouse.radius - dist) / mouse.radius;
            p.x += (dx / dist) * force * 1.2;
            p.y += (dy / dist) * force * 1.2;
          }

          p.x += p.vx;
          p.y += p.vy;

          if (p.x < 0) p.x = width;
          else if (p.x > width) p.x = 0;
          if (p.y < 0) p.y = height;
          else if (p.y > height) p.y = 0;

          p.pulseVal += p.pulseSpeed;
          const currentAlpha = p.alpha * (0.7 + 0.3 * Math.sin(p.pulseVal));

          // Draw node soft halo
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.radius * 2.2, 0, Math.PI * 2);
          ctx.fillStyle = `${p.color}${currentAlpha * 0.25})`;
          ctx.fill();

          // Draw node core
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
          ctx.fillStyle = `${p.color}${currentAlpha})`;
          ctx.fill();

          // Draw connections between nearby nodes
          for (let j = i + 1; j < particles.length; j++) {
            const p2 = particles[j];
            const djx = p.x - p2.x;
            const djy = p.y - p2.y;
            const d = Math.sqrt(djx * djx + djy * djy);

            if (d < maxConnectionDist) {
              const lineAlpha = (1 - d / maxConnectionDist) * 0.2;
              ctx.beginPath();
              ctx.moveTo(p.x, p.y);
              ctx.lineTo(p2.x, p2.y);
              ctx.strokeStyle = `rgba(45, 212, 191, ${lineAlpha})`;
              ctx.lineWidth = 0.8;
              ctx.stroke();
            }
          }
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
      window.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseleave", handleMouseLeave);
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

      {/* Accessible Static CSS Fallback Layer */}
      {(!canvasSupported || reducedMotion) && (
        <div className="absolute inset-0 w-full h-full opacity-50">
          <div className="absolute top-1/4 left-1/4 w-3 h-3 rounded-full bg-teal-400/40 blur-[1px] shadow-[0_0_12px_#2dd4bf]" />
          <div className="absolute top-1/3 right-1/4 w-2 h-2 rounded-full bg-cyan-400/50 blur-[1px]" />
          <div className="absolute bottom-1/4 right-1/3 w-3 h-3 rounded-full bg-purple-400/40 blur-[1px]" />
          <div className="absolute top-2/3 left-1/3 w-2.5 h-2.5 rounded-full bg-teal-300/40 blur-[1px]" />
          <svg className="absolute inset-0 w-full h-full stroke-teal-500/20 stroke-1" fill="none">
            <line x1="25%" y1="25%" x2="33%" y2="66%" />
            <line x1="75%" y1="33%" x2="66%" y2="75%" />
            <line x1="33%" y1="66%" x2="66%" y2="75%" />
          </svg>
        </div>
      )}
    </div>
  );
};
