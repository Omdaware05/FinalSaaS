import React from 'react';
import { Layers, Sparkles } from 'lucide-react';
import { useTheme, type Look } from '../../app/providers/ThemeProvider';

/**
 * Classic / Modern look switcher. Shared by the classic Header and the
 * modern shell's top bar so the way back is always in the same place.
 */
export const LookToggle: React.FC = () => {
  const { look, setLook } = useTheme();
  return (
    <div
      className="flex items-center p-1 rounded-full bg-slate-100 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08]"
      role="group"
      aria-label="Interface look"
      title="Switch interface look"
    >
      {(
        [
          { id: 'classic', label: 'Classic', Icon: Layers },
          { id: 'modern', label: 'Modern', Icon: Sparkles },
        ] as { id: Look; label: string; Icon: typeof Layers }[]
      ).map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => setLook(id)}
          aria-pressed={look === id}
          className={
            look === id
              ? 'flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-full bg-white text-slate-900 shadow-sm text-[11px] font-semibold transition-all'
              : 'flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-full text-slate-500 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-white text-[11px] font-semibold transition-all'
          }
        >
          <Icon className="w-3.5 h-3.5" />
          <span className="hidden lg:inline">{label}</span>
        </button>
      ))}
    </div>
  );
};
