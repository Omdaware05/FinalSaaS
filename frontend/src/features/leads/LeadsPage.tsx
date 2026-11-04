import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '../../components/layout/PageHeader';
import { DataTable, Column } from '../../components/ui/DataTable';
import { Badge } from '../../components/ui/Badge';
import { StatusIndicator } from '../../components/ui/StatusIndicator';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Select } from '../../components/ui/Select';
import { MetricCard } from '../../components/ui/MetricCard';
import { CallDetailDrawer } from '../calls/CallDetailDrawer';
import { leadsApi } from '../../services/api/leads';
import { useToast } from '../../app/providers/ToastProvider';
import { useBusiness } from '../../app/providers/BusinessProvider';
import { getErrorMessage } from '../../services/api/client';
import { LeadDocument } from '../../types/api';
import {
  Target,
  Eye,
  RefreshCw,
  CheckCircle,
  Building2,
  Download,
  Users,
  TrendingUp,
  Sparkles,
  Phone,
  PhoneCall,
  Flame,
  Award,
  Filter,
} from 'lucide-react';
import { format } from 'date-fns';
import { TimeFilterAndExport } from '../../components/ui/TimeFilterAndExport';
import { exportToExcel, filterByDateRange, TimeFilterRange } from '../../utils/excelExport';
import { formatDateTime } from '../../utils/dateUtils';

const STATUS_TABS = [
  { id: 'all', label: 'All Leads' },
  { id: 'interested', label: 'Interested' },
  { id: 'qualified', label: 'Qualified' },
  { id: 'new', label: 'New' },
  { id: 'not_interested', label: 'Not Interested' },
  { id: 'closed', label: 'Closed' },
] as const;

