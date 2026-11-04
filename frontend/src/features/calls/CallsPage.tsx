import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '../../components/layout/PageHeader';
import { DataTable, Column } from '../../components/ui/DataTable';
import { CallStateBadge, ProviderBadge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';
import { CallDetailDrawer } from './CallDetailDrawer';
import { callsApi } from '../../services/api/calls';
import { agentsApi } from '../../services/api/agents';
import { useBusiness } from '../../app/providers/BusinessProvider';
import { CallDocument } from '../../types/api';
import { PhoneCall, Eye, RefreshCw, Filter } from 'lucide-react';
import { format } from 'date-fns';
import { useSearchParams } from 'react-router-dom';
import { TimeFilterAndExport } from '../../components/ui/TimeFilterAndExport';
import { exportToExcel, filterByDateRange, TimeFilterRange } from '../../utils/excelExport';
import { formatDateTime } from '../../utils/dateUtils';

export const CallsPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const urlAgentId = searchParams.get('agent_id') || '';
  const { selectedBusiness, selectedBusinessId, isAllBusinesses } = useBusiness();

  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const [stateFilter, setStateFilter] = useState<string>('ALL');
  const [agentFilter, setAgentFilter] = useState<string>(urlAgentId);
  const [timeRange, setTimeRange] = useState<TimeFilterRange>('all');

  React.useEffect(() => {
    if (urlAgentId) {
      setAgentFilter(urlAgentId);
    }
  }, [urlAgentId]);

  const { data: agents = [] } = useQuery({
    queryKey: ['agents', selectedBusinessId],
    queryFn: () => agentsApi.getAgents(50),
  });

  // Filter agents scoped to current business if selected
  const scopedAgents = React.useMemo(() => {
    if (isAllBusinesses || !selectedBusiness) return agents;
    return agents.filter((a) => selectedBusiness.assignedAgentIds.includes(a.agent_id));
  }, [agents, selectedBusiness, isAllBusinesses]);

  const { data: calls = [], isLoading, refetch } = useQuery({
    queryKey: ['calls', stateFilter, agentFilter, selectedBusinessId],
    queryFn: () =>
      callsApi.getCalls({
        state: stateFilter === 'ALL' ? undefined : stateFilter,
        agent_id: agentFilter ? agentFilter : undefined,
        limit: 100,
      }),
    refetchInterval: 3000,
  });

  // Filter calls by scoped agents, tenant/business ID, and date range
  const displayCalls = React.useMemo(() => {
    let result = calls;
    if (!isAllBusinesses && selectedBusiness && !agentFilter) {
      const agentIds = new Set([
        ...scopedAgents.map((a) => a.agent_id),
        ...(selectedBusiness.assignedAgentIds || []),
      ]);
      result = result.filter(
        (c) =>
          ((c as any).tenant_id && (c as any).tenant_id === selectedBusiness.id) ||
          ((c as any).business_id && (c as any).business_id === selectedBusiness.id) ||
          (c.agent_id && agentIds.has(c.agent_id))
      );
    }
    return filterByDateRange(result, (c) => c.created_at, timeRange);
  }, [calls, scopedAgents, selectedBusiness, isAllBusinesses, agentFilter, timeRange]);

  const handleExportExcel = () => {
    const exportRows = displayCalls.map((c) => ({
      'Call ID': c.call_id,
      'Phone Number': c.phone_number,
      'State': c.state,
      'Provider': c.provider || 'vobiz',
      'Duration (sec)': c.duration ?? 0,
      'Agent ID': c.agent_id || 'N/A',
      'Created At': formatDateTime(c.created_at, 'yyyy-MM-dd HH:mm:ss'),
      'Recording': c.recording?.provider_url || c.recording?.local_path || 'N/A',
    }));
    exportToExcel(exportRows, `voxora_call_history_${timeRange}_${format(new Date(), 'yyyyMMdd')}`, 'Call History');
  };

  const columns: Column<CallDocument>[] = [
    {
      key: 'phone_number',
      header: 'Phone Number',
      sortable: true,
      render: (call) => (
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-slate-900/[0.04] dark:bg-white/[0.06] text-orange-500 dark:text-orange-400 border border-slate-900/[0.07] dark:border-white/[0.09] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] flex items-center justify-center shrink-0">
            <PhoneCall className="w-4 h-4" />
          </div>
          <div className="flex flex-col">
            <span className="font-semibold text-xs text-slate-900 dark:text-white">{call.phone_number}</span>
            <span className="text-[10px] text-slate-400 dark:text-neutral-500 font-mono">{call.call_id}</span>
          </div>
        </div>
      ),
    },
    {
      key: 'state',
      header: 'Call State',
      sortable: true,
      render: (call) => <CallStateBadge state={call.state} size="xs" />,
    },
    {
      key: 'provider',
      header: 'Provider',
      sortable: true,
      render: (call) => <ProviderBadge provider={call.provider} size="xs" />,
    },
    {
      key: 'duration',
      header: 'Duration',
      sortable: true,
      render: (call) => (
        <span className="font-mono text-xs tabular-nums text-slate-700 dark:text-neutral-300">
          {(call.duration || 0).toFixed(1)}s
        </span>
      ),
    },
    {
      key: 'created_at',
      header: 'Initiated At',
      sortable: true,
      render: (call) => {
        try {
          return (
            <span className="text-xs text-slate-500 dark:text-neutral-400 font-mono">
              {formatDateTime(call.created_at, 'MMM dd, yyyy · hh:mm:ss a')}
            </span>
          );
        } catch {
          return <span className="text-xs text-slate-500 dark:text-neutral-400 font-mono">{call.created_at}</span>;
        }
      },
    },
    {
      key: 'actions',
      header: 'Details',
      align: 'right',
      render: (call) => (
        <Button
          variant="secondary"
          size="xs"
          onClick={(e) => {
            e.stopPropagation();
            setSelectedCallId(call.call_id);
          }}
          leftIcon={<Eye className="w-3 h-3" />}
        >
          Inspect
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        category={isAllBusinesses ? 'Voice Operations' : `Calls: ${selectedBusiness?.name}`}
        title="Call Telemetry & Logs"
        subtitle={
          isAllBusinesses
            ? 'Inspect full-duplex transcripts, recordings, and automated lead interest classifications across all accounts.'
            : `Call history and recordings for ${selectedBusiness?.name}.`
        }
        actions={
          <div className="flex items-center gap-2.5 flex-wrap">
            <TimeFilterAndExport
              timeRange={timeRange}
              onTimeRangeChange={setTimeRange}
              onExport={handleExportExcel}
              filteredCount={displayCalls.length}
              label="Export Calls"
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => refetch()}
              leftIcon={<RefreshCw className="w-3.5 h-3.5 text-neutral-400" />}
            >
              Refresh
            </Button>
          </div>
        }
      />

      {/* Filter Toolbar */}
      <div className="p-3 rounded-2xl bg-white/75 dark:bg-[var(--card-glass-bg)] backdrop-blur-[18px] border border-slate-200/80 dark:border-white/[0.09] shadow-sm dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_8px_32px_rgba(0,0,0,0.35)] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-neutral-300">
          <Filter className="w-3.5 h-3.5 text-neutral-400" />
          <span>Filters:</span>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap flex-1 sm:justify-end">
          {/* State Filter */}
          <div className="w-36">
            <Select value={stateFilter} onChange={(e) => setStateFilter(e.target.value)}>
              <option value="ALL">All States</option>
              <option value="COMPLETED">Completed</option>
              <option value="FAILED">Failed</option>
              <option value="BUSY">Busy</option>
              <option value="NO_ANSWER">No Answer</option>
              <option value="CONNECTED">Connected</option>
              <option value="QUEUED">Queued</option>
            </Select>
          </div>

          {/* Agent Filter */}
          <div className="w-44">
            <Select value={agentFilter} onChange={(e) => setAgentFilter(e.target.value)}>
              <option value="">{isAllBusinesses ? 'All Agents' : 'All Business Agents'}</option>
              {scopedAgents.map((ag) => (
                <option key={ag.agent_id} value={ag.agent_id}>
                  {ag.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </div>

      {/* Main Table */}
      <DataTable
        columns={columns}
        data={displayCalls}
        isLoading={isLoading}
        keyExtractor={(call) => call.call_id}
        onRowClick={(call) => setSelectedCallId(call.call_id)}
        searchPlaceholder="Filter by phone number..."
        searchableKey="phone_number"
        emptyTitle="No calls recorded"
        emptyDescription="No voice sessions recorded under the selected filter criteria."
        pageSize={12}
      />

      {/* Detail Slideover Drawer */}
      <CallDetailDrawer callId={selectedCallId} onClose={() => setSelectedCallId(null)} />
    </div>
  );
};
