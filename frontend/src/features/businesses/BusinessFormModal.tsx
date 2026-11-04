import React, { useState, useEffect } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { useBusiness, Business } from '../../app/providers/BusinessProvider';
import { useQuery } from '@tanstack/react-query';
import { agentsApi } from '../../services/api/agents';
import { useToast } from '../../app/providers/ToastProvider';
import { Building2, Check, Bot, Plus, X } from 'lucide-react';

interface BusinessFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  business?: Business | null;
}

interface IndustryOption {
  value: string;
  label: string;
}

const DEFAULT_INDUSTRIES: IndustryOption[] = [
  { value: 'Agri-Tech & Rural Enterprise', label: 'Agri-Tech & Farming' },
  { value: 'Hospitals & Medical Clinics', label: 'Healthcare & Clinics' },
  { value: 'Real Estate & Properties', label: 'Real Estate & Housing' },
  { value: 'Banking & SME Lending', label: 'Banking & Financial Services' },
  { value: 'Education & EdTech', label: 'Education & Admissions' },
  { value: 'Automotive & Dealerships', label: 'Automotive & Sales' },
  { value: 'Retail & E-Commerce', label: 'Retail & E-Commerce' },
  { value: 'Other Enterprise', label: 'Other Enterprise' },
];

const STORAGE_KEY_CUSTOM_DOMAINS = 'voxora_custom_industry_domains';

