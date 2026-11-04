import React from 'react';
import { useTheme } from '../../app/providers/ThemeProvider';
import './ambient.css';

export const AmbientBackground: React.FC = () => {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  return (
    <div className="ambient-container" aria-hidden="true">
      {/* Layer 1: Base Gradient */}
      <div className={`absolute inset-0 ${isDark ? 'ambient-base-dark' : 'ambient-base-light'}`} />

      {isDark ? (
        <>
          {/* Layer 2: Mesh Aurora (5 shapes with dynamic rgb tokens) */}
          <div className="aurora-shape aurora-top-right" />
          <div className="aurora-shape aurora-bottom-left" />
          <div className="aurora-shape aurora-mid-left" />
          <div className="aurora-shape aurora-bottom-right" />
          <div className="aurora-shape aurora-top-left" />

          {/* Layer 3: Flowing Light Ribbons (wide soft diagonal bands) */}
          <div className="ribbon-wrapper">
            <div className="light-ribbon ribbon-1" />
            <div className="light-ribbon ribbon-2" />
          </div>

          {/* Layer 4: Dot Grid Texture (edge masked) */}
          <div className="dot-grid-wrapper">
            <div className="dot-grid-pattern" />
          </div>

          {/* Layer 5: Neutral Smoke Clouds */}
          <div className="smoke-cloud smoke-1" />
          <div className="smoke-cloud smoke-2" />
          <div className="smoke-cloud smoke-3" />

          {/* Layer 6: Vignette (Center stays darkest for max text readability) */}
          <div className="ambient-vignette" />
        </>
      ) : (
        /* Light Theme Static Warm Tint */
        <div className="absolute inset-0 ambient-light-tint" />
      )}
    </div>
  );
};
