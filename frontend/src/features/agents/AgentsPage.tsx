import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { NavLink } from 'react-router-dom';
import { PageHeader } from '../../components/layout/PageHeader';
import { Button } from '../../components/ui/Button';
import { ProviderBadge } from '../../components/ui/Badge';
import { StatusIndicator } from '../../components/ui/StatusIndicator';
import { Switch } from '../../components/ui/Switch';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { AgentFormDrawer } from './AgentFormDrawer';
import { agentsApi } from '../../services/api/agents';
import { useToast } from '../../app/providers/ToastProvider';
import { useBusiness, Business } from '../../app/providers/BusinessProvider';
import { AgentDocument } from '../../types/api';
import { getErrorMessage } from '../../services/api/client';
import {
  Bot,
  Plus,
  Copy,
  Edit2,
  Trash2,
  ArrowRight,
  Languages,
  Layers,
  Building2,
  RefreshCw,
  UserMinus,
  FileText,
  PhoneCall,
} from 'lucide-react';
import { triggerQuickDial } from '../../utils/quickDial';
import { generateAgentDashboardPdf } from '../../utils/agentPdfExport';

export const AgentsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const toast = useToast();
  const {
    businesses,
    selectedBusinessId,
    selectedBusiness,
    isAllBusinesses,
    getBusinessForAgent,
    assignAgentToBusiness,
    updateBusiness,
  } = useBusiness();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<AgentDocument | null>(null);
  const [deletingAgentId, setDeletingAgentId] = useState<string | null>(null);
  const [unassigningAgent, setUnassigningAgent] = useState<{ agent: AgentDocument; business: Business } | null>(null);
  const [exportingAgentId, setExportingAgentId] = useState<string | null>(null);

  const handleDownloadPdf = async (agent: AgentDocument) => {
    try {
      setExportingAgentId(agent.agent_id);
      const dashboardData = await agentsApi.getAgentDashboard(agent.agent_id);
      const biz = getBusinessForAgent(agent.agent_id);
      generateAgentDashboardPdf(agent, dashboardData, biz?.name);
      toast.success('PDF Exported', `Downloaded dashboard report for ${agent.name}`);
    } catch (err: any) {
      toast.error('Export Failed', getErrorMessage(err));
    } finally {
      setExportingAgentId(null);
    }
  };

  const { data: agents = [], isLoading, refetch } = useQuery({
    queryKey: ['agents', selectedBusinessId],
    queryFn: () => agentsApi.getAgents(50),
  });

  const toggleMutation = useMutation({
    mutationFn: (agentId: string) => agentsApi.toggleAgent(agentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      toast.success('Agent status updated');
    },
    onError: (err) => {
      toast.error('Failed to toggle agent', getErrorMessage(err));
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: (agentId: string) => agentsApi.duplicateAgent(agentId),
    onSuccess: (newAgent) => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      if (selectedBusiness) {
        assignAgentToBusiness(selectedBusiness.id, newAgent.agent_id);
      }
      toast.success('Agent Duplicated', `Created copy: ${newAgent.name}`);
    },
    onError: (err) => {
      toast.error('Failed to duplicate agent', getErrorMessage(err));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (agentId: string) => agentsApi.deleteAgent(agentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      toast.success('Agent deleted');
      setDeletingAgentId(null);
    },
    onError: (err) => {
      toast.error('Failed to delete agent', getErrorMessage(err));
    },
  });

  const handleOpenCreate = () => {
    setEditingAgent(null);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (agent: AgentDocument) => {
    setEditingAgent(agent);
    setIsFormOpen(true);
  };

  const handleConfirmUnassign = () => {
    if (!unassigningAgent) return;
    const { agent, business } = unassigningAgent;
    updateBusiness(business.id, {
      assignedAgentIds: business.assignedAgentIds.filter((id) => id !== agent.agent_id),
    });
    toast.success('Agent Unassigned', `${agent.name} removed from ${business.name}.`);
    setUnassigningAgent(null);
  };

  const displayAgents = React.useMemo(() => {
    if (isAllBusinesses || !selectedBusiness) return agents;
    const assigned = selectedBusiness.assignedAgentIds || [];
    return agents.filter((a) => {
      const aid = a.agent_id || (a as any).id;
      return (
        assigned.includes(aid) ||
        (a as any).tenant_id === selectedBusiness.id ||
        (a as any).business_id === selectedBusiness.id
      );
    });
  }, [agents, selectedBusiness, isAllBusinesses]);

  return (
    <div className="space-y-6">
      <PageHeader
        category="AI Management"
        title="AI Voice Agents"
        subtitle={
          isAllBusinesses
            ? 'Manage conversational AI agents across all client businesses and domains.'
            : `Dedicated AI voice calling agents for ${selectedBusiness?.name}.`
        }
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => refetch()}
              leftIcon={<RefreshCw className="w-3.5 h-3.5 text-neutral-400" />}
            >
              Refresh
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleOpenCreate}
              leftIcon={<Plus className="w-4 h-4" />}
            >
              Create Agent
            </Button>
          </div>
        }
      />

      {/* Agents Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} height={200} />)
        ) : displayAgents.length === 0 ? (
          <div className="col-span-full">
            <EmptyState
              icon={<Bot className="w-8 h-8 text-orange-400" />}
              title={
                isAllBusinesses
                  ? 'No AI voice agents configured'
                  : `No AI agents assigned to ${selectedBusiness?.name}`
              }
              description="Create an autonomous voice agent with system prompts, language capability, and telephony concurrency."
              actionLabel="Create Agent"
              onAction={handleOpenCreate}
            />
          </div>
        ) : (
          displayAgents.map((agent) => {
            const biz = getBusinessForAgent(agent.agent_id);
            return (
              <div
                key={agent.agent_id}
                data-glow=""
                className="p-5 rounded-2xl bg-white/75 dark:bg-[var(--card-glass-bg)] backdrop-blur-[18px] border border-slate-200/80 dark:border-white/[0.09] shadow-sm dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_8px_32px_rgba(0,0,0,0.35)] flex flex-col justify-between glow-card hover:border-slate-300 dark:hover:border-white/[0.15] transition-all"
              >
                <div>
                  {/* Top: Name, Status, Switch */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-sm text-slate-900 dark:text-white truncate">
                          {agent.name}
                        </h3>
                      </div>

                      {/* Business Client Tag */}
                      <div className="flex items-center gap-1.5 mt-1 text-[11px] text-slate-500 dark:text-neutral-400">
                        <Building2 className="w-3 h-3 text-slate-400 dark:text-neutral-500 shrink-0" />
                        <span className="truncate">{biz ? biz.name : 'Unassigned Client'}</span>
                      </div>
                    </div>

                    <Switch
                      checked={agent.is_enabled}
                      onChange={() => toggleMutation.mutate(agent.agent_id)}
                    />
                  </div>

                  {/* Description */}
                  <p className="text-xs text-slate-600 dark:text-neutral-400 mt-3 line-clamp-2 leading-relaxed min-h-[32px]">
                    {agent.description || agent.system_prompt || 'Autonomous voice agent configuration.'}
                  </p>

                  {/* Meta details */}
                  <div className="grid grid-cols-2 gap-2 mt-3.5 pt-3 border-t border-slate-100 dark:border-white/[0.06] text-xs">
                    <div className="flex items-center gap-1.5 text-slate-500 dark:text-neutral-400">
                      <Languages className="w-3.5 h-3.5 text-slate-400 dark:text-neutral-500" />
                      <span>Language:</span>
                      <strong className="text-slate-800 dark:text-neutral-200 truncate">{agent.default_language}</strong>
                    </div>
                    <div className="flex items-center gap-1.5 text-slate-500 dark:text-neutral-400">
                      <Layers className="w-3.5 h-3.5 text-slate-400 dark:text-neutral-500" />
                      <span>Capacity:</span>
                      <strong className="text-slate-800 dark:text-neutral-200 tabular-nums">{agent.concurrency}x</strong>
                    </div>
                  </div>
                </div>

                {/* Footer Actions */}
                <div className="flex items-center justify-between pt-3.5 mt-3.5 border-t border-slate-100 dark:border-white/[0.06]">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleOpenEdit(agent)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors"
                      title="Edit agent settings"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => duplicateMutation.mutate(agent.agent_id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors"
                      title="Duplicate agent"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    {biz && (
                      <button
                        onClick={() => setUnassigningAgent({ agent, business: biz })}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-amber-500 hover:bg-amber-500/10 transition-colors"
                        title={`Unassign from ${biz.name}`}
                      >
                        <UserMinus className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => setDeletingAgentId(agent.agent_id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                      title="Permanently delete agent"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDownloadPdf(agent)}
                      disabled={exportingAgentId === agent.agent_id}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors"
                      title="Download Dashboard PDF Report"
                    >
                      <FileText className={`w-3.5 h-3.5 ${exportingAgentId === agent.agent_id ? 'animate-pulse text-orange-400' : ''}`} />
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="primary"
                      size="xs"
                      leftIcon={<PhoneCall className="w-3 h-3" />}
                      onClick={() => triggerQuickDial(agent.agent_id)}
                      title={`Trigger direct call using ${agent.name}`}
                    >
                      Call
                    </Button>
                    <NavLink to={`/agents/${agent.agent_id}`}>
                      <Button variant="secondary" size="xs" rightIcon={<ArrowRight className="w-3 h-3" />}>
                        Workspace
                      </Button>
                    </NavLink>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Create / Edit Drawer */}
      <AgentFormDrawer
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        agent={editingAgent}
        onSuccess={() => {
          refetch();
          queryClient.invalidateQueries({ queryKey: ['agents'] });
        }}
      />

      {/* Unassign Confirmation Modal */}
      <ConfirmDialog
        isOpen={!!unassigningAgent}
        onClose={() => setUnassigningAgent(null)}
        onConfirm={handleConfirmUnassign}
        title="Unassign Agent from Business"
        message={`Are you sure you want to remove "${unassigningAgent?.agent.name}" from "${unassigningAgent?.business.name}"? The agent will NOT be deleted and will remain in your agency catalog.`}
        confirmText="Unassign Agent"
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={!!deletingAgentId}
        onClose={() => setDeletingAgentId(null)}
        onConfirm={() => deletingAgentId && deleteMutation.mutate(deletingAgentId)}
        title="Permanently Delete Agent"
        message="Are you sure you want to permanently delete this agent? All associated settings and configurations will be removed."
        confirmText="Delete Agent"
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
};
