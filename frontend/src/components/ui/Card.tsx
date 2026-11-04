import React, { useRef, useState } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { ParticleStars } from '../effects/ParticleStars';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
  padded?: boolean;
  glow?: boolean;
  tilt?: boolean;
  magnetism?: boolean;
  stars?: boolean;
  ripple?: boolean;
}

export const Card: React.FC<CardProps> = ({
  children,
  className,
  interactive = false,
  padded = true,
  glow = true,
  tilt = false,
  magnetism = false,
  stars = false,
  ripple = false,
  onMouseEnter,
  onMouseLeave,
  onClick,
  ...props
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([]);

  const handleMouseEnter = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsHovered(true);
    onMouseEnter?.(e);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!tilt || !cardRef.current) return;
    if (window.innerWidth <= 768) return;
    const isDark = document.documentElement.classList.contains('dark');
    if (!isDark) return;

    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    // Max 3-4 degrees subtle tilt
    const rotateX = (-(y / (rect.height / 2)) * 3).toFixed(2);
    const rotateY = ((x / (rect.width / 2)) * 3).toFixed(2);
    cardRef.current.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-1px)`;
  };

  const handleMouseLeave = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsHovered(false);
    if (tilt && cardRef.current) {
      cardRef.current.style.transform = '';
    }
    onMouseLeave?.(e);
  };

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (ripple && cardRef.current) {
      const target = e.target as HTMLElement;
      if (!target.closest('button, a, input, select, textarea, [role="button"]')) {
        const rect = cardRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const id = Date.now();
        setRipples((prev) => [...prev, { id, x, y }]);
        setTimeout(() => {
          setRipples((prev) => prev.filter((r) => r.id !== id));
        }, 500);
      }
    }
    onClick?.(e);
  };

  return (
    <div
      ref={cardRef}
      data-glow={glow ? '' : undefined}
      onMouseEnter={handleMouseEnter}
      onMouseMove={tilt ? handleMouseMove : undefined}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      className={twMerge(
        clsx(
          'app-card relative rounded-2xl transition-all duration-200 overflow-hidden',
          'bg-white/75 dark:bg-[var(--card-glass-bg)] backdrop-blur-[18px]',
          'border border-slate-200/80 dark:border-white/[0.09]',
          'shadow-sm dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_8px_32px_rgba(0,0,0,0.35)]',
          glow && 'glow-card',
          interactive && 'hover:bg-white/90 dark:hover:bg-[var(--card-glass-hover)] hover:border-slate-300 dark:hover:border-white/[0.15] cursor-pointer',
          padded && 'p-4 sm:p-5',
          className
        )
      )}
      {...props}
    >
      {stars && <ParticleStars isHovered={isHovered} />}
      {ripples.map((r) => (
        <span
          key={r.id}
          className="absolute rounded-full pointer-events-none animate-ping"
          style={{
            left: r.x,
            top: r.y,
            width: 24,
            height: 24,
            transform: 'translate(-50%, -50%)',
            backgroundColor: 'rgba(249, 115, 22, 0.25)',
            zIndex: 1,
          }}
        />
      ))}
      {children}
    </div>
  );
};

export const CardHeader: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ children, className, ...props }) => (
  <div className={twMerge('flex flex-col gap-0.5 pb-3 border-b border-slate-100 dark:border-white/[0.06] mb-3.5', className)} {...props}>
    {children}
  </div>
);

export const CardTitle: React.FC<React.HTMLAttributes<HTMLHeadingElement>> = ({ children, className, ...props }) => (
  <h3 className={twMerge('text-[15px] sm:text-base font-semibold text-slate-900 dark:text-[#F8F8FA] tracking-tight flex items-center gap-2', className)} {...props}>
    {children}
  </h3>
);

export const CardDescription: React.FC<React.HTMLAttributes<HTMLParagraphElement>> = ({ children, className, ...props }) => (
  <p className={twMerge('text-[13px] text-slate-500 dark:text-[#C9C9D1] leading-relaxed font-normal', className)} {...props}>
    {children}
  </p>
);

export const CardContent: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ children, className, ...props }) => (
  <div className={twMerge('w-full', className)} {...props}>
    {children}
  </div>
);

export const CardFooter: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ children, className, ...props }) => (
  <div className={twMerge('flex items-center justify-between pt-3 border-t border-slate-100 dark:border-white/[0.06] mt-3', className)} {...props}>
    {children}
  </div>
);
