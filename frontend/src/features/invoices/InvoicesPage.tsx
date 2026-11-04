import React, { useState, useEffect } from 'react';
import { PageHeader } from '../../components/layout/PageHeader';
import { FileText, Plus, CheckCircle, Clock, AlertCircle, Download, Check } from 'lucide-react';
import { useBusiness } from '../../app/providers/BusinessProvider';
import apiClient, { API_BASE_URL } from '../../services/api/client';

interface Invoice {
  invoice_id: string;
  invoice_number: string;
  business_id: string;
  status: string;
  subtotal: number;
  tax: number;
  total: number;
  currency: string;
  issue_date: string;
  due_date: string;
  notes?: string;
  line_items: Array<{
    description: string;
    quantity: number;
    unit_price: number;
    amount: number;
  }>;
}

export const InvoicesPage: React.FC = () => {
  const { selectedBusiness } = useBusiness();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  
  // Form fields for new invoice
  const [lineDesc, setLineDesc] = useState('AI Voice Runtime & Call Hours');
  const [lineQty, setLineQty] = useState(10);
  const [lineRate, setLineRate] = useState(15.0);
  const [taxRate, setTaxRate] = useState(18.0);
  const [notes, setNotes] = useState('Payment terms: Net 30. Please remit to ARB SOFTECH bank account.');

  const businessId = selectedBusiness?.id || '';

  const fetchInvoices = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/invoices', { params: { business_id: businessId } });
      setInvoices(res.data);
    } catch (e) {
      console.error("Failed to fetch invoices", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoices();
  }, [selectedBusiness]);

  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiClient.post(
        '/invoices',
        {
          business_id: businessId,
          tax_rate: taxRate,
          notes: notes,
          line_items: [
            {
              description: lineDesc,
              quantity: Number(lineQty),
              unit_price: Number(lineRate),
            },
          ],
        },
        { params: { business_id: businessId } }
      );
      setShowCreateModal(false);
      fetchInvoices();
    } catch (e) {
      console.error("Failed to create invoice", e);
    }
  };

  const handleMarkPaid = async (invoiceId: string) => {
    try {
      await apiClient.post(`/invoices/${invoiceId}/mark-paid`, null, {
        params: { business_id: businessId },
      });
      fetchInvoices();
    } catch (e) {
      console.error("Failed to mark paid", e);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PAID':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <CheckCircle className="w-3.5 h-3.5" /> Paid
          </span>
        );
      case 'ISSUED':
      case 'SENT':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-orange-500/10 text-orange-600 dark:text-orange-400">
            <Clock className="w-3.5 h-3.5" /> Issued
          </span>
        );
      case 'OVERDUE':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-500/10 text-rose-600 dark:text-rose-400">
            <AlertCircle className="w-3.5 h-3.5" /> Overdue
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-zinc-500/10 text-zinc-600 dark:text-zinc-400">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <PageHeader
        title="Invoices & Billing"
        subtitle="Manual billing records, usage snapshots, and client invoice generation (No Online Payment Gateway)."
        actions={
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 dark:bg-zinc-100 dark:hover:bg-white dark:text-zinc-950 text-white rounded-lg text-xs font-semibold transition-colors"
          >
            <Plus className="w-4 h-4" /> Generate Invoice
          </button>
        }
      />

      {/* Warning Alert reminding user of manual payment policy */}
      <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300 text-xs flex items-start gap-3">
        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
        <div>
          <span className="font-semibold">Manual Billing Policy:</span> Invoices are issued directly to clients. Payments are collected outside the platform (via bank transfer/remittance) and manually marked as paid by platform administrators.
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-xs text-slate-500">Loading invoices...</div>
      ) : invoices.length === 0 ? (
        <div className="py-16 text-center border border-dashed border-slate-200 dark:border-zinc-800 rounded-xl space-y-3">
          <FileText className="w-10 h-10 mx-auto text-slate-400 dark:text-zinc-600" />
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">No Invoices Yet</h3>
          <p className="text-xs text-slate-500 dark:text-zinc-400 max-w-sm mx-auto">
            Click 'Generate Invoice' above to issue your first invoice for {selectedBusiness?.name || 'this business'}.
          </p>
        </div>
      ) : (
        <div data-glow="" className="rounded-2xl border border-slate-200/80 dark:border-white/[0.09] bg-white/75 dark:bg-[var(--card-glass-bg)] backdrop-blur-[18px] shadow-sm dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_8px_32px_rgba(0,0,0,0.35)] overflow-hidden glow-card">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/70 dark:bg-white/[0.02] border-b border-slate-200/80 dark:border-white/[0.06] text-slate-500 dark:text-zinc-400 font-semibold uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3">Invoice Number</th>
                <th className="px-4 py-3">Issue Date</th>
                <th className="px-4 py-3">Due Date</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/80 dark:divide-white/[0.05]">
              {invoices.map((inv) => (
                <tr key={inv.invoice_id} className="transition-colors hover:bg-slate-50/80 dark:hover:bg-[rgba(249,115,22,0.07)]">
                  <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">
                    {inv.invoice_number}
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-zinc-400">
                    {inv.issue_date}
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-zinc-400">
                    {inv.due_date}
                  </td>
                  <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">
                    {inv.currency} {inv.total.toFixed(2)}
                  </td>
                  <td className="px-4 py-3">{getStatusBadge(inv.status)}</td>
                  <td className="px-4 py-3 text-right space-x-2">
                    <a
                      href={`${API_BASE_URL}/invoices/${inv.invoice_id}/pdf?business_id=${businessId}&access_token=${encodeURIComponent(localStorage.getItem('api_auth_token') || '')}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-white/[0.06] hover:bg-slate-200 dark:hover:bg-white/[0.10] text-slate-700 dark:text-zinc-300 text-[11px] font-medium transition-colors"
                    >
                      <Download className="w-3 h-3" /> PDF
                    </a>
                    {inv.status !== 'PAID' && (
                      <button
                        onClick={() => handleMarkPaid(inv.invoice_id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-medium transition-colors"
                      >
                        <Check className="w-3 h-3" /> Mark Paid
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4">
          <div className="bg-white/90 dark:bg-[var(--modal-glass-bg)] backdrop-blur-[20px] saturate-[140%] border border-slate-200/80 dark:border-white/[0.10] shadow-[0_24px_48px_rgba(0,0,0,0.5)] rounded-2xl w-full max-w-lg p-6 space-y-4">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">Generate Manual Invoice</h2>

            <form onSubmit={handleCreateInvoice} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-700 dark:text-zinc-300 font-medium mb-1">Line Description</label>
                <input
                  type="text"
                  value={lineDesc}
                  onChange={(e) => setLineDesc(e.target.value)}
                  required
                  className="w-full px-3 py-2 border rounded-lg bg-transparent dark:border-zinc-800 text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-700 dark:text-zinc-300 font-medium mb-1">Quantity / Hours</label>
                  <input
                    type="number"
                    value={lineQty}
                    onChange={(e) => setLineQty(Number(e.target.value))}
                    required
                    className="w-full px-3 py-2 border rounded-lg bg-transparent dark:border-zinc-800 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 dark:text-zinc-300 font-medium mb-1">Unit Rate ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={lineRate}
                    onChange={(e) => setLineRate(Number(e.target.value))}
                    required
                    className="w-full px-3 py-2 border rounded-lg bg-transparent dark:border-zinc-800 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 dark:text-zinc-300 font-medium mb-1">Tax Rate (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={taxRate}
                    onChange={(e) => setTaxRate(Number(e.target.value))}
                    required
                    className="w-full px-3 py-2 border rounded-lg bg-transparent dark:border-zinc-800 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 dark:text-zinc-300 font-medium mb-1">Invoice Notes / Terms</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 border rounded-lg bg-transparent dark:border-zinc-800 text-slate-900 dark:text-white"
                />
              </div>

              <div className="pt-3 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-lg text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 dark:bg-zinc-100 dark:hover:bg-white dark:text-zinc-950 text-white font-semibold rounded-lg"
                >
                  Create & Issue
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
