import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PhoneCall, PhoneOff } from 'lucide-react';
import { statsApi } from '../../services/api/stats';
import { callsApi } from '../../services/api/calls';
import { agentsApi } from '../../services/api/agents';
import { MCard, MPageHeader, Pill, callStateMeta, fmtDuration } from './ui';

export const ModernActiveCalls: React.FC = () => {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['active-calls'],
    queryFn: () => statsApi.getActiveCalls(),
    refetchInterval: 5000,
  });
  const { data: agents = [] } = useQuery({ queryKey: ['agents'], queryFn: () => agentsApi.getAgents(50) });

  const hangup = useMutation({
    mutationFn: (id: string) => callsApi.hangupCall(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['active-calls'] }),
  });

  const agentName = new Map(agents.map((a) => [a.agent_id, a.name]));
  const calls = data?.calls || [];

  return (
    <div>
      <MPageHeader
        title="Live Calls"
        subtitle={`${data?.active_count ?? 0} call${(data?.active_count ?? 0) === 1 ? '' : 's'} in progress right now — refreshes every few seconds.`}
      />

      <MCard className="overflow-hidden">
        {isLoading && <p className="p-8 text-center text-sm text-[#667085]">Loading live calls…</p>}
        {!isLoading && calls.length === 0 && (
          <div className="p-10 text-center">
            <span className="w-12 h-12 rounded-full bg-[#F2F4F7] flex items-center justify-center mx-auto mb-3">
              <PhoneCall className="w-5 h-5 text-[#667085]" />
            </span>
            <p className="text-sm font-semibold text-[#344054]">No calls currently active</p>
            <p className="text-[13px] text-[#667085] mt-1">All channels are idle. Start a campaign or a quick call to see live activity here.</p>
          </div>
        )}
        <div className="divide-y divide-[#F1F2F4]">
          {calls.map((c) => {
            const meta = callStateMeta(c.state);
            return (
              <div key={c.call_id} className="flex items-center gap-4 px-6 py-4">
                <span className="relative w-10 h-10 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0">
                  <PhoneCall className="w-[18px] h-[18px] text-emerald-600" strokeWidth={1.9} />
                  <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse ring-2 ring-white" />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-[#101828] tabular-nums">{c.phone_number}</p>
                  <p className="text-xs text-[#667085]">{(c.agent_id && agentName.get(c.agent_id)) || 'AI Agent'} · {c.provider}</p>
                </div>
                <span className="text-[13px] font-semibold text-[#344054] tabular-nums">{fmtDuration(c.duration)}</span>
                <Pill tone={meta.tone}>{meta.label}</Pill>
                <button
                  type="button"
                  onClick={() => hangup.mutate(c.call_id)}
                  className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full bg-[#FDECEC] text-[#DC2626] text-xs font-bold hover:bg-[#FBDADA] transition-colors"
                >
                  <PhoneOff className="w-3.5 h-3.5" /> Hang up
                </button>
              </div>
            );
          })}
        </div>
      </MCard>
    </div>
  );
};
