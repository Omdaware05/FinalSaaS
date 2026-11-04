import React from 'react';

/**
 * ARB SoftTech brand mark — a geometric voice-wave glyph on a strict
 * 64-unit grid (equal bar spacing, symmetric heights, rounded caps)
 * inside a rounded app-icon tile. Single source of truth for the logo;
 * the same artwork ships as public/favicon.svg.
 */
export const BrandMark: React.FC<{ className?: string }> = ({ className = 'w-8 h-8' }) => (
  <svg viewBox="0 0 64 64" className={className} role="img" aria-label="ARB SoftTech" fill="none">
    <defs>
      <linearGradient id="arb-brand-tile" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#FB923C" />
        <stop offset="1" stopColor="#EA580C" />
      </linearGradient>
    </defs>
    <rect x="2" y="2" width="60" height="60" rx="14" fill="url(#arb-brand-tile)" />
    <g fill="#FFFFFF">
      <rect x="12.5" y="26" width="5" height="12" rx="2.5" />
      <rect x="21" y="21" width="5" height="22" rx="2.5" />
      <rect x="29.5" y="16" width="5" height="32" rx="2.5" />
      <rect x="38" y="21" width="5" height="22" rx="2.5" />
      <rect x="46.5" y="26" width="5" height="12" rx="2.5" />
    </g>
  </svg>
);
