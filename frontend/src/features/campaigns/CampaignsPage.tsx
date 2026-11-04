import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '../../components/layout/PageHeader';
import { DataTable, Column } from '../../components/ui/DataTable';
import { CampaignStatusBadge, ProviderBadge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { CampaignWizardModal } from './CampaignWizardModal';
import { campaignsApi } from '../../services/api/campaigns';
import { useToast } from '../../app/providers/ToastProvider';
import { useBusiness } from '../../app/providers/BusinessProvider';
import { getErrorMessage } from '../../services/api/client';
import { CampaignDocument } from '../../types/api';
import { Megaphone, Plus, Play, Square, RefreshCw } from 'lucide-react';

export const CampaignsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { selectedBusiness, selectedBusinessId, isAllBusinesses } = useBusiness();
  const [isWizardOpen, setIsWizardOpen] = useState(false);

  const { data: campaigns = [], isLoading, refetch } = useQuery({
    queryKey: ['campaigns', selectedBusinessId],
    queryFn: () => campaignsApi.getCampaigns(),
    refetchInterval: 5000,
  });

  // Filter campaigns by scoped agents if a business is selected
  const displayCampaigns = React.useMemo(() => {
    if (isAllBusinesses || !selectedBusiness) return campaigns;
    const agentIds = new Set(selectedBusiness.assignedAgentIds);
    return campaigns.filter((c) => !c.agent_id || agentIds.has(c.agent_id));
  }, [campaigns, selectedBusiness, isAllBusinesses]);

  const startMutation = useMutation({
    mutationFn: (id: string) => campaignsApi.startCampaign(id),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      toast.success('Campaign Started', res.message || 'Execution begun.');
    },
    onError: (err) => {
      toast.error('Failed to start campaign', getErrorMessage(err));
    },
  });

  const stopMutation = useMutation({
    mutationFn: (id: string) => campaignsApi.stopCampaign(id),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      toast.info('Campaign Stopped', res.message || 'Execution halted.');
    },
    onError: (err) => {
      toast.error('Failed to stop campaign', getErrorMessage(err));
    },
  });

  const columns: Column<CampaignDocument>[] = [
    {
      key: 'name',
      header: 'Campaign Name',
      sortable: true,
      render: (camp) => (
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 flex items-center justify-center shrink-0 font-bold text-xs">
            <Megaphone className="w-3.5 h-3.5" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-semibold text-xs text-slate-900 dark:text-slate-100 truncate">{camp.name}</span>
            <span className="text-[10px] text-slate-400 line-clamp-1">{camp.description || 'Outbound voice campaign'}</span>
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (camp) => <CampaignStatusBadge status={camp.status} size="sm" />,
    },
    {
      key: 'provider',
      header: 'Provider',
      sortable: true,
      render: (camp) => <ProviderBadge provider={camp.provider} size="xs" />,
    },
    {
      key: 'progress',
      header: 'Progress & Completion',
      render: (camp) => {
        const total = camp.total_calls || camp.phone_numbers?.length || 0;
        const done = (camp.completed_calls || 0) + (camp.failed_calls || 0);
        const pct = total > 0 ? Math.round((done / total) * 100) : 0;
        return (
          <div className="w-36 space-y-1">
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-500">
              <span>{done} / {total}</span>
              <span className="font-bold text-slate-700 dark:text-zinc-300">{pct}%</span>
            </div>
            <div className="w-full h-1 bg-slate-100 dark:bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-slate-900 dark:bg-white rounded-full transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      },
    },
    {
      key: 'concurrency',
      header: 'Channels',
      align: 'center',
      render: (camp) => (
        <span className="font-mono text-xs font-semibold text-slate-700 dark:text-zinc-300">
          {camp.concurrency}x
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (camp) => (
        <div className="flex items-center justify-end gap-1.5">
          {camp.status === 'RUNNING' ? (
            <Button
              variant="danger"
              size="xs"
              onClick={() => stopMutation.mutate(camp.campaign_id)}
              isLoading={stopMutation.isPending}
              leftIcon={<Square className="w-3 h-3" />}
            >
              Stop
            </Button>
          ) : (
            <Button
              variant="primary"
              size="xs"
              onClick={() => startMutation.mutate(camp.campaign_id)}
              isLoading={startMutation.isPending}
              leftIcon={<Play className="w-3 h-3" />}
            >
              Start
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        category={isAllBusinesses ? 'Outreach & CRM' : `Campaigns: ${selectedBusiness?.name}`}
        title="Outbound Voice Campaigns"
        subtitle={
          isAllBusinesses
            ? 'Orchestrate automated high-volume outbound calling workflows with smart concurrency throttling.'
            : `Outbound calling campaigns executed for ${selectedBusiness?.name}.`
        }
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              leftIcon={<RefreshCw className="w-3.5 h-3.5 text-slate-400" />}
            >
              Refresh
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setIsWizardOpen(true)}
              leftIcon={<Plus className="w-4 h-4" />}
            >
              New Campaign
            </Button>
          </div>
        }
      />

      <DataTable
        columns={columns}
        data={displayCampaigns}
        isLoading={isLoading}
        keyExtractor={(c) => c.campaign_id}
        searchPlaceholder="Filter campaigns..."
        searchableKey="name"
        emptyTitle="No campaigns created"
        emptyDescription="Create your first outbound campaign to automate customer phone calls at scale."
        pageSize={10}
      />

      <CampaignWizardModal
        isOpen={isWizardOpen}
        onClose={() => setIsWizardOpen(false)}
        onSuccess={() => refetch()}
      />
    </div>
  );
};
