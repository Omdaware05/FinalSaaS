import React, { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { useTheme } from '../../app/providers/ThemeProvider';

interface ParticleStarsProps {
  isHovered: boolean;
  className?: string;
  particleCount?: number;
}

interface Particle {
  x: number;
  y: number;
  size: number;
  alpha: number;
  speedY: number;
}

export const ParticleStars: React.FC<ParticleStarsProps> = ({
  isHovered,
  className = '',
  particleCount = 7,
}) => {
  const { resolvedTheme } = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Disabled in light mode
    if (resolvedTheme !== 'dark') return;

    // Disabled on mobile or reduced motion
    const mediaQuery = window.matchMedia('(max-width: 768px), (prefers-reduced-motion: reduce)');
    if (mediaQuery.matches) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      canvas.width = parent.clientWidth;
      canvas.height = parent.clientHeight;
    };

    resize();
    window.addEventListener('resize', resize);

    // Calculate density based on container dimensions
    const count = particleCount || Math.min(30, Math.max(8, Math.floor((canvas.width || 400) / 50)));

    // Initialize particles as calm, straight-rising bubbles
    particlesRef.current = Array.from({ length: count }).map(() => ({
      x: Math.random() * (canvas.width || 300),
      y: Math.random() * (canvas.height || 150),
      size: 1.5 + Math.random() * 2.0, // 1.5 - 3.5px
      alpha: 0.25 + Math.random() * 0.5,
      speedY: 0.3 + Math.random() * 0.35, // Slow, gentle, and steady
    }));

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (isHovered) {
        particlesRef.current.forEach((p) => {
          // Strictly straight vertical ascent (no sideways zigzag)
          p.y -= p.speedY;

          if (p.y < -10) {
            p.y = canvas.height + 6;
            p.x = Math.random() * canvas.width;
          }

          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(249, 115, 22, ${p.alpha})`;
          ctx.shadowBlur = 4;
          ctx.shadowColor = 'rgba(249, 115, 22, 0.6)';
          ctx.fill();
        });
      }

      animationRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', resize);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [resolvedTheme, isHovered, particleCount]);

  if (resolvedTheme !== 'dark') return null;

  return (
    <div
      ref={containerRef}
      className={`absolute inset-0 pointer-events-none overflow-hidden z-0 transition-opacity duration-300 ${
        isHovered ? 'opacity-100' : 'opacity-0'
      } ${className}`}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="w-full h-full block" />
    </div>
  );
};
