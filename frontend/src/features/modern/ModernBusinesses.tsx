import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { MapPin, PhoneCall, Target, TrendingUp, Bot, Plus, Edit2, ArrowUpRight, CheckCircle2, Building2 } from 'lucide-react';
import { businessesApi } from '../../services/api/businesses';
import { useBusiness, Business } from '../../app/providers/BusinessProvider';
import { BusinessFormModal } from '../businesses/BusinessFormModal';
import { useToast } from '../../app/providers/ToastProvider';
import { MCard, MPageHeader, Avatar, Pill, primaryPill, whitePill } from './ui';

export const ModernBusinesses: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { businesses: localBusinesses, selectBusiness, selectedBusiness } = useBusiness();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBusiness, setEditingBusiness] = useState<Business | null>(null);

  const { data: apiBusinesses = [], isLoading, refetch } = useQuery({
    queryKey: ['businesses'],
    queryFn: () => businessesApi.list({ limit: 100 }),
  });

  // Merge backend and local provider businesses to ensure no orphaned businesses
  const businesses = apiBusinesses.length > 0 ? apiBusinesses : localBusinesses.map(b => ({
    business_id: b.id,
    id: b.id,
    name: b.name,
    industry: b.industry,
    country: 'India',
    timezone: 'Asia/Kolkata',
    is_active: b.status !== 'inactive',
    assigned_agent_ids: b.assignedAgentIds || [],
    total_calls: (b as any).totalCalls ?? 0,
    total_leads: (b as any).totalLeads ?? 0,
    conversion_rate: (b as any).conversionRate ?? 0,
  }));

  const handleOpenCreate = () => {
    setEditingBusiness(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (b: any, e: React.MouseEvent) => {
    e.stopPropagation();
    const formBiz: Business = {
      id: b.business_id || b.id,
      name: b.name,
      industry: b.industry || 'Agri-Tech & Rural Enterprise',
      description: b.description || '',
      contactEmail: b.contact_email || b.contactEmail || '',
      contactPhone: b.contact_phone || b.contactPhone || '',
      status: b.is_active === false ? 'inactive' : 'active',
      assignedAgentIds: b.assigned_agent_ids || b.assignedAgentIds || [],
      createdAt: b.created_at || b.createdAt || new Date().toISOString(),
      updatedAt: b.updated_at || b.updatedAt || new Date().toISOString(),
    };
    setEditingBusiness(formBiz);
    setIsModalOpen(true);
  };

  const handleSelectWorkspace = (b: any, e: React.MouseEvent) => {
    e.stopPropagation();
    const id = b.business_id || b.id;
    selectBusiness(id);
    toast.success('Workspace Switched', `Active business set to ${b.name}`);
  };

  return (
    <div>
      <MPageHeader
        title="Businesses"
        subtitle="Manage client portfolios, agent assignments, and customer conversion rates."
        actions={
          <button
            type="button"
            className={primaryPill}
            onClick={handleOpenCreate}
          >
            <Plus className="w-4 h-4" /> New Business
          </button>
        }
      />

      {isLoading && (
        <MCard className="p-12 text-center text-sm text-[#667085]">
          Loading businesses…
        </MCard>
      )}

      {!isLoading && businesses.length === 0 && (
        <MCard className="p-12 text-center max-w-lg mx-auto">
          <div className="w-14 h-14 rounded-2xl bg-orange-50 border border-orange-100 text-orange-600 flex items-center justify-center mx-auto mb-4 shadow-sm">
            <Building2 className="w-7 h-7" />
          </div>
          <h3 className="text-lg font-bold text-[#101828]">No businesses created yet</h3>
          <p className="text-sm text-[#667085] mt-1.5 leading-relaxed">
            Create your first client business to assign AI voice telecallers, import contacts, and run campaigns.
          </p>
          <div className="mt-6">
            <button
              type="button"
              className={primaryPill}
              onClick={handleOpenCreate}
            >
              <Plus className="w-4 h-4" /> Create Your First Business
            </button>
          </div>
        </MCard>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {businesses.map((b: any, i: number) => {
          const bizId = b.business_id || b.id;
          const isSelected = selectedBusiness?.id === bizId;
          const agentCount = b.assigned_agent_ids?.length || b.assignedAgentIds?.length || 0;

          return (
            <div
              key={bizId}
              onClick={() => navigate(`/businesses/${bizId}`)}
              className="text-left anim-enter cursor-pointer group"
              style={{ animationDelay: `${Math.min(i * 60, 300)}ms` }}
            >
              <MCard className={`p-6 h-full flex flex-col justify-between transition-all duration-200 hover:shadow-[0_8px_30px_rgba(16,24,40,0.12)] hover:-translate-y-0.5 ${
                isSelected ? 'ring-2 ring-orange-500/80 border-orange-300' : ''
              }`}>
                <div>
                  <div className="flex items-start gap-3.5">
                    <Avatar name={b.name} className="w-12 h-12 text-base font-bold shadow-xs" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-[15px] font-bold text-[#101828] group-hover:text-orange-600 transition-colors truncate">
                          {b.name}
                        </p>
                        {isSelected && (
                          <span className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-orange-100 text-orange-700">
                            Active
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[#667085] flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3 text-[#667085]" /> {b.country || 'India'} · {b.timezone || 'Asia/Kolkata'}
                      </p>
                    </div>
                    <Pill tone={b.is_active ? 'emerald' : 'slate'}>
                      {b.is_active ? 'Active' : 'Inactive'}
                    </Pill>
                  </div>

                  <div className="flex flex-wrap gap-1.5 mt-4">
                    <Pill tone="amber">{b.industry || 'General Enterprise'}</Pill>
                    <Pill tone="slate">
                      <Bot className="w-3 h-3" /> {agentCount} {agentCount === 1 ? 'agent' : 'agents'}
                    </Pill>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-[#F1F2F4]">
                  <div className="grid grid-cols-3 gap-2 text-center pb-4">
                    <div>
                      <p className="text-[15px] font-bold text-[#101828] tabular-nums flex items-center justify-center gap-1">
                        <PhoneCall className="w-3.5 h-3.5 text-[#667085]" /> {b.total_calls ?? b.totalCalls ?? 0}
                      </p>
                      <p className="text-[11px] text-[#667085] font-medium mt-0.5">Calls</p>
                    </div>
                    <div>
                      <p className="text-[15px] font-bold text-[#101828] tabular-nums flex items-center justify-center gap-1">
                        <Target className="w-3.5 h-3.5 text-[#667085]" /> {b.total_leads ?? b.totalLeads ?? 0}
                      </p>
                      <p className="text-[11px] text-[#667085] font-medium mt-0.5">Leads</p>
                    </div>
                    <div>
                      <p className="text-[15px] font-bold text-emerald-600 tabular-nums flex items-center justify-center gap-1">
                        <TrendingUp className="w-3.5 h-3.5" /> {Math.round(b.conversion_rate ?? b.conversionRate ?? 0)}%
                      </p>
                      <p className="text-[11px] text-[#667085] font-medium mt-0.5">Conversion</p>
                    </div>
                  </div>

                  {/* Quick Card Actions */}
                  <div className="flex items-center justify-between pt-3 border-t border-[#F8F9FA] gap-2">
                    <button
                      type="button"
                      onClick={(e) => handleSelectWorkspace(b, e)}
                      title="Set as active workspace business"
                      className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                        isSelected
                          ? 'bg-orange-50 text-orange-700 font-bold border border-orange-200'
                          : 'bg-[#F2F4F7] text-[#344054] hover:bg-orange-50 hover:text-orange-600'
                      }`}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {isSelected ? 'Current Workspace' : 'Select'}
                    </button>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={(e) => handleOpenEdit(b, e)}
                        title="Edit business parameters and agent assignments"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-[#475467] hover:text-[#101828] px-2.5 py-1.5 rounded-lg hover:bg-[#F2F4F7] transition-colors"
                      >
                        <Edit2 className="w-3.5 h-3.5" /> Edit
                      </button>
                      <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-orange-600 group-hover:translate-x-0.5 transition-transform">
                        Open <ArrowUpRight className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  </div>
                </div>
              </MCard>
            </div>
          );
        })}
      </div>

      <BusinessFormModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingBusiness(null);
          refetch();
          queryClient.invalidateQueries({ queryKey: ['businesses'] });
        }}
        business={editingBusiness}
      />
    </div>
  );
};
