import React from 'react';
import { useTheme } from '../../app/providers/ThemeProvider';

/**
 * Route-level look switch: renders the modern page when the look is
 * 'modern', the classic page otherwise. Both implementations share the
 * same route, data and APIs — only the interface differs.
 */
export const LookPage: React.FC<{ classic: React.ReactNode; modern: React.ReactNode }> = ({
  classic,
  modern,
}) => {
  const { look } = useTheme();
  return <>{look === 'modern' ? modern : classic}</>;
};
