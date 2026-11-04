import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/layout/PageHeader';
import { MetricCard } from '../../components/ui/MetricCard';
import { Button } from '../../components/ui/Button';
import { DataTable, Column } from '../../components/ui/DataTable';
import { StatusIndicator } from '../../components/ui/StatusIndicator';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { BusinessFormModal } from './BusinessFormModal';
import { useBusiness, Business } from '../../app/providers/BusinessProvider';
import { agentsApi } from '../../services/api/agents';
import { leadsApi } from '../../services/api/leads';
import { statsApi } from '../../services/api/stats';
import {
  Building2,
  Plus,
  ArrowRight,
  Edit2,
  Trash2,
  Bot,
  RefreshCw,
  PhoneCall,
  Target,
  Users,
  FileText,
} from 'lucide-react';
import { useToast } from '../../app/providers/ToastProvider';
import { getErrorMessage } from '../../services/api/client';
import { generateBusinessDashboardPdf } from '../../utils/businessPdfExport';

export const BusinessesPage: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const { businesses, deleteBusiness, selectBusiness } = useBusiness();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBusiness, setEditingBusiness] = useState<Business | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [exportingBizId, setExportingBizId] = useState<string | null>(null);

  // Queries for real backend operational data
  const { data: agents = [], isLoading: agentsLoading, refetch: refetchAgents } = useQuery({
    queryKey: ['agents'],
    queryFn: () => agentsApi.getAgents(50),
  });

  const { data: leads = [], isLoading: leadsLoading, refetch: refetchLeads } = useQuery({
    queryKey: ['leads'],
    queryFn: () => leadsApi.getLeads(),
  });

  const { data: stats, refetch: refetchStats } = useQuery({
    queryKey: ['global-stats'],
    queryFn: () => statsApi.getStats(),
  });

  const handleOpenCreate = () => {
    setEditingBusiness(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (b: Business, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingBusiness(b);
    setIsModalOpen(true);
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeletingId(id);
  };

  const handleConfirmDelete = () => {
    if (deletingId) {
      deleteBusiness(deletingId);
      setDeletingId(null);
    }
  };

  const handleOpenWorkspace = (businessId: string) => {
    selectBusiness(businessId);
    navigate('/');
  };

  const handleDownloadBusinessPdf = async (biz: Business) => {
    try {
      setExportingBizId(biz.id);
      const assignedAgents = agents.filter((a) =>
        biz.assignedAgentIds.includes(a.agent_id)
      );
      const primaryAgent = assignedAgents[0];

      let dashData: any = null;
      if (primaryAgent) {
        try {
          dashData = await agentsApi.getAgentDashboard(primaryAgent.agent_id);
        } catch (err) {
          console.warn('Dashboard fetch notice for agent:', err);
        }
      }

      const bizLeads = leads.filter(
        (l) => l.agent_id && biz.assignedAgentIds.includes(l.agent_id)
      );

      const statsToPass = {
        total_calls: dashData?.total_calls ?? (stats?.total_calls ?? 0),
        completed_calls: dashData?.completed_calls ?? (stats?.completed ?? 0),
        failed_calls: dashData?.failed_calls ?? 0,
        active_calls: dashData?.active_calls ?? 0,
        queued_calls: dashData?.queued_calls ?? 0,
        average_duration_seconds: dashData?.average_duration_seconds ?? 0,
        total_duration_seconds: (dashData?.completed_calls ?? 0) * (dashData?.average_duration_seconds ?? 0),
        total_leads: bizLeads.length,
        qualified_leads: bizLeads.filter((l) => l.status === 'qualified' || l.status === 'interested').length,
        interested_count: dashData?.interested_count ?? bizLeads.filter((l) => l.status === 'interested' || l.status === 'qualified').length,
        not_interested_count: dashData?.not_interested_count ?? 0,
        uncertain_count: dashData?.uncertain_count ?? 0,
      };

      generateBusinessDashboardPdf({
        business: biz,
        assignedAgents,
        stats: statsToPass,
        recentCalls: dashData?.recent_calls || [],
      });

      toast.success('PDF Exported', `Generated telemetry dashboard report for ${biz.name}`);
    } catch (err: any) {
      toast.error('Export Failed', getErrorMessage(err));
    } finally {
      setExportingBizId(null);
    }
  };

  // Compute metrics per business using real agent relationships
  const businessRows = businesses.map((biz) => {
    const assignedAgents = agents.filter((a) =>
      biz.assignedAgentIds.includes(a.agent_id)
    );

    // Filter leads associated with this business's agents
    const bizLeads = leads.filter(
      (l) => l.agent_id && biz.assignedAgentIds.includes(l.agent_id)
    );

    return {
      ...biz,
      assignedAgents,
      agentCount: assignedAgents.length,
      leadCount: bizLeads.length,
    };
  });

  const columns: Column<typeof businessRows[0]>[] = [
    {
      key: 'name',
      header: 'Client Business',
      sortable: true,
      render: (biz) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 flex items-center justify-center font-bold text-xs shrink-0 border border-slate-200 dark:border-zinc-700">
            {biz.name.slice(0, 2).toUpperCase()}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-semibold text-slate-900 dark:text-slate-100 text-xs sm:text-sm truncate">
              {biz.name}
            </span>
            <span className="text-[11px] text-slate-500 dark:text-zinc-400 truncate">
              {biz.industry}
            </span>
          </div>
        </div>
      ),
    },
    {
      key: 'assignedAgents',
      header: 'Assigned AI Agents',
      render: (biz) => (
        <div className="flex items-center gap-1.5 flex-wrap">
          {biz.assignedAgents.length === 0 ? (
            <span className="text-xs text-slate-400">None assigned</span>
          ) : (
            biz.assignedAgents.map((ag) => (
              <span
                key={ag.agent_id}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 border border-slate-200 dark:border-zinc-700"
              >
                <Bot className="w-3 h-3 text-slate-400" />
                <span className="truncate max-w-[120px]">{ag.name}</span>
              </span>
            ))
          )}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (biz) => {
        const type =
          biz.status === 'active' ? 'active' : biz.status === 'onboarding' ? 'pending' : 'inactive';
        const label =
          biz.status === 'active' ? 'Active' : biz.status === 'onboarding' ? 'Onboarding' : 'Paused';
        return <StatusIndicator status={type} label={label} />;
      },
    },
    {
      key: 'leadCount',
      header: 'Leads Captured',
      sortable: true,
      render: (biz) => (
        <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
          {biz.leadCount}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (biz) => (
        <div className="flex items-center justify-end gap-1.5">
          <Button
            variant="outline"
            size="xs"
            onClick={(e) => handleOpenEdit(biz, e)}
            title="Edit business profile"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="xs"
            onClick={(e) => handleDelete(biz.id, e)}
            className="text-slate-400 hover:text-rose-600"
            title="Delete business"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="outline"
            size="xs"
            onClick={(e) => {
              e.stopPropagation();
              handleDownloadBusinessPdf(biz);
            }}
            disabled={exportingBizId === biz.id}
            className="text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/60 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
            title="Download Client Dashboard PDF"
          >
            <FileText className={`w-3.5 h-3.5 ${exportingBizId === biz.id ? 'animate-pulse' : ''}`} />
          </Button>
          <Button
            variant="secondary"
            size="xs"
            onClick={() => handleOpenWorkspace(biz.id)}
            rightIcon={<ArrowRight className="w-3 h-3" />}
          >
            Workspace
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        category="Agency Management"
        title="Businesses"
        subtitle="Manage client accounts and their dedicated AI calling operations from one central workspace."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                refetchAgents();
                refetchLeads();
                refetchStats();
              }}
              leftIcon={<RefreshCw className="w-3.5 h-3.5 text-slate-400" />}
            >
              Refresh
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleOpenCreate}
              leftIcon={<Plus className="w-4 h-4" />}
            >
              Add Business
            </Button>
          </div>
        }
      />

      {/* Agency KPI Overview */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <MetricCard
          label="Total Client Accounts"
          value={businesses.length}
          subtext="Managed businesses"
        />
        <MetricCard
          label="AI Voice Agents"
          value={agents.length}
          subtext="Active across all clients"
          isLoading={agentsLoading}
        />
        <MetricCard
          label="Total Completed Calls"
          value={stats?.completed ?? 0}
          subtext="Platform telephony volume"
        />
        <MetricCard
          label="Total Captured Leads"
          value={leads.length}
          subtext="Classified prospects"
          isLoading={leadsLoading}
        />
      </div>

      {/* Main Table */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Client Accounts Directory
          </h2>
        </div>

        <DataTable
          columns={columns}
          data={businessRows}
          isLoading={agentsLoading || leadsLoading}
          keyExtractor={(b) => b.id}
          onRowClick={(b) => handleOpenWorkspace(b.id)}
          searchPlaceholder="Search businesses by name, industry..."
          searchableKey={(b) => `${b.name} ${b.industry} ${b.description || ''}`}
          emptyTitle="No client businesses created yet"
          emptyDescription="Add your first business client to assign AI agents and track isolated calling campaigns."
          pageSize={10}
        />
      </div>

      {/* Business Form Modal */}
      <BusinessFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        business={editingBusiness}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={!!deletingId}
        onClose={() => setDeletingId(null)}
        onConfirm={handleConfirmDelete}
        title="Remove Business Account"
        message="Are you sure you want to remove this business? Its assigned agents will remain in the platform and can be reassigned."
        confirmText="Remove"
      />
    </div>
  );
};