export const BusinessFormModal: React.FC<BusinessFormModalProps> = ({
  isOpen,
  onClose,
  business,
}) => {
  const { addBusiness, updateBusiness, businesses } = useBusiness();
  const toast = useToast();

  const [name, setName] = useState('');
  const [industry, setIndustry] = useState('Agri-Tech & Rural Enterprise');
  const [description, setDescription] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive' | 'onboarding'>('active');
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);

  // Custom Industry Domains Management
  const [customDomains, setCustomDomains] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_CUSTOM_DOMAINS);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [isCreatingDomain, setIsCreatingDomain] = useState(false);
  const [newDomainInput, setNewDomainInput] = useState('');

  // Combined list of default + custom industry domains
  const allIndustryOptions = React.useMemo(() => {
    const list: IndustryOption[] = [...DEFAULT_INDUSTRIES];

    // Include custom domains saved in localStorage
    for (const cd of customDomains) {
      if (!list.some((item) => item.value === cd || item.label === cd)) {
        list.push({ value: cd, label: cd });
      }
    }

    // Include the editing business's industry if not present
    if (business?.industry && !list.some((item) => item.value === business.industry || item.label === business.industry)) {
      list.push({ value: business.industry, label: business.industry });
    }

    // Include any custom industries present across existing businesses
    for (const b of businesses) {
      if (b.industry && !list.some((item) => item.value === b.industry || item.label === b.industry)) {
        list.push({ value: b.industry, label: b.industry });
      }
    }

    return list;
  }, [customDomains, business, businesses]);

  const handleAddNewDomain = () => {
    const trimmed = newDomainInput.trim();
    if (!trimmed) {
      toast.error('Domain name required', 'Please enter a valid industry domain name.');
      return;
    }

    // Check if already in list
    const alreadyExists = allIndustryOptions.some(
      (opt) => opt.label.toLowerCase() === trimmed.toLowerCase() || opt.value.toLowerCase() === trimmed.toLowerCase()
    );

    if (alreadyExists) {
      const matched = allIndustryOptions.find(
        (opt) => opt.label.toLowerCase() === trimmed.toLowerCase() || opt.value.toLowerCase() === trimmed.toLowerCase()
      );
      setIndustry(matched ? matched.value : trimmed);
      setIsCreatingDomain(false);
      setNewDomainInput('');
      toast.info('Domain Selected', `"${trimmed}" is already available and selected.`);
      return;
    }

    const updated = [...customDomains, trimmed];
    setCustomDomains(updated);
    try {
      localStorage.setItem(STORAGE_KEY_CUSTOM_DOMAINS, JSON.stringify(updated));
    } catch (e) {
      console.warn('Could not persist custom domains:', e);
    }

    setIndustry(trimmed);
    setIsCreatingDomain(false);
    setNewDomainInput('');
    toast.success('Industry Domain Added', `"${trimmed}" created and selected for this business.`);
  };

  const { data: agents = [] } = useQuery({
    queryKey: ['agents'],
    queryFn: () => agentsApi.getAgents(50),
    enabled: isOpen,
  });

  useEffect(() => {
    if (business) {
      setName(business.name);
      setIndustry(business.industry);
      setDescription(business.description || '');
      setContactEmail(business.contactEmail || '');
      setContactPhone(business.contactPhone || '');
      setStatus(business.status);
      setSelectedAgentIds(business.assignedAgentIds || []);
    } else {
      setName('');
      setIndustry('Agri-Tech & Rural Enterprise');
      setDescription('');
      setContactEmail('');
      setContactPhone('');
      setStatus('active');
      setSelectedAgentIds([]);
    }
  }, [business, isOpen]);

  const handleToggleAgent = (agentId: string) => {
    setSelectedAgentIds((prev) =>
      prev.includes(agentId) ? prev.filter((id) => id !== agentId) : [...prev, agentId]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Business name is required');
      return;
    }

    if (business) {
      updateBusiness(business.id, {
        name: name.trim(),
        industry,
        description: description.trim() || undefined,
        contactEmail: contactEmail.trim() || undefined,
        contactPhone: contactPhone.trim() || undefined,
        status,
        assignedAgentIds: selectedAgentIds,
      });
      toast.success('Business Updated', `${name} details saved.`);
    } else {
      addBusiness({
        name: name.trim(),
        industry,
        description: description.trim() || undefined,
        contactEmail: contactEmail.trim() || undefined,
        contactPhone: contactPhone.trim() || undefined,
        status,
        assignedAgentIds: selectedAgentIds,
      });
      toast.success('Business Added', `${name} created in agency workspace.`);
    }

    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={business ? `Edit Business: ${business.name}` : 'Add New Client Business'}
      description="Configure client profile and assign dedicated AI voice telecalling agents."
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Business / Client Name"
            placeholder="e.g. Acme Corporation"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
          />

          <div className="flex flex-col justify-end">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                Industry Domain
              </label>
              {!isCreatingDomain && (
                <button
                  type="button"
                  onClick={() => setIsCreatingDomain(true)}
                  className="text-[11px] text-orange-400 hover:text-orange-300 font-semibold inline-flex items-center gap-1 transition-colors px-2 py-0.5 rounded-lg hover:bg-orange-500/10"
                  title="Create custom industry domain"
                >
                  <Plus className="w-3 h-3" />
                  New Domain
                </button>
              )}
            </div>

            {isCreatingDomain ? (
              <div className="space-y-2 p-3 rounded-xl border border-orange-500/30 bg-orange-500/10">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-orange-400 flex items-center gap-1.5">
                    Create New Industry Domain
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setIsCreatingDomain(false);
                      setNewDomainInput('');
                    }}
                    className="text-slate-400 hover:text-white p-0.5"
                    title="Cancel"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    className="flex-1 min-w-0 px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-white/[0.08] bg-white dark:bg-white/[0.04] text-slate-900 dark:text-white placeholder:text-neutral-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500/20"
                    placeholder="e.g. Logistics & Supply Chain..."
                    value={newDomainInput}
                    onChange={(e) => setNewDomainInput(e.target.value)}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddNewDomain();
                      } else if (e.key === 'Escape') {
                        setIsCreatingDomain(false);
                        setNewDomainInput('');
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={handleAddNewDomain}
                    className="shrink-0 text-xs px-3"
                  >
                    Add
                  </Button>
                </div>
              </div>
            ) : (
              <Select
                value={industry}
                onChange={(e) => {
                  if (e.target.value === '__CREATE_NEW__') {
                    setIsCreatingDomain(true);
                  } else {
                    setIndustry(e.target.value);
                  }
                }}
              >
                {allIndustryOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
                <option value="__CREATE_NEW__" className="text-orange-400 font-semibold">
                  + Add New Custom Domain...
                </option>
              </Select>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Client Contact Email"
            type="email"
            placeholder="client@company.com"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
          />

          <Input
            label="Client Phone / Telephony ID"
            placeholder="+91 98765 43210"
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
            Business Overview & Operational Scope
          </label>
          <textarea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief notes about the client's calling campaigns, target demographic, or requirements..."
            className="w-full p-2.5 text-xs rounded-xl bg-white/70 dark:bg-white/[0.04] border border-slate-300/80 dark:border-white/[0.08] text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-orange-500/40"
          />
        </div>

        {/* Assigned Voice Agents */}
        <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-white/[0.06]">
          <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300 flex items-center justify-between">
            <span>Assign AI Voice Agents</span>
            <span className="text-[11px] font-normal text-slate-500">
              {selectedAgentIds.length} assigned
            </span>
          </label>

          {agents.length === 0 ? (
            <p className="text-xs text-slate-400">
              No AI agents created yet. You can create agents and assign them later.
            </p>
          ) : (
            <div className="max-h-40 overflow-y-auto space-y-1.5 p-1 border border-slate-200 dark:border-white/[0.08] rounded-xl bg-slate-50/50 dark:bg-white/[0.03]">
              {agents.map((agent) => {
                const isAssigned = selectedAgentIds.includes(agent.agent_id);
                return (
                  <div
                    key={agent.agent_id}
                    onClick={() => handleToggleAgent(agent.agent_id)}
                    className={`p-2 rounded-lg flex items-center justify-between text-xs cursor-pointer transition-colors ${
                      isAssigned
                        ? 'bg-white dark:bg-white/[0.08] border border-slate-300 dark:border-white/[0.12] text-slate-900 dark:text-white font-medium'
                        : 'hover:bg-slate-100 dark:hover:bg-zinc-800/50 text-slate-600 dark:text-zinc-400'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Bot className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{agent.name}</span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        ({agent.default_language})
                      </span>
                    </div>
                    {isAssigned && <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <Select
          label="Account Operational Status"
          value={status}
          onChange={(e) => setStatus(e.target.value as any)}
        >
          <option value="active">Active (Handling Calls)</option>
          <option value="onboarding">Onboarding / Scripting</option>
          <option value="inactive">Inactive / Paused</option>
        </Select>

        <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100 dark:border-zinc-800">
          <Button variant="ghost" size="sm" onClick={onClose} type="button">
            Cancel
          </Button>
          <Button variant="primary" size="sm" type="submit">
            {business ? 'Save Changes' : 'Create Business'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
