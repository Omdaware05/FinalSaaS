import React, { useEffect, useRef } from 'react';
import { useTheme } from '../../app/providers/ThemeProvider';
import './glow.css';

interface GlowProviderProps {
  children?: React.ReactNode;
}

export const GlowProvider: React.FC<GlowProviderProps> = ({ children }) => {
  const { resolvedTheme } = useTheme();
  const spotlightRef = useRef<HTMLDivElement>(null);
  const rafIdRef = useRef<number | null>(null);
  const mousePosRef = useRef<{ x: number; y: number }>({ x: -1000, y: -1000 });
  const isPointerActiveRef = useRef(false);

  useEffect(() => {
    // Only run effects in dark mode and on desktop screens
    if (resolvedTheme !== 'dark') return;

    const mediaQuery = window.matchMedia('(max-width: 768px), (prefers-reduced-motion: reduce)');
    if (mediaQuery.matches) return;

    const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (isTouch) return;

    const updateGlow = () => {
      const mouseX = mousePosRef.current.x;
      const mouseY = mousePosRef.current.y;
      const hasPointer = isPointerActiveRef.current;

      // Update global subtle cursor spotlight
      if (spotlightRef.current) {
        if (hasPointer && mouseX >= 0 && mouseY >= 0) {
          spotlightRef.current.style.opacity = '1';
          spotlightRef.current.style.background = `radial-gradient(480px circle at ${mouseX}px ${mouseY}px, rgba(249, 115, 22, 0.07), transparent 70%)`;
        } else {
          spotlightRef.current.style.opacity = '0';
        }
      }

      // Query active glow cards in viewport
      const cards = document.querySelectorAll<HTMLElement>('[data-glow], .glow-card');
      const glowRadius = 300;

      cards.forEach((card) => {
        const rect = card.getBoundingClientRect();

        // Check if card is roughly visible in viewport
        if (
          rect.bottom < 0 ||
          rect.top > window.innerHeight ||
          rect.right < 0 ||
          rect.left > window.innerWidth
        ) {
          return;
        }

        const localX = mouseX - rect.left;
        const localY = mouseY - rect.top;

        // Calculate shortest distance from cursor to card rect
        const dx = Math.max(rect.left - mouseX, 0, mouseX - rect.right);
        const dy = Math.max(rect.top - mouseY, 0, mouseY - rect.bottom);
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (hasPointer && dist < glowRadius) {
          const intensity = Math.max(0, Math.min(1, 1 - dist / glowRadius));
          card.style.setProperty('--glow-x', `${localX}px`);
          card.style.setProperty('--glow-y', `${localY}px`);
          card.style.setProperty('--glow-intensity', (intensity * 0.95).toFixed(3));
          card.style.setProperty('--glow-radius', `${glowRadius}px`);
        } else {
          card.style.setProperty('--glow-intensity', '0');
        }
      });

      rafIdRef.current = null;
    };

    const handleMouseMove = (e: MouseEvent) => {
      mousePosRef.current = { x: e.clientX, y: e.clientY };
      isPointerActiveRef.current = true;

      if (!rafIdRef.current) {
        rafIdRef.current = requestAnimationFrame(updateGlow);
      }
    };

    const handleMouseLeave = () => {
      isPointerActiveRef.current = false;
      if (!rafIdRef.current) {
        rafIdRef.current = requestAnimationFrame(updateGlow);
      }
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    document.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseleave', handleMouseLeave);
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, [resolvedTheme]);

  return (
    <>
      {/* Global subtle cursor spotlight (dark mode only, pointer-events none) */}
      {resolvedTheme === 'dark' && (
        <div
          ref={spotlightRef}
          className="fixed inset-0 pointer-events-none z-10 transition-opacity duration-300 hidden md:block"
          aria-hidden="true"
          style={{ opacity: 0 }}
        />
      )}
      {children}
    </>
  );
};
