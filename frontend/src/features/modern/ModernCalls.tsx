import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PhoneOutgoing, ChevronRight, PhoneCall, Radio, PhoneMissed, Eye, Play } from 'lucide-react';
import { clsx } from 'clsx';
import { callsApi } from '../../services/api/calls';
import { agentsApi } from '../../services/api/agents';
import { statsApi } from '../../services/api/stats';
import { useBusiness } from '../../app/providers/BusinessProvider';
import type { CallDocument } from '../../types/api';
import { CallDetailDrawer } from '../calls/CallDetailDrawer';
import { MCard, MStatCard, MPageHeader, Pill, callStateMeta, fmtDuration, timeAgo, primaryPill } from './ui';
import { parseServerDate, formatDateTime } from '../../utils/dateUtils';

const FILTERS = [
  { id: 'all', label: 'All Calls' },
  { id: 'COMPLETED', label: 'Completed' },
  { id: 'FAILED', label: 'Failed' },
  { id: 'BUSY', label: 'Busy' },
  { id: 'NO_ANSWER', label: 'No Answer' },
  { id: 'live', label: 'Live Now' },
] as const;

const LIVE_STATES = ['QUEUED', 'DIALING', 'RINGING', 'CONNECTED', 'LISTENING', 'THINKING', 'SPEAKING'];

