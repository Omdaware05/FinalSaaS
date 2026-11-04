import React, { useState, useRef, useEffect } from 'react';
import { Bot, ChevronDown, Check, Search, Globe } from 'lucide-react';
import { clsx } from 'clsx';
import { AgentDocument } from '../../types/api';
import { ProviderBadge } from '../../components/ui/Badge';

interface AgentSelectPopoverProps {
  agents: AgentDocument[];
  selectedAgentId: string;
  isAllAgentsView: boolean;
  onSelectAgent: (agentId: string) => void;
  isLoading?: boolean;
}

export const AgentSelectPopover: React.FC<AgentSelectPopoverProps> = ({
  agents,
  selectedAgentId,
  isAllAgentsView,
  onSelectAgent,
  isLoading = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const popoverRef = useRef<HTMLDivElement>(null);

  const selectedAgent = agents.find((a) => a.agent_id === selectedAgentId);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const filteredAgents = agents.filter(
    (ag) =>
      ag.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ag.default_language.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ag.provider.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="relative z-20" ref={popoverRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        disabled={isLoading}
        className={clsx(
          'flex items-center gap-3.5 p-2 sm:px-3 sm:py-2.5 rounded-2xl text-left transition-all duration-150',
          'bg-slate-100/80 dark:bg-[var(--card-glass-bg)] backdrop-blur-[18px] hover:bg-slate-200/80 dark:hover:bg-white/[0.06]',
          'border border-slate-200/80 dark:border-white/[0.08] hover:border-orange-500/40 dark:hover:border-orange-500/40',
          'focus:outline-none focus:ring-2 focus:ring-orange-500/30 shadow-xs'
        )}
      >
        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-orange-500 to-amber-600 text-white flex items-center justify-center font-bold shadow-md shadow-orange-500/20 shrink-0">
          {isAllAgentsView ? <Globe className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
        </div>

        <div className="flex flex-col min-w-0 pr-1">
          <span className="text-[10px] font-bold tracking-wider uppercase text-orange-500 dark:text-orange-400">
            {isAllAgentsView ? 'Global Scope' : 'Active Voice Agent'}
          </span>
          <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate max-w-[180px] sm:max-w-[260px]">
            {isAllAgentsView
              ? 'Platform-Wide Overview'
              : selectedAgent
              ? selectedAgent.name
              : 'Select an Agent'}
          </span>
        </div>

        <ChevronDown
          className={clsx(
            'w-4 h-4 text-slate-400 transition-transform duration-200 shrink-0 ml-1',
            isOpen && 'rotate-180 text-orange-500'
          )}
        />
      </button>

      {/* Popover Dropdown Surface with z-30 (above KPI cards z-10, below Header z-40) */}
      {isOpen && (
        <div className="absolute left-0 top-full mt-2 z-30 w-80 sm:w-96 rounded-2xl bg-white dark:bg-[#15171e] border border-slate-200/90 dark:border-white/[0.12] shadow-[0_20px_50px_rgba(0,0,0,0.8)] overflow-hidden animate-in fade-in-50 zoom-in-95 duration-150">
          {/* Search Header if > 2 agents */}
          {agents.length > 2 && (
            <div className="p-2.5 border-b border-slate-100 dark:border-white/[0.08] bg-slate-50/50 dark:bg-[#121319]">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter agents by name, language..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full h-8 pl-8 pr-3 text-xs rounded-xl bg-white dark:bg-[#1a1c24] border border-slate-200/80 dark:border-white/[0.10] text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-orange-500"
                  autoFocus
                />
              </div>
            </div>
          )}

          {/* Agent Items */}
          <div className="max-h-64 overflow-y-auto p-1.5 space-y-1">
            <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Voice Agents ({agents.length})
            </div>

            {filteredAgents.map((ag) => {
              const isSelected = !isAllAgentsView && ag.agent_id === selectedAgentId;
              return (
                <button
                  key={ag.agent_id}
                  type="button"
                  onClick={() => {
                    onSelectAgent(ag.agent_id);
                    setIsOpen(false);
                  }}
                  className={clsx(
                    'w-full flex items-center justify-between p-2.5 rounded-xl text-left text-xs transition-all duration-100',
                    isSelected
                      ? 'bg-orange-500/10 text-orange-950 dark:text-orange-200 font-semibold border border-orange-500/30'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100/70 dark:hover:bg-white/[0.05] border border-transparent'
                  )}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={clsx(
                        'w-7 h-7 rounded-lg flex items-center justify-center shrink-0',
                        isSelected
                          ? 'bg-orange-500 text-white'
                          : 'bg-slate-100 dark:bg-white/[0.06] text-slate-500 dark:text-slate-400'
                      )}
                    >
                      <Bot className="w-4 h-4" />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="font-semibold truncate">{ag.name}</span>
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-400 dark:text-slate-500">
                        <span className="font-mono">{ag.default_language}</span>
                        <span>·</span>
                        <span>{ag.concurrency}x Concurrency</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <ProviderBadge provider={ag.provider} size="xs" />
                    {isSelected && <Check className="w-4 h-4 text-orange-500 dark:text-orange-400" />}
                  </div>
                </button>
              );
            })}

            {filteredAgents.length === 0 && (
              <div className="p-4 text-center text-xs text-slate-400">
                No matching agents found
              </div>
            )}
          </div>

          {/* Platform-Wide Overview Option */}
          <div className="p-1.5 border-t border-slate-100 dark:border-white/[0.06] bg-slate-50/50 dark:bg-white/[0.02]">
            <button
              type="button"
              onClick={() => {
                onSelectAgent('__ALL__');
                setIsOpen(false);
              }}
              className={clsx(
                'w-full flex items-center justify-between p-2.5 rounded-xl text-left text-xs transition-all duration-100',
                isAllAgentsView
                  ? 'bg-orange-500/10 text-orange-950 dark:text-orange-200 font-semibold border border-orange-500/30'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.05] border border-transparent'
              )}
            >
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-orange-500/10 text-orange-500 flex items-center justify-center shrink-0">
                  <Globe className="w-4 h-4" />
                </div>
                <div className="flex flex-col">
                  <span className="font-semibold">Platform-Wide Overview</span>
                  <span className="text-[10px] text-slate-400">Aggregate all agent telemetry</span>
                </div>
              </div>
              {isAllAgentsView && <Check className="w-4 h-4 text-orange-500 dark:text-orange-400" />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
