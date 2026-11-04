import React, { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Megaphone, Play, Square, Plus, PhoneCall, CheckCircle2, Percent } from 'lucide-react';
import { campaignsApi } from '../../services/api/campaigns';
import { agentsApi } from '../../services/api/agents';
import { MCard, MStatCard, MPageHeader, Pill, primaryPill } from './ui';
import { clsx } from 'clsx';

const STATUS_META: Record<string, { label: string; tone: 'emerald' | 'rose' | 'amber' | 'sky' | 'slate' | 'violet' }> = {
  RUNNING: { label: 'Running', tone: 'emerald' },
  CREATED: { label: 'Ready', tone: 'sky' },
  PAUSED: { label: 'Paused', tone: 'amber' },
  COMPLETED: { label: 'Completed', tone: 'slate' },
  STOPPED: { label: 'Stopped', tone: 'rose' },
  FAILED: { label: 'Failed', tone: 'rose' },
};

export const ModernCampaigns: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ['campaigns'],
    queryFn: () => campaignsApi.getCampaigns(),
    refetchInterval: 15000,
  });
  const { data: agents = [] } = useQuery({ queryKey: ['agents'], queryFn: () => agentsApi.getAgents(50) });

  const startMutation = useMutation({
    mutationFn: (id: string) => campaignsApi.startCampaign(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['campaigns'] }),
  });
  const stopMutation = useMutation({
    mutationFn: (id: string) => campaignsApi.stopCampaign(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['campaigns'] }),
  });

  const agentName = useMemo(() => {
    const map = new Map(agents.map((a) => [a.agent_id, a.name]));
    return (id?: string) => (id && map.get(id)) || 'AI Agent';
  }, [agents]);

  // The API reports campaign size as total_contacts (the TS type's
  // total_calls field is not populated by the backend).
  const campaignTotal = (c: (typeof campaigns)[number]) =>
    (c as any).total_contacts ?? c.phone_numbers?.length ?? 0;

  const totals = useMemo(() => {
    const total = campaigns.reduce((a, c) => a + campaignTotal(c), 0);
    const completed = campaigns.reduce((a, c) => a + (c.completed_calls || 0), 0);
    return {
      campaigns: campaigns.length,
      running: campaigns.filter((c) => c.status === 'RUNNING').length,
      total,
      completed,
      rate: total ? Math.round((completed / total) * 100) : 0,
    };
  }, [campaigns]);

  const stats = [
    { label: 'Total Campaigns', value: totals.campaigns.toLocaleString('en-IN'), icon: Megaphone, iconClass: 'bg-[#FFF1E6] text-[#EA580C]', subtext: `${totals.running} running right now` },
    { label: 'Calls Placed', value: totals.total.toLocaleString('en-IN'), icon: PhoneCall, iconClass: 'bg-[#E6F4FE] text-[#0284C7]', subtext: 'across all campaigns' },
    { label: 'Calls Completed', value: totals.completed.toLocaleString('en-IN'), icon: CheckCircle2, iconClass: 'bg-[#E7F8EE] text-[#16A34A]', subtext: 'answered and finished' },
    { label: 'Completion Rate', value: `${totals.rate}%`, icon: Percent, iconClass: 'bg-[#F1EAFE] text-[#7C3AED]', subtext: 'completed of placed' },
  ];

  return (
    <div>
      <MPageHeader
        title="Campaigns"
        subtitle="Outbound calling campaigns — progress and controls in one place."
        actions={
          <button type="button" className={primaryPill} onClick={() => navigate('/campaigns')}>
            <Plus className="w-4 h-4" /> New Campaign
          </button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6 mb-6">
        {stats.map((st, i) => (
          <MStatCard key={st.label} {...st} delay={i * 60} />
        ))}
      </div>

      {isLoading && <MCard className="p-8 text-center text-sm text-[#667085]">Loading campaigns…</MCard>}
      {!isLoading && campaigns.length === 0 && (
        <MCard className="p-8 text-center">
          <p className="text-sm font-semibold text-[#344054]">No campaigns yet</p>
          <p className="text-[13px] text-[#667085] mt-1">Create a campaign to start outbound calling.</p>
        </MCard>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {campaigns.map((c, i) => {
          const meta = STATUS_META[c.status] || { label: c.status, tone: 'slate' as const };
          const cTotal = campaignTotal(c);
          const pct = cTotal ? Math.round((c.completed_calls / cTotal) * 100) : 0;
          const isRunning = c.status === 'RUNNING';
          return (
            <MCard key={c.campaign_id} className="p-6">
              <div className="anim-enter" style={{ animationDelay: `${Math.min(i * 60, 300)}ms` }}>
                <div className="flex items-start gap-3">
                  <span className="w-11 h-11 rounded-2xl bg-orange-50 border border-orange-100 flex items-center justify-center shrink-0">
                    <Megaphone className="w-5 h-5 text-orange-600" strokeWidth={1.9} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] font-bold text-[#101828] truncate">{c.name}</p>
                    <p className="text-xs text-[#667085] truncate">{agentName(c.agent_id)}</p>
                  </div>
                  <Pill tone={meta.tone}>
                    {isRunning && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
                    {meta.label}
                  </Pill>
                </div>

                <div className="mt-5">
                  <div className="flex items-center justify-between text-xs mb-2">
                    <span className="text-[#667085] font-medium">
                      {c.completed_calls} of {cTotal} calls completed
                    </span>
                    <span className="font-bold text-[#101828] tabular-nums">{pct}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-[#EEF1F4] overflow-hidden">
                    <div
                      className={clsx('h-full rounded-full transition-all duration-700', isRunning ? 'bg-gradient-to-r from-orange-500 to-amber-400' : 'bg-emerald-500')}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between mt-5 pt-4 border-t border-[#F1F2F4]">
                  <span className="text-xs text-[#667085]">
                    {c.phone_numbers?.length || 0} contacts · {new Date(c.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  </span>
                  {isRunning ? (
                    <button
                      type="button"
                      onClick={() => stopMutation.mutate(c.campaign_id)}
                      className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full bg-[#FDECEC] text-[#DC2626] text-xs font-bold hover:bg-[#FBDADA] transition-colors"
                    >
                      <Square className="w-3 h-3" /> Stop
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => startMutation.mutate(c.campaign_id)}
                      disabled={c.status === 'COMPLETED'}
                      className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full bg-[#101828] text-white text-xs font-bold hover:bg-[#1D2939] transition-colors disabled:opacity-40"
                    >
                      <Play className="w-3 h-3" /> Start
                    </button>
                  )}
                </div>
              </div>
            </MCard>
          );
        })}
      </div>
    </div>
  );
};