export const ModernCalls: React.FC = () => {
  const { selectedBusiness, selectedBusinessId, isAllBusinesses } = useBusiness();
  const [filter, setFilter] = useState<string>('all');
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);

  const { data: stats } = useQuery({
    queryKey: ['global-stats', selectedBusinessId],
    queryFn: () => statsApi.getStats(isAllBusinesses ? undefined : selectedBusinessId),
    refetchInterval: 15000,
  });
  const { data: calls = [], isLoading } = useQuery<CallDocument[]>({
    queryKey: ['modern-calls', selectedBusinessId],
    queryFn: () => callsApi.getCalls({ limit: 200 }),
    refetchInterval: 15000,
  });
  const { data: agents = [] } = useQuery({
    queryKey: ['agents', selectedBusinessId],
    queryFn: () => agentsApi.getAgents(50),
  });

  // Scope calls to selected business
  const scopedCalls = useMemo(() => {
    if (isAllBusinesses || !selectedBusiness) return calls;
    const assignedSet = new Set(selectedBusiness.assignedAgentIds || []);
    return calls.filter((c) => {
      if ((c as any).tenant_id && (c as any).tenant_id === selectedBusiness.id) return true;
      if ((c as any).business_id && (c as any).business_id === selectedBusiness.id) return true;
      if (c.agent_id && assignedSet.has(c.agent_id)) return true;
      return false;
    });
  }, [calls, selectedBusiness, isAllBusinesses]);

  const agentName = useMemo(() => {
    const map = new Map(agents.map((a) => [a.agent_id, a.name]));
    return (id?: string | null) => (id && map.get(id)) || 'AI Agent';
  }, [agents]);

  const visible = useMemo(() => {
    const sorted = [...scopedCalls].sort((a, b) => (parseServerDate(b.created_at)?.getTime() || 0) - (parseServerDate(a.created_at)?.getTime() || 0));
    if (filter === 'all') return sorted;
    if (filter === 'live') return sorted.filter((c) => LIVE_STATES.includes(c.state));
    return sorted.filter((c) => c.state === filter);
  }, [scopedCalls, filter]);

  const totalCallsCount = isAllBusinesses ? (stats?.total_calls ?? scopedCalls.length) : scopedCalls.length;
  const liveCallsCount = isAllBusinesses ? (stats?.active ?? 0) : scopedCalls.filter((c) => LIVE_STATES.includes(c.state)).length;
  const completedCallsCount = isAllBusinesses ? (stats?.completed ?? 0) : scopedCalls.filter((c) => c.state === 'COMPLETED').length;
  const failedCallsCount = isAllBusinesses ? (stats?.failed ?? 0) : scopedCalls.filter((c) => ['FAILED', 'BUSY', 'NO_ANSWER'].includes(c.state)).length;

  const statCards = [
    { label: 'Total Calls', value: totalCallsCount.toLocaleString('en-IN'), icon: PhoneCall, iconClass: 'bg-[#FFF1E6] text-[#EA580C]', subtext: isAllBusinesses ? 'across all clients' : 'for this business' },
    { label: 'Live Now', value: liveCallsCount.toLocaleString('en-IN'), icon: Radio, iconClass: 'bg-[#E7F8EE] text-[#16A34A]', subtext: 'calls in progress' },
    { label: 'Completed', value: completedCallsCount.toLocaleString('en-IN'), icon: PhoneOutgoing, iconClass: 'bg-[#E6F4FE] text-[#0284C7]', subtext: totalCallsCount ? `${Math.round((completedCallsCount / totalCallsCount) * 100)}% of all calls` : '' },
    { label: 'Failed', value: failedCallsCount.toLocaleString('en-IN'), icon: PhoneMissed, iconClass: 'bg-[#FDECEC] text-[#DC2626]', subtext: 'could not connect' },
  ];

  return (
    <div>
      <MPageHeader
        title="Calls"
        subtitle="Every conversation your AI agents have had — click any call to inspect recording and live transcript."
        actions={
          <button
            type="button"
            className={primaryPill}
            onClick={() => window.dispatchEvent(new CustomEvent('voxora-quick-dial'))}
          >
            <PhoneCall className="w-4 h-4" /> Start Call
          </button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6 mb-6">
        {statCards.map((st, i) => (
          <MStatCard key={st.label} {...st} delay={i * 60} />
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5 mb-6">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={clsx(
              'h-9 px-4 rounded-full text-xs font-semibold transition-all cursor-pointer',
              filter === f.id
                ? 'bg-[#101828] text-white shadow-[0_1px_2px_rgba(16,24,40,0.25)]'
                : 'bg-white border border-[#E4E7EC] text-[#475467] hover:text-[#101828] hover:bg-[#F9FAFB]'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <MCard className="overflow-hidden">
        {isLoading && <p className="p-12 text-center text-sm text-[#667085]">Loading calls…</p>}
        {!isLoading && visible.length === 0 && (
          <div className="p-12 text-center">
            <span className="w-12 h-12 rounded-full bg-[#F2F4F7] flex items-center justify-center mx-auto mb-3">
              <PhoneCall className="w-5 h-5 text-[#667085]" />
            </span>
            <p className="text-sm font-semibold text-[#344054]">No calls found in this view</p>
            <p className="text-xs text-[#667085] mt-1">Start a campaign or place a quick call to see activity.</p>
          </div>
        )}
        <div className="divide-y divide-[#F1F2F4]">
          {visible.slice(0, 50).map((call) => {
            const meta = callStateMeta(call.state);
            const interest = (call.last_interest_status || '').toLowerCase();
            return (
              <div
                key={call.call_id}
                onClick={() => setSelectedCallId(call.call_id)}
                className="flex items-center gap-4 px-5 sm:px-6 py-4 hover:bg-[#F8F9FA] transition-colors cursor-pointer group select-none"
              >
                <span className="w-10 h-10 rounded-full bg-orange-50 border border-orange-100 flex items-center justify-center shrink-0 group-hover:bg-orange-100 transition-colors">
                  <PhoneOutgoing className="w-[18px] h-[18px] text-orange-600" strokeWidth={1.9} />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-[#101828] group-hover:text-orange-600 transition-colors tabular-nums">
                      {call.phone_number}
                    </p>
                    <span className="text-[11px] text-[#667085] font-mono">
                      {formatDateTime(call.created_at, 'hh:mm:ss a')}
                    </span>
                  </div>
                  <p className="text-xs text-[#667085] truncate mt-0.5">
                    {agentName(call.agent_id)} · {timeAgo(call.created_at)}
                  </p>
                </div>
                {interest && (
                  <span className="hidden md:block">
                    <Pill tone={interest === 'interested' ? 'emerald' : interest === 'not_interested' ? 'rose' : 'amber'}>
                      {interest.replace(/_/g, ' ')}
                    </Pill>
                  </span>
                )}
                <span className="hidden sm:block text-[13px] font-semibold text-[#344054] tabular-nums w-16 text-right">
                  {fmtDuration(call.duration)}
                </span>
                <Pill tone={meta.tone}>{meta.label}</Pill>
                <span className="w-8 h-8 rounded-full flex items-center justify-center text-[#667085] group-hover:text-orange-600 group-hover:bg-orange-50 transition-all shrink-0">
                  <Eye className="w-4 h-4" />
                </span>
              </div>
            );
          })}
        </div>
        {visible.length > 50 && (
          <p className="px-6 py-3.5 text-xs text-[#667085] border-t border-[#F1F2F4] text-center bg-[#FAFAFB]">
            Showing 50 most recent calls. Filter or search to narrow records.
          </p>
        )}
      </MCard>

      {/* Telemetry & Audio Recording Drawer */}
      <CallDetailDrawer
        callId={selectedCallId}
        onClose={() => setSelectedCallId(null)}
      />
    </div>
  );
};