export const LeadsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { selectedBusiness, selectedBusinessId, isAllBusinesses, getBusinessForAgent } = useBusiness();

  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const [editingLead, setEditingLead] = useState<LeadDocument | null>(null);
  const [leadStatus, setLeadStatus] = useState('new');
  const [leadNotes, setLeadNotes] = useState('');
  const [timeRange, setTimeRange] = useState<TimeFilterRange>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isDownloading, setIsDownloading] = useState(false);

  const { data: leads = [], isLoading, refetch } = useQuery({
    queryKey: ['leads', selectedBusinessId],
    queryFn: () => leadsApi.getLeads(),
    refetchInterval: 3000,
  });

  // Filter leads for selected business, pipeline status and date range
  const displayLeads = useMemo(() => {
    let result = leads;
    if (!isAllBusinesses && selectedBusiness) {
      const agentIds = new Set(selectedBusiness.assignedAgentIds || []);
      result = result.filter((l) => {
        if (l.tenant_id && l.tenant_id === selectedBusiness.id) return true;
        if (l.agent_id && agentIds.has(l.agent_id)) return true;
        return false;
      });
    }
    if (statusFilter !== 'all') {
      result = result.filter((l) => (l.status || 'new').toLowerCase() === statusFilter);
    }
    return filterByDateRange(result, (l) => l.created_at, timeRange);
  }, [leads, selectedBusiness, isAllBusinesses, timeRange, statusFilter]);

  // Overall lead counts for the tabs
  const scopeLeads = useMemo(() => {
    let result = leads;
    if (!isAllBusinesses && selectedBusiness) {
      const agentIds = new Set(selectedBusiness.assignedAgentIds || []);
      result = result.filter((l) => {
        if (l.tenant_id && l.tenant_id === selectedBusiness.id) return true;
        if (l.agent_id && agentIds.has(l.agent_id)) return true;
        return false;
      });
    }
    return filterByDateRange(result, (l) => l.created_at, timeRange);
  }, [leads, selectedBusiness, isAllBusinesses, timeRange]);

  const countsByStatus = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of scopeLeads) {
      const s = (l.status || 'new').toLowerCase();
      map.set(s, (map.get(s) || 0) + 1);
    }
    return map;
  }, [scopeLeads]);

  // Metric computations
  const totalLeadsCount = scopeLeads.length;
  const interestedCount = (countsByStatus.get('interested') || 0) + (countsByStatus.get('qualified') || 0);
  const conversionPct = totalLeadsCount > 0 ? Math.round((interestedCount / totalLeadsCount) * 100) : 0;
  const avgScore = useMemo(() => {
    if (scopeLeads.length === 0) return 0;
    const total = scopeLeads.reduce((acc, l) => {
      const raw = l.confidence_score !== undefined && l.confidence_score !== null ? l.confidence_score : ((l as any).score ?? 0);
      return acc + raw;
    }, 0);
    return Math.round((total / scopeLeads.length) * 100);
  }, [scopeLeads]);

  const handleExportExcel = () => {
    const exportRows = displayLeads.map((l) => {
      const ci = l.metadata?.customer_info || {};
      const reasonsText = (items?: { reason: string; evidence?: string }[]) =>
        (items || []).map((r) => `${r.reason} — "${r.evidence || ''}"`).join('; ');
      return {
        'Customer Name': l.name || (l.metadata as any)?.customer_name || ci.name || 'Unknown Prospect',
        'Prospect Phone': l.phone_number,
        'Pipeline Status': (l.status || 'new').toUpperCase(),
        'What Customer Said': (l.metadata as any)?.what_they_said || l.reasoning || l.notes || 'N/A',
        'When to Call Again (Preferred Callback)': (l.metadata as any)?.preferred_callback_time || 'N/A',
        'Service Interested': (l.metadata as any)?.service_interested || ci.product_interest || 'N/A',
        'Confidence Score': `${Math.round(((l.confidence_score !== undefined && l.confidence_score !== null) ? l.confidence_score : ((l as any).score ?? 0)) * 100)}%`,
        'Email': l.email || ci.email || 'N/A',
        'City': ci.city || 'N/A',
        'Budget (INR)': ci.budget_inr ?? 'N/A',
        'Why Interested': reasonsText(l.metadata?.why_interested) || 'N/A',
        'Why Not Interested': reasonsText(l.metadata?.why_not_interested) || 'N/A',
        'Call ID': l.call_id || 'N/A',
        'Agent ID': l.agent_id || 'N/A',
        'Captured At': formatDateTime(l.created_at, 'yyyy-MM-dd HH:mm:ss'),
      };
    });
    exportToExcel(exportRows, `voxora_leads_pipeline_${statusFilter}_${timeRange}_${format(new Date(), 'yyyyMMdd')}`, 'Leads Pipeline');
  };

  // Server-side workbook
  const handleDownloadServerExcel = async () => {
    setIsDownloading(true);
    try {
      await leadsApi.downloadLeadsExcel(
        statusFilter !== 'all' ? statusFilter : undefined,
        isAllBusinesses ? undefined : selectedBusinessId
      );
      toast.success('Excel Downloaded', `Leads workbook (${statusFilter === 'all' ? 'all statuses' : statusFilter}) saved.`);
    } catch (err) {
      toast.error('Excel download failed', getErrorMessage(err));
    } finally {
      setIsDownloading(false);
    }
  };

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { status?: string; notes?: string } }) =>
      leadsApi.updateLead(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      toast.success('Lead Updated', 'Status and notes recorded.');
      setEditingLead(null);
    },
    onError: (err) => {
      toast.error('Failed to update lead', getErrorMessage(err));
    },
  });

  const handleOpenEdit = (lead: LeadDocument) => {
    setEditingLead(lead);
    setLeadStatus(lead.status || 'new');
    setLeadNotes(lead.notes || '');
  };

  const handleSaveLead = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLead) return;
    updateMutation.mutate({
      id: editingLead.lead_id,
      payload: {
        status: leadStatus,
        notes: leadNotes,
      },
    });
  };

  const columns: Column<LeadDocument>[] = [
    {
      key: 'phone_number',
      header: 'Prospect Phone',
      sortable: true,
      render: (lead) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20 flex items-center justify-center shrink-0 font-bold text-xs shadow-sm">
            <Phone className="w-3.5 h-3.5" />
          </div>
          <div className="flex flex-col">
            <span className="font-semibold text-xs text-slate-900 dark:text-slate-100 tracking-wide font-mono">
              {lead.phone_number}
            </span>
            <span className="text-[10px] text-slate-400 font-mono">
              {formatDateTime(lead.created_at, 'MMM dd · hh:mm a')}
            </span>
          </div>
        </div>
      ),
    },
    {
      key: 'customer',
      header: 'Customer (from call)',
      render: (lead) => {
        const ci = lead.metadata?.customer_info || {};
        const name = lead.name || ci.name;
        const email = lead.email || ci.email;
        const city = ci.city;
        const budget = ci.budget_inr ? `₹${ci.budget_inr.toLocaleString('en-IN')}` : null;
        const callbackTime = ci.preferred_callback_time ? `↩ ${ci.preferred_callback_time}` : null;

        if (!name && !email && !city && !budget && !callbackTime) {
          return <span className="text-xs text-slate-400 italic">Not stated on call</span>;
        }
        return (
          <div className="flex flex-col gap-1 max-w-[210px]">
            {name ? (
              <span className="font-semibold text-xs text-slate-900 dark:text-slate-100 truncate flex items-center gap-1.5">
                {name}
              </span>
            ) : (
              <span className="text-[11px] text-slate-400 font-mono">Prospect</span>
            )}
            {email && <span className="text-[11px] text-slate-500 dark:text-zinc-400 truncate">{email}</span>}
            <div className="flex items-center gap-1 flex-wrap">
              {city && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 dark:bg-white/[0.06] text-slate-600 dark:text-zinc-300">
                  📍 {city}
                </span>
              )}
              {budget && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                  {budget}
                </span>
              )}
              {callbackTime && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400">
                  {callbackTime}
                </span>
              )}
            </div>
          </div>
        );
      },
    },
    {
      key: 'client_attribution',
      header: 'Client Business',
      render: (lead) => {
        const biz = getBusinessForAgent(lead.agent_id);
        return (
          <div className="flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="text-xs text-slate-600 dark:text-zinc-300 font-medium truncate max-w-[140px]">
              {biz ? biz.name : selectedBusiness ? selectedBusiness.name : 'General Account'}
            </span>
          </div>
        );
      },
    },
    {
      key: 'confidence_score',
      header: 'Interest Score',
      sortable: true,
      render: (lead) => {
        const rawScore = lead.confidence_score !== undefined && lead.confidence_score !== null ? lead.confidence_score : ((lead as any).score ?? 0);
        const pct = Math.round(rawScore * 100);
        const isHigh = pct >= 70;
        const isMid = pct >= 40 && pct < 70;

        return (
          <div className="w-28 space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-mono">
              <span className="text-slate-400 text-[10px] uppercase font-semibold">Intent</span>
              <strong
                className={
                  isHigh
                    ? 'text-emerald-500 dark:text-emerald-400 flex items-center gap-0.5'
                    : isMid
                    ? 'text-amber-500 dark:text-amber-400'
                    : 'text-slate-500 dark:text-zinc-400'
                }
              >
                {isHigh && <Flame className="w-3 h-3 fill-emerald-500/20" />}
                {pct}%
              </strong>
            </div>
            <div className="w-full h-1.5 bg-slate-100 dark:bg-white/[0.08] rounded-full overflow-hidden p-0.5">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  isHigh
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                    : isMid
                    ? 'bg-gradient-to-r from-amber-500 to-orange-400'
                    : 'bg-slate-400'
                }`}
                style={{ width: `${Math.max(pct, 5)}%` }}
              />
            </div>
          </div>
        );
      },
    },
    {
      key: 'status',
      header: 'Pipeline Stage',
      sortable: true,
      render: (lead) => {
        const s = lead.status?.toLowerCase() || 'new';
        const type =
          s === 'interested' || s === 'qualified'
            ? 'success'
            : s === 'not_interested'
            ? 'danger'
            : s === 'closed'
            ? 'inactive'
            : 'pending';
        const label = s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
        return <StatusIndicator status={type} label={label} />;
      },
    },
    {
      key: 'reasoning',
      header: 'Why — AI Reasons',
      render: (lead) => {
        const whyIn = lead.metadata?.why_interested || [];
        const whyNot = lead.metadata?.why_not_interested || [];
        const chip = (
          r: { reason: string; evidence?: string },
          cls: string,
        ) => (
          <span
            key={r.reason}
            title={r.evidence ? `Customer said: "${r.evidence}"` : undefined}
            className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium leading-tight border transition-colors shadow-2xs ${cls}`}
          >
            {r.reason}
          </span>
        );
        return (
          <div className="flex flex-col gap-1.5 max-w-[320px]">
            {(whyIn.length > 0 || whyNot.length > 0) && (
              <div className="flex flex-wrap gap-1">
                {whyIn.map((r) =>
                  chip(
                    r,
                    'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20'
                  )
                )}
                {whyNot.map((r) =>
                  chip(
                    r,
                    'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20'
                  )
                )}
              </div>
            )}
            <p className="text-xs text-slate-600 dark:text-zinc-400 line-clamp-2 leading-relaxed">
              {lead.reasoning || lead.notes || 'No reason recorded for this lead yet.'}
            </p>
          </div>
        );
      },
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (lead) => (
        <div className="flex items-center justify-end gap-1.5">
          <Button
            variant="outline"
            size="xs"
            onClick={() => handleOpenEdit(lead)}
            className="hover:border-orange-500/40 hover:text-orange-500"
          >
            Update
          </Button>
          {lead.call_id && (
            <Button
              variant="ghost"
              size="xs"
              onClick={() => setSelectedCallId(lead.call_id)}
              leftIcon={<Eye className="w-3 h-3 text-orange-500" />}
              className="hover:bg-orange-500/10 hover:text-orange-500"
            >
              Call
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        category={isAllBusinesses ? 'CRM & Pipeline' : `Leads: ${selectedBusiness?.name}`}
        title="Leads"
        subtitle={
          isAllBusinesses
            ? 'Every lead captured by AI voice telecallers — with extracted customer details, intent qualification, and dialogue evidence.'
            : `Customer leads captured for ${selectedBusiness?.name}, with call-extracted details and AI reasons.`
        }
        actions={
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="w-44">
              <Select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                aria-label="Filter leads by status"
              >
                <option value="all">All Statuses</option>
                <option value="interested">Interested</option>
                <option value="qualified">Qualified</option>
                <option value="new">New</option>
                <option value="not_interested">Not Interested</option>
                <option value="closed">Closed</option>
              </Select>
            </div>
            <TimeFilterAndExport
              timeRange={timeRange}
              onTimeRangeChange={setTimeRange}
              onExport={handleExportExcel}
              filteredCount={displayLeads.length}
              label="Export Leads"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadServerExcel}
              isLoading={isDownloading}
              leftIcon={<Download className="w-3.5 h-3.5 text-slate-400" />}
            >
              Excel (Server)
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              leftIcon={<RefreshCw className="w-3.5 h-3.5 text-slate-400" />}
            >
              Refresh
            </Button>
          </div>
        }
      />

      {/* KPI Metric Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Total Leads Captured"
          value={totalLeadsCount}
          subtext="Extracted from phone calls"
          icon={<Target className="w-5 h-5 text-orange-500" />}
          isLoading={isLoading}
        />
        <MetricCard
          label="Interested & Qualified"
          value={interestedCount}
          subtext={`${conversionPct}% pipeline interest rate`}
          icon={<CheckCircle className="w-5 h-5 text-emerald-500" />}
          glow={interestedCount > 0}
          isLoading={isLoading}
        />
        <MetricCard
          label="Avg. AI Confidence"
          value={`${avgScore}%`}
          subtext="Intent scoring accuracy"
          icon={<Award className="w-5 h-5 text-indigo-500" />}
          isLoading={isLoading}
        />
        <MetricCard
          label="Conversion Readiness"
          value={interestedCount}
          subtext="Actionable callback candidates"
          icon={<PhoneCall className="w-5 h-5 text-amber-500" />}
          isLoading={isLoading}
        />
      </div>

      {/* Quick Status Pill Bar */}
      <div className="flex items-center gap-2 p-1.5 rounded-2xl bg-slate-900/5 dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/[0.06] overflow-x-auto">
        <div className="flex items-center gap-1.5 px-2 text-xs font-semibold text-slate-400">
          <Filter className="w-3.5 h-3.5" />
          <span>Stage:</span>
        </div>
        {STATUS_TABS.map((tab) => {
          const isActive = statusFilter === tab.id;
          const count = tab.id === 'all' ? scopeLeads.length : countsByStatus.get(tab.id) || 0;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium transition-all shrink-0 ${
                isActive
                  ? 'bg-orange-500 text-white shadow-sm font-semibold'
                  : 'text-slate-600 dark:text-zinc-300 hover:bg-slate-200/60 dark:hover:bg-white/[0.06]'
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                  isActive
                    ? 'bg-white/20 text-white'
                    : 'bg-slate-200 dark:bg-white/[0.08] text-slate-500 dark:text-zinc-400'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Main Leads Data Table */}
      <div className="rounded-2xl border border-slate-200/80 dark:border-white/[0.06] bg-white/50 dark:bg-zinc-900/50 backdrop-blur-sm overflow-hidden shadow-sm">
        <DataTable
          columns={columns}
          data={displayLeads}
          isLoading={isLoading}
          keyExtractor={(l) => l.lead_id}
          searchPlaceholder="Filter leads by phone, customer name, email, city, status or AI reasons..."
          searchableKey={(l) =>
            `${l.phone_number} ${l.status || ''} ${l.reasoning || ''} ${l.name || ''} ${l.email || ''} ${
              l.metadata?.customer_info?.city || ''
            }`
          }
          emptyTitle="No leads captured yet"
          emptyDescription="Analyzed calls will automatically appear here as leads, with their extracted customer details and reasons."
          pageSize={10}
        />
      </div>

      {/* Edit Lead Status Modal */}
      <Modal
        isOpen={!!editingLead}
        onClose={() => setEditingLead(null)}
        title={editingLead ? `Update Lead: ${editingLead.phone_number}` : 'Update Lead'}
        description="Modify the CRM lifecycle stage and attach follow-up operator notes."
        size="md"
      >
        <form onSubmit={handleSaveLead} className="space-y-4">
          <Select
            label="Pipeline Status"
            value={leadStatus}
            onChange={(e) => setLeadStatus(e.target.value)}
          >
            <option value="new">New Opportunity</option>
            <option value="interested">Interested</option>
            <option value="not_interested">Not Interested</option>
            <option value="qualified">Sales Qualified</option>
            <option value="closed">Closed / Disqualified</option>
          </Select>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
              Operator Notes
            </label>
            <textarea
              rows={3}
              value={leadNotes}
              onChange={(e) => setLeadNotes(e.target.value)}
              placeholder="Add follow-up notes, requested callback times, customer constraints..."
              className="w-full p-2.5 text-xs rounded-xl bg-white/70 dark:bg-white/[0.04] border border-slate-300/80 dark:border-white/[0.08] text-slate-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-orange-500/40"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100 dark:border-white/[0.06]">
            <Button variant="ghost" size="sm" onClick={() => setEditingLead(null)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              isLoading={updateMutation.isPending}
              leftIcon={<CheckCircle className="w-4 h-4" />}
            >
              Save Changes
            </Button>
          </div>
        </form>
      </Modal>

      <CallDetailDrawer callId={selectedCallId} onClose={() => setSelectedCallId(null)} />
    </div>
  );
};
