import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Search,
  Users,
  PhoneCall,
  Heart,
  UserPlus,
  UploadCloud,
  Plus,
  Eye,
  Download,
  Filter,
  CheckSquare,
  Square,
  Edit2,
  Clock,
  Send,
  X,
  ThumbsDown,
} from 'lucide-react';
import { contactsApi } from '../../services/api/contacts';
import { callsApi } from '../../services/api/calls';
import { agentsApi } from '../../services/api/agents';
import { useBusiness } from '../../app/providers/BusinessProvider';
import { useToast } from '../../app/providers/ToastProvider';
import type { ContactDocument } from '../../types/api';
import { CsvImportModal } from '../contacts/CsvImportModal';
import { CallDetailDrawer } from '../calls/CallDetailDrawer';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Button } from '../../components/ui/Button';
import { MCard, MStatCard, MPageHeader, Avatar, Pill, primaryPill, whitePill } from './ui';
import { parseServerDate, formatDateTime, timeAgo } from '../../utils/dateUtils';
import { exportToExcel } from '../../utils/excelExport';
import { format } from 'date-fns';

type StatusFilter = 'all' | 'interested' | 'not_interested' | 'unanalyzed';

export const ModernContacts: React.FC = () => {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { selectedBusiness, selectedBusinessId, isAllBusinesses } = useBusiness();

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);

  // Bulk Selection State
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBatchDialModalOpen, setIsBatchDialModalOpen] = useState(false);
  const [batchAgentId, setBatchAgentId] = useState<string>('');
  const [isBatchDialing, setIsBatchDialing] = useState(false);

  // Edit Contact State
  const [editingContact, setEditingContact] = useState<ContactDocument | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  // New Contact Form fields
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newAgentId, setNewAgentId] = useState('');

  const { data: contacts = [], isLoading, refetch } = useQuery<ContactDocument[]>({
    queryKey: ['contacts', selectedBusinessId],
    queryFn: () => contactsApi.getContacts({ limit: 500 }),
    refetchInterval: 8000,
  });

  const { data: agents = [] } = useQuery({
    queryKey: ['agents'],
    queryFn: () => agentsApi.getAgents(50),
  });

  const defaultAgentId = agents[0]?.agent_id || 'agent-admission-advisor';

  const createContactMutation = useMutation({
    mutationFn: (payload: { name: string; phone_number: string; email?: string; agent_id?: string; tenant_id?: string }) =>
      contactsApi.createOrUpdateContact(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      toast.success('Contact Added', 'New client contact created successfully.');
      setIsAddModalOpen(false);
      setNewName('');
      setNewPhone('');
      setNewEmail('');
      setNewAgentId('');
    },
    onError: (err: any) => {
      toast.error('Failed to add contact', err?.response?.data?.detail || err?.message || 'Error occurred');
    },
  });

  const handleCreateContact = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPhone.trim()) {
      toast.error('Phone Required', 'Please enter a valid phone number.');
      return;
    }
    createContactMutation.mutate({
      name: newName.trim() || (undefined as any),
      phone_number: newPhone.trim(),
      email: newEmail.trim() || undefined,
      agent_id: newAgentId || agents[0]?.agent_id || undefined,
      tenant_id: selectedBusiness?.id || undefined,
    });
  };

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
      toast.success('Contact Updated', `Saved profile for ${editingContact.phone_number}`);
      setEditingContact(null);
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
    } catch (err: any) {
      toast.error('Update Failed', err?.message || 'Failed to update contact');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleQuickCall = (phone: string, e: React.MouseEvent) => {
    e.stopPropagation();
    window.dispatchEvent(new CustomEvent('voxora-quick-dial', { detail: { phone } }));
  };

  // Toggle selection
  const handleToggleSelect = (contactId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(contactId)) next.delete(contactId);
      else next.add(contactId);
      return next;
    });
  };

  // Export to Excel
  const handleExportExcel = (subset?: ContactDocument[]) => {
    const listToExport = subset || visible;
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
      'Registered Date': formatDateTime(c.created_at, 'yyyy-MM-dd HH:mm:ss'),
    }));

    const filename = `voxora_contacts_${statusFilter}_${format(new Date(), 'yyyyMMdd_HHmm')}`;
    exportToExcel(rows, filename, 'Contacts Directory');
    toast.success('Export Complete', `Exported ${rows.length} contacts to Excel.`);
  };

  // Batch Calling
  const handleStartBatchCall = async () => {
    const selectedContacts = contacts.filter((c) => selectedIds.has(c.contact_id));
    const targetNumbers = selectedContacts.map((c) => c.phone_number);
    if (targetNumbers.length === 0) return;

    const targetAgent = batchAgentId || defaultAgentId;
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
      toast.error('Batch Dispatch Failed', err?.message || 'Error launching calls');
    } finally {
      setIsBatchDialing(false);
    }
  };

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

  const called = scopedContacts.filter((c) => (c.interaction_count || 0) > 0).length;
  const interested = scopedContacts.filter(
    (c) =>
      c.last_interest_status &&
      ['interested', 'callback_requested', 'qualified', 'hot'].includes(c.last_interest_status.toLowerCase())
  ).length;
  const notInterested = scopedContacts.filter(
    (c) =>
      c.last_interest_status &&
      ['not_interested', 'rejected', 'opt_out', 'disqualified'].includes(c.last_interest_status.toLowerCase())
  ).length;
  const unanalyzed = scopedContacts.filter(
    (c) => !c.last_interest_status || ['unanalyzed', 'unknown', 'pending'].includes(c.last_interest_status.toLowerCase())
  ).length;

  const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
  const fresh = scopedContacts.filter((c) => (parseServerDate(c.created_at)?.getTime() || 0) > weekAgo).length;

  const stats = [
    { label: 'Total Contacts', value: scopedContacts.length.toLocaleString('en-IN'), icon: Users, iconClass: 'bg-[#F2F4F7] text-[#344054]', subtext: 'in client directory' },
    { label: 'Called at Least Once', value: called.toLocaleString('en-IN'), icon: PhoneCall, iconClass: 'bg-[#E6F4FE] text-[#0284C7]', subtext: scopedContacts.length ? `${Math.round((called / scopedContacts.length) * 100)}% reach rate` : '' },
    { label: 'Interested Prospects', value: interested.toLocaleString('en-IN'), icon: Heart, iconClass: 'bg-[#E7F8EE] text-[#16A34A]', subtext: 'confirmed buyer intent' },
    { label: 'Not Interested', value: notInterested.toLocaleString('en-IN'), icon: ThumbsDown, iconClass: 'bg-[#FDECEC] text-[#DC2626]', subtext: 'opt-out or disqualified' },
  ];


  const visible = useMemo(() => {
    let list = scopedContacts;

    // Status filter
    if (statusFilter !== 'all') {
      list = list.filter((c) => {
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
    }

    // Search query
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((c) =>
      [c.name, c.phone_number, c.email].filter(Boolean).some((v) => String(v).toLowerCase().includes(q))
    );
  }, [contacts, query, statusFilter]);

  const handleSelectAllVisible = () => {
    if (selectedIds.size === visible.length && visible.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(visible.map((c) => c.contact_id)));
    }
  };

  return (
    <div>
      <MPageHeader
        title="Contacts"
        subtitle="Manage client prospects, inspect past call turns, and launch quick 1-click dials."
        actions={
          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              type="button"
              className={whitePill}
              onClick={() => handleExportExcel()}
            >
              <Download className="w-4 h-4 text-[#475467]" /> Export Excel
            </button>
            <button
              type="button"
              className={whitePill}
              onClick={() => setIsCsvModalOpen(true)}
            >
              <UploadCloud className="w-4 h-4 text-[#475467]" /> Import CSV
            </button>
            <button
              type="button"
              className={primaryPill}
              onClick={() => setIsAddModalOpen(true)}
            >
              <Plus className="w-4 h-4" /> Add Contact
            </button>
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-[#667085] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search phone or name…"
                className="w-full h-10 pl-10 pr-4 rounded-full bg-white border border-[#E8EAED] text-[13px] placeholder-[#667085] focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/15 transition-all shadow-2xs"
              />
            </div>
          </div>
        }
      />

      {/* KPI Cards (Clickable) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6 mb-6">
        <div onClick={() => setStatusFilter('all')} className="cursor-pointer">
          <MStatCard {...stats[0]} delay={0} />
        </div>
        <div onClick={() => setStatusFilter('all')} className="cursor-pointer">
          <MStatCard {...stats[1]} delay={60} />
        </div>
        <div onClick={() => setStatusFilter('interested')} className="cursor-pointer">
          <MStatCard {...stats[2]} delay={120} />
        </div>
        <div onClick={() => setStatusFilter('not_interested')} className="cursor-pointer">
          <MStatCard {...stats[3]} delay={180} />
        </div>
      </div>

      {/* Status Filter Tabs & Select All Row */}
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-1.5 p-1 bg-white border border-[#E8EAED] rounded-full shadow-2xs overflow-x-auto">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all ${
              statusFilter === 'all'
                ? 'bg-[#101828] text-white shadow-xs'
                : 'text-[#475467] hover:text-[#101828] hover:bg-[#F2F4F7]'
            }`}
          >
            All Contacts ({scopedContacts.length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('interested')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all ${
              statusFilter === 'interested'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-[#475467] hover:text-emerald-700 hover:bg-[#F2F4F7]'
            }`}
          >
            Interested ({interested})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('not_interested')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all ${
              statusFilter === 'not_interested'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'text-[#475467] hover:text-rose-700 hover:bg-[#F2F4F7]'
            }`}
          >
            Not Interested ({notInterested})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('unanalyzed')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all ${
              statusFilter === 'unanalyzed'
                ? 'bg-slate-700 text-white shadow-xs'
                : 'text-[#475467] hover:text-[#101828] hover:bg-[#F2F4F7]'
            }`}
          >
            Unanalyzed ({unanalyzed})
          </button>
        </div>

        <button
          type="button"
          onClick={handleSelectAllVisible}
          className="text-xs font-medium text-[#475467] hover:text-[#101828] flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-[#E8EAED] shadow-2xs hover:bg-[#F9FAFB] transition-colors"
        >
          {selectedIds.size === visible.length && visible.length > 0 ? (
            <>
              <CheckSquare className="w-3.5 h-3.5 text-orange-600" />
              <span>Deselect All ({visible.length})</span>
            </>
          ) : (
            <>
              <Square className="w-3.5 h-3.5 text-[#667085]" />
              <span>Select All Visible ({visible.length})</span>
            </>
          )}
        </button>
      </div>

      {/* Floating Batch Actions Bar */}
      {selectedIds.size > 0 && (
        <div className="mb-4 p-3 rounded-2xl bg-[#101828] text-white flex flex-wrap items-center justify-between gap-3 shadow-lg">
          <div className="flex items-center gap-2.5 pl-2">
            <span className="w-6 h-6 rounded-full bg-orange-500 text-white text-xs font-bold flex items-center justify-center">
              {selectedIds.size}
            </span>
            <span className="text-xs font-semibold">Contacts Selected</span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => {
                const subset = contacts.filter((c) => selectedIds.has(c.contact_id));
                handleExportExcel(subset);
              }}
              className="px-3 py-1.5 rounded-full text-xs font-medium bg-white/10 hover:bg-white/20 text-white flex items-center gap-1.5 transition-colors"
            >
              <Download className="w-3.5 h-3.5" /> Export Selected ({selectedIds.size})
            </button>

            <button
              type="button"
              onClick={() => {
                setBatchAgentId(defaultAgentId);
                setIsBatchDialModalOpen(true);
              }}
              className="px-4 py-1.5 rounded-full text-xs font-bold bg-orange-500 hover:bg-orange-600 text-white flex items-center gap-1.5 shadow-sm transition-all"
            >
              <Send className="w-3.5 h-3.5" /> Launch AI Batch Calling ({selectedIds.size})
            </button>

            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="p-1.5 rounded-full hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
              title="Clear selection"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Main List */}
      <MCard className="overflow-hidden">
        {isLoading && <p className="p-12 text-center text-sm text-[#667085]">Loading contacts…</p>}
        {!isLoading && visible.length === 0 && (
          <div className="p-12 text-center">
            <span className="w-12 h-12 rounded-full bg-[#F2F4F7] flex items-center justify-center mx-auto mb-3">
              <Users className="w-5 h-5 text-[#667085]" />
            </span>
            <p className="text-sm font-semibold text-[#344054]">No contacts found</p>
            <p className="text-xs text-[#667085] mt-1 mb-5">
              {statusFilter !== 'all'
                ? `No contacts match '${statusFilter}'. Switch to 'All Contacts' to view your directory.`
                : 'Import a CSV spreadsheet or add a single contact to start calling.'}
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                className={whitePill}
                onClick={() => setIsCsvModalOpen(true)}
              >
                <UploadCloud className="w-4 h-4" /> Import CSV
              </button>
              <button
                type="button"
                className={primaryPill}
                onClick={() => setIsAddModalOpen(true)}
              >
                <Plus className="w-4 h-4" /> Add Contact
              </button>
            </div>
          </div>
        )}
        <div className="divide-y divide-[#F1F2F4]">
          {visible.map((c) => {
            const rawStatus = (c.last_interest_status || '').toLowerCase();
            const isSelected = selectedIds.has(c.contact_id);

            return (
              <div
                key={c.contact_id}
                onClick={() => c.last_call_id && setSelectedCallId(c.last_call_id)}
                className={`flex items-center gap-3.5 px-6 py-4 hover:bg-[#F8F9FA] transition-colors ${
                  c.last_call_id ? 'cursor-pointer group' : ''
                } ${isSelected ? 'bg-orange-50/40' : ''}`}
              >
                {/* Select Checkbox */}
                <button
                  type="button"
                  onClick={(e) => handleToggleSelect(c.contact_id, e)}
                  className="p-1 text-slate-400 hover:text-[#101828] transition-colors"
                >
                  {isSelected ? (
                    <CheckSquare className="w-4 h-4 text-orange-600" />
                  ) : (
                    <Square className="w-4 h-4 text-[#C4CBD4]" />
                  )}
                </button>

                <Avatar name={c.name || c.phone_number} className="w-10 h-10 font-bold shrink-0" />

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-[#101828] group-hover:text-orange-600 transition-colors truncate">
                    {c.name || 'Prospect'}
                  </p>
                  <p className="text-xs text-[#667085] truncate font-mono mt-0.5">
                    {c.phone_number}
                    {c.email ? ` · ${c.email}` : ''}
                  </p>
                </div>

                <div className="hidden sm:flex items-center gap-1.5 text-xs text-[#475467] font-semibold bg-[#F2F4F7] px-2.5 py-1 rounded-full shrink-0">
                  <PhoneCall className="w-3 h-3 text-orange-600" />
                  <span>{c.interaction_count || 0} call{(c.interaction_count || 0) === 1 ? '' : 's'}</span>
                </div>

                {/* Last Called Recency */}
                <div className="hidden md:flex flex-col text-right shrink-0 min-w-[100px]">
                  <span className="text-xs font-mono text-[#344054]">
                    {c.last_call_at ? formatDateTime(c.last_call_at, 'MMM dd') : <span className="text-[#98A2B3] italic">Never</span>}
                  </span>
                  <span className="text-[10px] text-[#667085]">
                    {c.last_call_at ? formatDateTime(c.last_call_at, 'hh:mm a') : 'unreached'}
                  </span>
                </div>

                {/* Status Pill */}
                {rawStatus === 'interested' || rawStatus === 'qualified' || rawStatus === 'hot' ? (
                  <Pill tone="emerald">Interested</Pill>
                ) : rawStatus === 'not_interested' || rawStatus === 'rejected' || rawStatus === 'opt_out' ? (
                  <Pill tone="rose">Not Interested</Pill>
                ) : (
                  <Pill tone="slate">Unanalyzed</Pill>
                )}

                {/* Row Action Buttons */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    title="Edit Contact"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingContact(c);
                      setEditName(c.name || '');
                      setEditEmail(c.email || '');
                    }}
                    className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-[#101828] flex items-center justify-center transition-colors cursor-pointer"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>

                  {c.last_call_id && (
                    <button
                      type="button"
                      title="Inspect latest call audio and transcript"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedCallId(c.last_call_id!);
                      }}
                      className="w-8 h-8 rounded-full bg-slate-100 hover:bg-orange-50 text-slate-600 hover:text-orange-600 flex items-center justify-center transition-colors cursor-pointer"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={(e) => handleQuickCall(c.phone_number, e)}
                    className="h-8 px-3 rounded-full bg-orange-50 hover:bg-orange-100 text-orange-600 font-semibold text-xs flex items-center gap-1 transition-all cursor-pointer"
                  >
                    <PhoneCall className="w-3 h-3" /> Call
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </MCard>

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
        description="Register a new prospect with full name, phone number, and optional agent assignment."
        size="md"
      >
        <form onSubmit={handleCreateContact} className="space-y-4">
          <Input
            label="Phone Number"
            placeholder="+919876543210"
            value={newPhone}
            onChange={(e) => setNewPhone(e.target.value)}
            required
            helperText="Include country code (e.g. +91)"
          />
          <Input
            label="Full Name"
            placeholder="e.g. Ramesh Kumar"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <Input
            label="Email Address"
            type="email"
            placeholder="ramesh@example.com"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
          />
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
              Default AI Voice Agent
            </label>
            <Select
              value={newAgentId || (agents[0]?.agent_id || '')}
              onChange={(e) => setNewAgentId(e.target.value)}
            >
              {agents.map((ag) => (
                <option key={ag.agent_id} value={ag.agent_id}>
                  {ag.name} ({ag.language_mode || 'Hindi/English'})
                </option>
              ))}
            </Select>
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100 dark:border-zinc-800">
            <Button variant="ghost" size="sm" onClick={() => setIsAddModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" isLoading={createContactMutation.isPending}>
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
            value={editingContact?.phone_number || ''}
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
