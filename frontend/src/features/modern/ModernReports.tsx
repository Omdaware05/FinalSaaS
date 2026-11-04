import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { PhoneCall, Percent, Clock, Target } from 'lucide-react';
import { statsApi } from '../../services/api/stats';
import { callsApi } from '../../services/api/calls';
import { leadsApi } from '../../services/api/leads';
import { agentsApi } from '../../services/api/agents';
import type { CallDocument, LeadDocument } from '../../types/api';
import { MCard, MStatCard, MPageHeader, Avatar, fmtDuration } from './ui';
import { parseServerDate } from '../../utils/dateUtils';

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

const STATUS_COLORS: Record<string, string> = {
  interested: '#10B981',
  qualified: '#8B5CF6',
  new: '#F59E0B',
  not_interested: '#F43F5E',
  closed: '#94A3B8',
};

export const ModernReports: React.FC = () => {
  const { data: stats } = useQuery({ queryKey: ['global-stats'], queryFn: statsApi.getStats });
  const { data: calls = [] } = useQuery<CallDocument[]>({
    queryKey: ['modern-calls'],
    queryFn: () => callsApi.getCalls({ limit: 200 }),
  });
  const { data: leads = [] } = useQuery<LeadDocument[]>({
    queryKey: ['leads'],
    queryFn: () => leadsApi.getLeads({ limit: 500 }),
  });
  const { data: agents = [] } = useQuery({ queryKey: ['agents'], queryFn: () => agentsApi.getAgents(50) });

  const last14 = useMemo(() => {
    const days: { key: string; label: string; Calls: number; Completed: number }[] = [];
    const now = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      days.push({ key: dayKey(d), label: d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }), Calls: 0, Completed: 0 });
    }
    const idx = new Map(days.map((d, i) => [d.key, i]));
    for (const c of calls) {
      const dt = parseServerDate(c.created_at);
      if (dt) {
        const i = idx.get(dayKey(dt));
        if (i !== undefined) {
          days[i].Calls += 1;
          if (c.state === 'COMPLETED') days[i].Completed += 1;
        }
      }
    }
    return days;
  }, [calls]);

  const leadDist = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of leads) map.set((l.status || 'new').toLowerCase(), (map.get((l.status || 'new').toLowerCase()) || 0) + 1);
    return [...map.entries()]
      .map(([status, count]) => ({ status, count, color: STATUS_COLORS[status] || '#F97316' }))
      .sort((a, b) => b.count - a.count);
  }, [leads]);
  const maxLead = Math.max(1, ...leadDist.map((d) => d.count));

  const agentPerf = useMemo(() => {
    const per = new Map<string, { calls: number; completed: number; leads: number }>();
    for (const c of calls) {
      if (!c.agent_id) continue;
      const e = per.get(c.agent_id) || { calls: 0, completed: 0, leads: 0 };
      e.calls += 1;
      if (c.state === 'COMPLETED') e.completed += 1;
      per.set(c.agent_id, e);
    }
    for (const l of leads) {
      if (!l.agent_id) continue;
      const e = per.get(l.agent_id) || { calls: 0, completed: 0, leads: 0 };
      e.leads += 1;
      per.set(l.agent_id, e);
    }
    return agents
      .map((a) => ({ agent: a, ...(per.get(a.agent_id) || { calls: 0, completed: 0, leads: 0 }) }))
      .sort((x, y) => y.calls - x.calls)
      .slice(0, 6);
  }, [calls, leads, agents]);
  const maxAgent = Math.max(1, ...agentPerf.map((a) => a.calls));

  const answerRate = stats?.total_calls ? Math.round(((stats.completed || 0) / stats.total_calls) * 100) : 0;
  const conversion = leads.length
    ? Math.round((leads.filter((l) => ['interested', 'qualified'].includes((l.status || '').toLowerCase())).length / leads.length) * 100)
    : 0;

  const statCards = [
    { label: 'Total Calls', value: (stats?.total_calls ?? calls.length).toLocaleString('en-IN'), icon: PhoneCall, iconClass: 'bg-[#FFF1E6] text-[#EA580C]', subtext: 'in the loaded activity window' },
    { label: 'Answer Rate', value: `${answerRate}%`, icon: Percent, iconClass: 'bg-[#E7F8EE] text-[#16A34A]', subtext: 'calls answered and completed' },
    { label: 'Avg. Call Duration', value: fmtDuration(stats?.average_duration_seconds), icon: Clock, iconClass: 'bg-[#E6F4FE] text-[#0284C7]', subtext: 'per completed call' },
    { label: 'Lead Conversion', value: `${conversion}%`, icon: Target, iconClass: 'bg-[#F1EAFE] text-[#7C3AED]', subtext: 'interested or qualified leads' },
  ];

  return (
    <div>
      <MPageHeader title="Reports & Analytics" subtitle="Performance across calls, leads and agents — computed live from your data." />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6 mb-6">
        {statCards.map((st, i) => (
          <MStatCard key={st.label} {...st} delay={i * 60} />
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-6">
        <MCard className="p-6 xl:col-span-2">
          <h3 className="text-[15px] font-bold text-[#101828]">Call Volume</h3>
          <p className="text-xs text-[#667085] mt-0.5">Calls placed vs completed · last 14 days</p>
          <div className="h-[250px] mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={last14} margin={{ top: 4, right: 4, bottom: 0, left: -20 }} barCategoryGap="28%">
                <CartesianGrid vertical={false} stroke="#EEF0F2" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#98A2B3' }} axisLine={false} tickLine={false} dy={6} interval={1} />
                <YAxis tick={{ fontSize: 11, fill: '#98A2B3' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip
                  cursor={{ fill: 'rgba(16,24,40,0.04)' }}
                  contentStyle={{ background: '#fff', border: '1px solid #E8EAED', borderRadius: 14, fontSize: 12, boxShadow: '0 12px 32px -12px rgba(16,24,40,0.25)' }}
                />
                <Bar dataKey="Calls" fill="#FDBA74" radius={[5, 5, 0, 0]} maxBarSize={16} />
                <Bar dataKey="Completed" fill="#F97316" radius={[5, 5, 0, 0]} maxBarSize={16} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </MCard>

        <MCard className="p-6">
          <h3 className="text-[15px] font-bold text-[#101828]">Lead Breakdown</h3>
          <p className="text-xs text-[#667085] mt-0.5">Where leads stand right now</p>
          <div className="space-y-4 mt-5">
            {leadDist.length === 0 && <p className="text-[13px] text-[#667085]">No leads yet.</p>}
            {leadDist.map((d) => (
              <div key={d.status}>
                <div className="flex items-center justify-between text-[13px] mb-1.5">
                  <span className="font-medium text-[#667085] capitalize">{d.status.replace(/_/g, ' ')}</span>
                  <span className="font-bold text-[#101828] tabular-nums">{d.count}</span>
                </div>
                <div className="h-2 rounded-full bg-[#EEF1F4] overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-700" style={{ width: `${(d.count / maxLead) * 100}%`, background: d.color }} />
                </div>
              </div>
            ))}
          </div>
        </MCard>
      </div>

      <MCard className="p-6">
        <h3 className="text-[15px] font-bold text-[#101828] mb-1">Agent Performance</h3>
        <p className="text-xs text-[#667085]">Calls, completions and leads per agent</p>
        <div className="divide-y divide-[#F1F2F4] mt-2">
          {agentPerf.length === 0 && <p className="text-[13px] text-[#667085] py-4">No agent activity yet.</p>}
          {agentPerf.map(({ agent, calls: c, completed, leads: l }) => (
            <div key={agent.agent_id} className="flex items-center gap-4 py-3.5">
              <Avatar name={agent.name} className="w-9 h-9 text-xs" />
              <div className="flex-1 min-w-0">
                <p className="text-[13.5px] font-semibold text-[#101828] truncate">{agent.name}</p>
                <div className="h-1.5 rounded-full bg-[#EEF1F4] mt-1.5 overflow-hidden max-w-md">
                  <div className="h-full rounded-full bg-gradient-to-r from-orange-500 to-amber-400 transition-all duration-700" style={{ width: `${(c / maxAgent) * 100}%` }} />
                </div>
              </div>
              <div className="flex gap-6 text-right shrink-0">
                <span className="hidden sm:block"><span className="block text-sm font-bold text-[#101828] tabular-nums">{c}</span><span className="text-[10.5px] text-[#667085] font-medium">Calls</span></span>
                <span className="hidden sm:block"><span className="block text-sm font-bold text-[#101828] tabular-nums">{completed}</span><span className="text-[10.5px] text-[#667085] font-medium">Completed</span></span>
                <span><span className="block text-sm font-bold text-emerald-600 tabular-nums">{l}</span><span className="text-[10.5px] text-[#667085] font-medium">Leads</span></span>
              </div>
            </div>
          ))}
        </div>
      </MCard>
    </div>
  );
};
