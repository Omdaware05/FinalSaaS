import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '../../components/layout/PageHeader';
import { DataTable, Column } from '../../components/ui/DataTable';
import { InterestBadge, Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { MetricCard } from '../../components/ui/MetricCard';
import { CallDetailDrawer } from '../calls/CallDetailDrawer';
import { CsvImportModal } from './CsvImportModal';
import { contactsApi } from '../../services/api/contacts';
import { agentsApi } from '../../services/api/agents';
import { useToast } from '../../app/providers/ToastProvider';
import { useBusiness } from '../../app/providers/BusinessProvider';
import { getErrorMessage } from '../../services/api/client';
import { ContactDocument } from '../../types/api';
import {
  Users,
  Plus,
  UploadCloud,
  RefreshCw,
  PhoneCall,
  Phone,
  Eye,
  CheckCircle,
  ThumbsDown,
  Clock,
  Download,
  Filter,
  Edit2,
  CheckSquare,
  Square,
  ShieldAlert,
  Send,
  X,
} from 'lucide-react';
import { format } from 'date-fns';
import { formatDateTime } from '../../utils/dateUtils';
import { exportToExcel } from '../../utils/excelExport';

type StatusFilter = 'all' | 'interested' | 'not_interested' | 'unanalyzed';

export const ContactsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { selectedBusiness, selectedBusinessId, isAllBusinesses } = useBusiness();

  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);

  // Filter state
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBatchDialModalOpen, setIsBatchDialModalOpen] = useState(false);
  const [batchAgentId, setBatchAgentId] = useState<string>('');
  const [isBatchDialing, setIsBatchDialing] = useState(false);

  // Quick Dial Modal (Single)
  const [dialContact, setDialContact] = useState<ContactDocument | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');
  const [isDialing, setIsDialing] = useState(false);

  // Edit Contact Modal
  const [editingContact, setEditingContact] = useState<ContactDocument | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  // New Contact form
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const { data: contacts = [], isLoading, refetch } = useQuery({
    queryKey: ['contacts', selectedBusinessId],
    queryFn: () => contactsApi.getContacts({ limit: 500 }),
    refetchInterval: 6000,
  });

  const { data: agents = [] } = useQuery({
    queryKey: ['agents'],
    queryFn: () => agentsApi.getAgents(),
  });

  // Default agent selector
  const defaultAgentId = useMemo(() => {
    if (selectedAgentId) return selectedAgentId;
    if (agents.length > 0) return agents[0].agent_id;
    return 'agent-admission-advisor';
  }, [agents, selectedAgentId]);

  // Scope contacts to selected business
  const scopedContacts = useMemo(() => {
    if (isAllBusinesses || !selectedBusiness) return contacts;
    const assignedSet = new Set(selectedBusiness.assignedAgentIds || []);
    return contacts.filter((c) => {
      if (c.tenant_id && c.tenant_id === selectedBusiness.id) return true;
      if (c.agent_id && assignedSet.has(c.agent_id)) return true;
      return false;
    });
  }, [contacts, selectedBusiness, isAllBusinesses]);

  // Summary Metrics
  const totalContacts = scopedContacts.length;
  const contactedCount = scopedContacts.filter((c) => (c.interaction_count || 0) > 0).length;
  const interestedCount = scopedContacts.filter(
    (c) =>
      c.last_interest_status &&
      ['interested', 'callback_requested', 'qualified', 'hot'].includes(c.last_interest_status.toLowerCase())
  ).length;
  const notInterestedCount = scopedContacts.filter(
    (c) =>
      c.last_interest_status &&
      ['not_interested', 'rejected', 'opt_out', 'disqualified'].includes(c.last_interest_status.toLowerCase())
  ).length;
  const unanalyzedCount = scopedContacts.filter(
    (c) => !c.last_interest_status || ['unanalyzed', 'unknown', 'pending'].includes(c.last_interest_status.toLowerCase())
  ).length;

  // Filtered contacts list
  const filteredContacts = useMemo(() => {
    if (statusFilter === 'all') return scopedContacts;
    return scopedContacts.filter((c) => {
      const s = (c.last_interest_status || 'unanalyzed').toLowerCase();
      if (statusFilter === 'interested') {
        return ['interested', 'callback_requested', 'qualified', 'hot'].includes(s);
      }
      if (statusFilter === 'not_interested') {
        return ['not_interested', 'rejected', 'opt_out', 'disqualified'].includes(s);
      }
      if (statusFilter === 'unanalyzed') {
        return !c.last_interest_status || ['unanalyzed', 'unknown', 'pending'].includes(s);
      }
      return true;
    });
  }, [scopedContacts, statusFilter]);

  // Selection handlers
  const handleToggleSelect = (contactId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(contactId)) {
        next.delete(contactId);
      } else {
        next.add(contactId);
      }
      return next;
    });
  };

  const handleSelectAllVisible = () => {
    if (selectedIds.size === filteredContacts.length && filteredContacts.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredContacts.map((c) => c.contact_id)));
    }
  };

  // Export to Excel
  const handleExportExcel = (subset?: ContactDocument[]) => {
    const listToExport = subset || filteredContacts;
    if (listToExport.length === 0) {
      toast.warning('No Data to Export', 'There are no contacts matching the current selection.');
      return;
    }

    const rows = listToExport.map((c) => ({
      'Contact Name': c.name || 'Prospect',
      'Phone Number': c.phone_number,
      'Email': c.email || 'N/A',
      'Total Calls Made': c.interaction_count || 0,
      'Last Interest Stage': (c.last_interest_status || 'Unanalyzed').toUpperCase(),
      'Last Called Time': c.last_call_at ? formatDateTime(c.last_call_at, 'yyyy-MM-dd HH:mm:ss') : 'Never Called',
      'Compliance Status': (c.custom_fields as any)?.status || c.status || 'Active',
      'Registered Date': formatDateTime(c.created_at, 'yyyy-MM-dd HH:mm:ss'),
    }));

    const filename = `voxora_contacts_${statusFilter}_${format(new Date(), 'yyyyMMdd_HHmm')}`;
    exportToExcel(rows, filename, 'Contacts Directory');
    toast.success('Export Complete', `Exported ${rows.length} contact records to Excel.`);
  };

  // Add Contact
  const handleAddContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim()) {
      toast.error('Phone number is required');
      return;
    }

    setIsCreating(true);
    try {
      await contactsApi.createOrUpdateContact({
        phone_number: phone.trim(),
        name: name.trim() || undefined,
        email: email.trim() || undefined,
        tenant_id: selectedBusiness?.id || 'tenant-arb-default',
      });
      toast.success('Contact Saved', `${phone} added to CRM.`);
      setIsAddModalOpen(false);
      setPhone('');
      setName('');
      setEmail('');
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
    } catch (err: any) {
      toast.error('Failed to add contact', getErrorMessage(err));
    } finally {
      setIsCreating(false);
    }
  };

  // Open Edit Modal
  const handleOpenEdit = (c: ContactDocument, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingContact(c);
    setEditName(c.name || '');
    setEditEmail(c.email || '');
    setEditPhone(c.phone_number);
  };

  // Save Edit Contact
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingContact) return;

    setIsUpdating(true);
    try {
      await contactsApi.createOrUpdateContact({
        phone_number: editingContact.phone_number,
        name: editName.trim() || undefined,
        email: editEmail.trim() || undefined,
      });
      toast.success('Contact Updated', `Details for ${editingContact.phone_number} have been updated.`);
      setEditingContact(null);
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
    } catch (err: any) {
      toast.error('Update Failed', getErrorMessage(err));
    } finally {
      setIsUpdating(false);
    }
  };

  // Single Call
  const handleTriggerCall = async () => {
    if (!dialContact) return;
    const targetAgent = selectedAgentId || defaultAgentId;
    if (!targetAgent) {
      toast.error('No Voice Agent available', 'Please configure an agent first.');
      return;
    }

    setIsDialing(true);
    try {
      await agentsApi.startCalls(targetAgent, {
        phone_numbers: [dialContact.phone_number],
      });
      toast.success('Call Dispatched', `Calling ${dialContact.phone_number} with AI Agent.`);
      setDialContact(null);
      setTimeout(() => {
        refetch();
        queryClient.invalidateQueries({ queryKey: ['calls'] });
      }, 1500);
    } catch (err: any) {
      toast.error('Call Dispatch Failed', getErrorMessage(err));
    } finally {
      setIsDialing(false);
    }
  };

  // Batch Calling
  const handleStartBatchCall = async () => {
    const selectedContacts = contacts.filter((c) => selectedIds.has(c.contact_id));
    const targetNumbers = selectedContacts.map((c) => c.phone_number);
    if (targetNumbers.length === 0) return;

    const targetAgent = batchAgentId || defaultAgentId;
    if (!targetAgent) {
      toast.error('No Voice Agent Selected', 'Please select an agent to run the batch calls.');
      return;
    }

    setIsBatchDialing(true);
    try {
      await agentsApi.startCalls(targetAgent, {
        phone_numbers: targetNumbers,
      });
      toast.success(
        'Batch Calls Dispatched',
        `Successfully launched AI calling queue for ${targetNumbers.length} contacts.`
      );
      setIsBatchDialModalOpen(false);
      setSelectedIds(new Set());
      setTimeout(() => {
        refetch();
        queryClient.invalidateQueries({ queryKey: ['calls'] });
      }, 1500);
    } catch (err: any) {
      toast.error('Batch Dispatch Failed', getErrorMessage(err));
    } finally {
      setIsBatchDialing(false);
    }
  };

  const columns: Column<ContactDocument>[] = [
    {
      key: 'select',
      header: '',
      width: '44px',
      render: (c) => {
        const isSelected = selectedIds.has(c.contact_id);
        return (
          <button
            type="button"
            onClick={(e) => handleToggleSelect(c.contact_id, e)}
            className="p-1 rounded hover:bg-slate-200 dark:hover:bg-white/10 text-slate-400 transition-colors"
            title={isSelected ? 'Deselect contact' : 'Select contact'}
          >
            {isSelected ? (
              <CheckSquare className="w-4 h-4 text-orange-500" />
            ) : (
              <Square className="w-4 h-4 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200" />
            )}
          </button>
        );
      },
    },
    {
      key: 'phone_number',
      header: 'Contact Details',
      sortable: true,
      render: (c) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20 flex items-center justify-center shrink-0 font-bold text-xs shadow-sm">
            {c.name ? c.name.charAt(0).toUpperCase() : <Phone className="w-3.5 h-3.5" />}
          </div>
          <div className="flex flex-col">
            <span className="font-semibold text-xs text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
              {c.name || 'Prospect'}
            </span>
            <span className="text-[11px] text-slate-500 dark:text-zinc-400 font-mono tracking-wide">
              {c.phone_number}
            </span>
          </div>
        </div>
      ),
    },
    {
      key: 'email',
      header: 'Email Address',
      render: (c) => (
        <span className="text-xs text-slate-500 dark:text-zinc-400">
          {c.email || <span className="text-slate-400 italic">Not provided</span>}
        </span>
      ),
    },
    {
      key: 'interaction_count',
      header: 'Total Calls',
      sortable: true,
      align: 'center',
      render: (c) => {
        const count = c.interaction_count || 0;
        return (
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-mono font-semibold ${
              count > 0
                ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20'
                : 'bg-slate-100 dark:bg-white/[0.04] text-slate-400'
            }`}
          >
            {count} {count === 1 ? 'call' : 'calls'}
          </span>
        );
      },
    },
    {
      key: 'last_call_at',
      header: 'Last Called',
      sortable: true,
      render: (c) => {
        if (!c.last_call_at) {
          return (
            <span className="text-[11px] text-slate-400 italic flex items-center gap-1">
              <Clock className="w-3 h-3 text-slate-300 dark:text-zinc-600" /> Never
            </span>
          );
        }
        return (
          <div className="flex flex-col text-xs font-mono text-slate-600 dark:text-zinc-300">
            <span>{formatDateTime(c.last_call_at, 'MMM dd, yyyy')}</span>
            <span className="text-[10px] text-slate-400">{formatDateTime(c.last_call_at, 'hh:mm a')}</span>
          </div>
        );
      },
    },
    {
      key: 'last_interest_status',
      header: 'Last Interest',
      render: (c) => <InterestBadge status={c.last_interest_status} size="xs" />,
    },
    {
      key: 'created_at',
      header: 'Registered',
      sortable: true,
      render: (c) => (
        <span className="text-xs text-slate-500 dark:text-zinc-400 font-mono">
          {formatDateTime(c.created_at, 'MMM dd, yyyy')}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (c) => (
        <div className="flex items-center justify-end gap-1.5">
          <Button
            variant="outline"
            size="xs"
            onClick={() => {
              setDialContact(c);
              setSelectedAgentId(defaultAgentId);
            }}
            leftIcon={<PhoneCall className="w-3 h-3 text-orange-500" />}
            className="hover:border-orange-500/40 hover:text-orange-500"
            title="Dial contact with AI voice agent"
          >
            Call
          </Button>

          <Button
            variant="ghost"
            size="xs"
            onClick={(e) => handleOpenEdit(c, e)}
            leftIcon={<Edit2 className="w-3 h-3 text-slate-400" />}
            className="hover:bg-slate-100 dark:hover:bg-white/[0.06]"
            title="Edit contact name or email"
          >
            Edit
          </Button>

          {c.last_call_id && (
            <Button
              variant="ghost"
              size="xs"
              onClick={() => setSelectedCallId(c.last_call_id!)}
              leftIcon={<Eye className="w-3 h-3 text-slate-400" />}
              className="hover:bg-slate-100 dark:hover:bg-white/[0.06]"
              title="Inspect latest call audio and transcript"
            >
              Telemetry
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        category={isAllBusinesses ? 'CRM & Database' : `Contacts: ${selectedBusiness?.name}`}
        title="Contact Intelligence & Directory"
        subtitle={
          isAllBusinesses
            ? 'Manage customer profiles, interaction memory, call triggers, and CSV synchronization.'
            : `Client contact records for ${selectedBusiness?.name}.`
        }
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              leftIcon={<RefreshCw className="w-3.5 h-3.5 text-slate-400" />}
            >
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExportExcel()}
              leftIcon={<Download className="w-3.5 h-3.5 text-slate-400" />}
            >
              Export Excel
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsCsvModalOpen(true)}
              leftIcon={<UploadCloud className="w-4 h-4 text-slate-400" />}
            >
              Import CSV
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setIsAddModalOpen(true)}
              leftIcon={<Plus className="w-4 h-4" />}
            >
              Add Contact
            </Button>
          </div>
        }
      />

      {/* KPI Summary Cards - Clickable to Filter */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div onClick={() => setStatusFilter('all')} className="cursor-pointer">
          <MetricCard
            label="Total Contacts"
            value={totalContacts}
            subtext="Registered directory profiles"
            icon={<Users className="w-5 h-5 text-orange-500" />}
            glow={statusFilter === 'all'}
            isLoading={isLoading}
          />
        </div>
        <div onClick={() => setStatusFilter('all')} className="cursor-pointer">
          <MetricCard
            label="Engaged / Called"
            value={contactedCount}
            subtext={`${totalContacts > 0 ? Math.round((contactedCount / totalContacts) * 100) : 0}% outreach coverage`}
            icon={<Phone className="w-5 h-5 text-blue-500" />}
            isLoading={isLoading}
          />
        </div>
        <div onClick={() => setStatusFilter('interested')} className="cursor-pointer">
          <MetricCard
            label="Interested Prospects"
            value={interestedCount}
            subtext="Confirmed lead intent"
            icon={<CheckCircle className="w-5 h-5 text-emerald-500" />}
            glow={statusFilter === 'interested'}
            isLoading={isLoading}
          />
        </div>
        <div onClick={() => setStatusFilter('not_interested')} className="cursor-pointer">
          <MetricCard
            label="Not Interested"
            value={notInterestedCount}
            subtext="Declined or opt-out list"
            icon={<ThumbsDown className="w-5 h-5 text-rose-500" />}
            glow={statusFilter === 'not_interested'}
            isLoading={isLoading}
          />
        </div>
      </div>

      {/* Interactive Status Filter Tabs */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 p-1.5 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-white/[0.08] shadow-[0_1px_3px_rgba(16,24,40,0.04)] overflow-x-auto">
          <div className="flex items-center gap-1.5 px-2 text-xs font-semibold text-slate-400">
            <Filter className="w-3.5 h-3.5" />
            <span>Filter:</span>
          </div>

          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              statusFilter === 'all'
                ? 'bg-orange-500 text-white shadow-xs'
                : 'text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-white/[0.06]'
            }`}
          >
            <span>All Contacts</span>
            <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${statusFilter === 'all' ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-white/[0.08]'}`}>
              {totalContacts}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('interested')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              statusFilter === 'interested'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-white/[0.06]'
            }`}
          >
            <span>Interested</span>
            <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${statusFilter === 'interested' ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-white/[0.08]'}`}>
              {interestedCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('not_interested')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              statusFilter === 'not_interested'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-white/[0.06]'
            }`}
          >
            <span>Not Interested</span>
            <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${statusFilter === 'not_interested' ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-white/[0.08]'}`}>
              {notInterestedCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('unanalyzed')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              statusFilter === 'unanalyzed'
                ? 'bg-slate-800 text-white shadow-xs'
                : 'text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-white/[0.06]'
            }`}
          >
            <span>Unanalyzed / New</span>
            <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${statusFilter === 'unanalyzed' ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-white/[0.08]'}`}>
              {unanalyzedCount}
            </span>
          </button>
        </div>

        {/* Quick select all toggle */}
        <button
          type="button"
          onClick={handleSelectAllVisible}
          className="text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
        >
          {selectedIds.size === filteredContacts.length && filteredContacts.length > 0 ? (
            <>
              <CheckSquare className="w-3.5 h-3.5 text-orange-500" />
              <span>Deselect All ({filteredContacts.length})</span>
            </>
          ) : (
            <>
              <Square className="w-3.5 h-3.5" />
              <span>Select All Visible ({filteredContacts.length})</span>
            </>
          )}
        </button>
      </div>

      {/* Floating / Sticky Batch Actions Bar */}
      {selectedIds.size > 0 && (
        <div className="p-3 rounded-2xl bg-[#101828] text-white flex flex-wrap items-center justify-between gap-3 shadow-xl animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="flex items-center gap-2.5 pl-2">
            <span className="w-6 h-6 rounded-full bg-orange-500 text-white text-xs font-bold flex items-center justify-center">
              {selectedIds.size}
            </span>
            <span className="text-xs font-semibold">Contacts Selected</span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="xs"
              onClick={() => {
                const subset = contacts.filter((c) => selectedIds.has(c.contact_id));
                handleExportExcel(subset);
              }}
              leftIcon={<Download className="w-3 h-3 text-slate-300" />}
              className="text-white border-white/20 hover:bg-white/10"
            >
              Export Selected ({selectedIds.size})
            </Button>

            <Button
              variant="primary"
              size="xs"
              onClick={() => {
                setBatchAgentId(defaultAgentId);
                setIsBatchDialModalOpen(true);
              }}
              leftIcon={<Send className="w-3 h-3" />}
              className="bg-orange-500 hover:bg-orange-600 text-white font-semibold"
            >
              Launch AI Batch Calling ({selectedIds.size})
            </Button>

            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
              title="Clear selection"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Main Table */}
      <div className="rounded-2xl border border-slate-200/80 dark:border-white/[0.06] bg-white/50 dark:bg-zinc-900/50 backdrop-blur-sm overflow-hidden shadow-sm">
        <DataTable
          columns={columns}
          data={filteredContacts}
          isLoading={isLoading}
          keyExtractor={(c) => c.contact_id}
          searchPlaceholder="Filter contacts by phone, name, email or status..."
          searchableKey={(c) => `${c.phone_number} ${c.name || ''} ${c.email || ''} ${c.last_interest_status || ''}`}
          emptyTitle="No contacts found"
          emptyDescription={
            statusFilter !== 'all'
              ? `No contacts match the '${statusFilter}' status filter. Switch to 'All Contacts' to view your full directory.`
              : 'Add contacts manually or import from a CSV spreadsheet.'
          }
          pageSize={12}
        />
      </div>

      <CsvImportModal
        isOpen={isCsvModalOpen}
        onClose={() => setIsCsvModalOpen(false)}
        onSuccess={() => refetch()}
      />

      {/* Manual Add Contact Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Add Single Contact"
        description="Register a phone number and customer profile into CRM database."
        size="md"
      >
        <form onSubmit={handleAddContact} className="space-y-4">
          <Input
            label="Phone Number"
            placeholder="+919876543210"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
            helperText="Include country code (e.g. +91)"
          />
          <Input
            label="Contact Full Name"
            placeholder="e.g. Ramesh Kumar"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            label="Email Address"
            type="email"
            placeholder="ramesh@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100 dark:border-zinc-800">
            <Button variant="ghost" size="sm" onClick={() => setIsAddModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" isLoading={isCreating}>
              Save Contact
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Contact Modal */}
      <Modal
        isOpen={!!editingContact}
        onClose={() => setEditingContact(null)}
        title="Edit Contact Profile"
        description="Update customer name, email address, or contact details."
        size="md"
      >
        <form onSubmit={handleSaveEdit} className="space-y-4">
          <Input
            label="Phone Number"
            value={editPhone}
            disabled
            helperText="Phone number is unique and cannot be modified."
          />
          <Input
            label="Contact Full Name"
            placeholder="e.g. Ramesh Kumar"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
          />
          <Input
            label="Email Address"
            type="email"
            placeholder="ramesh@example.com"
            value={editEmail}
            onChange={(e) => setEditEmail(e.target.value)}
          />

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100 dark:border-zinc-800">
            <Button variant="ghost" size="sm" onClick={() => setEditingContact(null)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" isLoading={isUpdating}>
              Save Changes
            </Button>
          </div>
        </form>
      </Modal>

      {/* Quick Outbound Dial Confirmation Modal (Single) */}
      <Modal
        isOpen={!!dialContact}
        onClose={() => setDialContact(null)}
        title={dialContact ? `Call ${dialContact.phone_number}` : 'Initiate Call'}
        description="Select the AI Voice Agent to dial this contact immediately."
        size="md"
      >
        <div className="space-y-4 py-2">
          <div className="p-3 rounded-xl bg-slate-100 dark:bg-white/[0.04] border border-slate-200/80 dark:border-white/[0.08] flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Phone className="w-4 h-4 text-orange-500" />
              <span className="font-semibold text-xs text-slate-900 dark:text-white font-mono">
                {dialContact?.phone_number}
              </span>
            </div>
            {dialContact?.name && (
              <span className="text-xs text-slate-500 font-medium">{dialContact.name}</span>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
              Select Calling Agent
            </label>
            <Select
              value={selectedAgentId || defaultAgentId}
              onChange={(e) => setSelectedAgentId(e.target.value)}
            >
              {agents.map((ag) => (
                <option key={ag.agent_id} value={ag.agent_id}>
                  {ag.name} ({ag.language_mode || 'Hindi/English'})
                </option>
              ))}
            </Select>
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100 dark:border-white/[0.06]">
            <Button variant="ghost" size="sm" onClick={() => setDialContact(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleTriggerCall}
              isLoading={isDialing}
              leftIcon={<PhoneCall className="w-4 h-4" />}
            >
              Start Call Now
            </Button>
          </div>
        </div>
      </Modal>

      {/* Batch Outbound Calling Modal */}
      <Modal
        isOpen={isBatchDialModalOpen}
        onClose={() => setIsBatchDialModalOpen(false)}
        title={`Launch Batch Calling (${selectedIds.size} Contacts)`}
        description="The selected AI Voice Agent will autonomously dial every selected contact in sequence."
        size="md"
      >
        <div className="space-y-4 py-2">
          <div className="p-3.5 rounded-xl bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800/40 text-xs text-orange-800 dark:text-orange-300 space-y-1">
            <p className="font-bold">Queue Dispatch Confirmation</p>
            <p>
              You are about to dispatch automated voice calls to <strong>{selectedIds.size} contacts</strong>. Each call will use real-time STT, LLM conversation, and TTS voice generation.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
              Choose Assigned AI Voice Agent
            </label>
            <Select
              value={batchAgentId || defaultAgentId}
              onChange={(e) => setBatchAgentId(e.target.value)}
            >
              {agents.map((ag) => (
                <option key={ag.agent_id} value={ag.agent_id}>
                  {ag.name} ({ag.language_mode || 'Hindi/English'})
                </option>
              ))}
            </Select>
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100 dark:border-white/[0.06]">
            <Button variant="ghost" size="sm" onClick={() => setIsBatchDialModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleStartBatchCall}
              isLoading={isBatchDialing}
              leftIcon={<PhoneCall className="w-4 h-4" />}
              className="bg-orange-500 hover:bg-orange-600 text-white font-semibold"
            >
              Dispatch {selectedIds.size} Calls
            </Button>
          </div>
        </div>
      </Modal>

      {/* Call Telemetry Drawer */}
      <CallDetailDrawer callId={selectedCallId} onClose={() => setSelectedCallId(null)} />
    </div>
  );
};
