import React, { useEffect, useRef, useState } from 'react';
import { clsx } from 'clsx';
import { Card } from './Card';
import { Skeleton } from './Skeleton';

/** Ease-out count-up for metric values. Animates from the previous value
 * whenever the target changes (e.g. live refetch), and jumps instantly
 * for users who prefer reduced motion. */
function useAnimatedNumber(target: number, duration = 950): number {
  const [display, setDisplay] = useState(0);
  const prevRef = useRef(0);

  useEffect(() => {
    const from = prevRef.current;
    if (from === target || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDisplay(target);
      prevRef.current = target;
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t); // easeOutExpo
      setDisplay(from + (target - from) * eased);
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        prevRef.current = target;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return display;
}

const AnimatedNumber: React.FC<{ target: number; decimals: number }> = ({ target, decimals }) => {
  const value = useAnimatedNumber(target);
  return (
    <>
      {value.toLocaleString('en-IN', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
    </>
  );
};

const NUMERIC_RE = /^(\s*[^0-9]*?)([\d][\d,]*(?:\.\d+)?)(.*)$/s;

/** Renders a metric value with its numeric core counted up, preserving
 * any prefix/suffix (€, ₹, %, "calls", …). Non-numeric values pass through. */
function renderAnimatedValue(value: string | number | React.ReactNode): React.ReactNode {
  if (typeof value === 'number') {
    return <AnimatedNumber target={value} decimals={Number.isInteger(value) ? 0 : 2} />;
  }
  if (typeof value === 'string') {
    const m = value.match(NUMERIC_RE);
    if (m) {
      const num = parseFloat(m[2].replace(/,/g, ''));
      if (isFinite(num)) {
        const decimals = m[2].includes('.') ? m[2].split('.')[1].length : 0;
        return (
          <>
            {m[1]}
            <AnimatedNumber target={num} decimals={decimals} />
            {m[3]}
          </>
        );
      }
    }
  }
  return value;
}

export interface MetricCardProps {
  label: string;
  value: string | number | React.ReactNode;
  subtext?: string;
  icon?: React.ReactNode;
  trend?: {
    value: string;
    positive?: boolean;
  };
  isLoading?: boolean;
  className?: string;
  style?: React.CSSProperties;
  glow?: boolean;
  tilt?: boolean;
  stars?: boolean;
  magnetism?: boolean;
  ripple?: boolean;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  label,
  value,
  subtext,
  icon,
  trend,
  isLoading = false,
  className,
  style,
  glow = true,
  // Calm, professional defaults for client delivery: the playful tilt /
  // stars / ripple effects stay available as opt-ins, but metrics no
  // longer wobble or sparkle by default.
  tilt = false,
  stars = false,
  magnetism = false,
  ripple = false,
}) => {
  return (
    <Card
      glow={glow}
      tilt={tilt}
      stars={stars}
      magnetism={magnetism}
      ripple={ripple}
      style={style}
      className={clsx('flex flex-col justify-between cursor-default', className)}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          {icon && (
            <div className="w-8 h-8 rounded-lg bg-slate-900/[0.04] dark:bg-white/[0.06] text-orange-500 dark:text-orange-400 border border-slate-900/[0.07] dark:border-white/[0.09] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] flex items-center justify-center shrink-0">
              {icon}
            </div>
          )}
          <span className="text-[13px] font-medium text-slate-600 dark:text-[#C9C9D1] truncate">
            {label}
          </span>
        </div>
        {trend && (
          <span
            className={clsx(
              'px-2.5 py-0.5 rounded-full text-[12px] font-semibold tabular-nums shrink-0 border',
              trend.positive
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                : 'bg-neutral-800/80 text-neutral-300 border-white/[0.10]'
            )}
          >
            {trend.value}
          </span>
        )}
      </div>

      <div className="mt-3">
        {isLoading ? (
          <Skeleton height={32} width={70} />
        ) : (
          <div className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-[#F8F8FA] tabular-nums">
            {renderAnimatedValue(value)}
          </div>
        )}
      </div>

      {subtext && (
        <p className="mt-1.5 text-[12.5px] text-slate-500 dark:text-[#C9C9D1] truncate font-normal">
          {subtext}
        </p>
      )}
    </Card>
  );
};
