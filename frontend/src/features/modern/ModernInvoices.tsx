import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Receipt, CircleDollarSign, Clock, AlertCircle, Download, Check, Building2, Plus, ArrowRight } from 'lucide-react';
import apiClient, { API_BASE_URL } from '../../services/api/client';
import { useBusiness } from '../../app/providers/BusinessProvider';
import { MCard, MStatCard, MPageHeader, Pill, primaryPill, whitePill } from './ui';
import { parseServerDate, formatDate } from '../../utils/dateUtils';

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
  line_items: Array<{ description: string; quantity: number; unit_price: number; amount: number }>;
}

function money(amount: number, currency?: string): string {
  const cur = (currency || 'INR').toUpperCase();
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(amount || 0);
  } catch {
    return `₹${(amount || 0).toLocaleString('en-IN')}`;
  }
}

export const ModernInvoices: React.FC = () => {
  const navigate = useNavigate();
  const { businesses, selectedBusiness, selectBusiness } = useBusiness();
  const businessId = selectedBusiness?.id || (businesses[0]?.id || '');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(false);

  // Auto-select first business if none selected
  useEffect(() => {
    if (!selectedBusiness && businesses.length > 0) {
      selectBusiness(businesses[0].id);
    }
  }, [selectedBusiness, businesses, selectBusiness]);

  const load = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    try {
      const res = await apiClient.get<Invoice[]>('/invoices', { params: { business_id: businessId } });
      setInvoices(Array.isArray(res.data) ? res.data : []);
    } catch {
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    load();
  }, [load]);

  const markPaid = async (id: string) => {
    try {
      await apiClient.post(`/invoices/${id}/mark-paid`, null, { params: { business_id: businessId } });
      load();
    } catch {
      /* surfaced by the unchanged list state */
    }
  };

  const isPaid = (inv: Invoice) => (inv.status || '').toLowerCase() === 'paid';
  const isOverdue = (inv: Invoice) => {
    if (isPaid(inv)) return false;
    const d = parseServerDate(inv.due_date);
    return d ? d.getTime() < Date.now() : false;
  };

  const totalBilled = invoices.reduce((a, i) => a + (i.total || 0), 0);
  const totalPaid = invoices.filter(isPaid).reduce((a, i) => a + (i.total || 0), 0);
  const pending = invoices.filter((i) => !isPaid(i) && !isOverdue(i));
  const overdue = invoices.filter(isOverdue);
  const currency = invoices[0]?.currency || 'INR';

  const stats = [
    { label: 'Total Billed', value: money(totalBilled, currency), icon: Receipt, iconClass: 'bg-[#F2F4F7] text-[#344054]', subtext: `${invoices.length} invoice${invoices.length === 1 ? '' : 's'}` },
    { label: 'Collected', value: money(totalPaid, currency), icon: CircleDollarSign, iconClass: 'bg-[#E7F8EE] text-[#16A34A]', subtext: 'payments received' },
    { label: 'Pending', value: money(pending.reduce((a, i) => a + i.total, 0), currency), icon: Clock, iconClass: 'bg-[#FFF1E6] text-[#EA580C]', subtext: `${pending.length} awaiting payment` },
    { label: 'Overdue', value: money(overdue.reduce((a, i) => a + i.total, 0), currency), icon: AlertCircle, iconClass: 'bg-[#FDECEC] text-[#DC2626]', subtext: `${overdue.length} past due date` },
  ];

  if (!businessId && businesses.length === 0) {
    return (
      <div>
        <MPageHeader title="Invoices & Billing" subtitle="Track fees, usage charges and payment status per client." />
        <MCard className="p-12 text-center max-w-lg mx-auto">
          <div className="w-14 h-14 rounded-2xl bg-orange-50 border border-orange-100 text-orange-600 flex items-center justify-center mx-auto mb-4">
            <Receipt className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-[#101828]">No client business found</h3>
          <p className="text-sm text-[#667085] mt-1.5 leading-relaxed">
            Billing invoices are scoped per business. Create a business first to manage billing records.
          </p>
          <div className="mt-6">
            <button
              type="button"
              className={primaryPill}
              onClick={() => navigate('/businesses')}
            >
              <Plus className="w-4 h-4" /> Go to Businesses
            </button>
          </div>
        </MCard>
      </div>
    );
  }

  return (
    <div>
      <MPageHeader
        title="Invoices & Billing"
        subtitle={`Invoices for ${selectedBusiness?.name || 'Selected Client'} — track fees, line items, and payment receipts.`}
        actions={
          businesses.length > 1 ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#667085] font-medium hidden sm:inline">Portfolio:</span>
              <select
                value={businessId}
                onChange={(e) => selectBusiness(e.target.value)}
                className="h-10 px-3.5 rounded-full bg-white border border-[#E8EAED] text-xs font-semibold text-[#101828] focus:outline-none focus:border-orange-500 shadow-xs cursor-pointer"
              >
                {businesses.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6 mb-6">
        {stats.map((st, i) => (
          <MStatCard key={st.label} {...st} delay={i * 60} />
        ))}
      </div>

      <MCard className="overflow-hidden">
        {loading && <p className="p-12 text-center text-sm text-[#667085]">Loading invoices…</p>}
        {!loading && invoices.length === 0 && (
          <div className="p-12 text-center">
            <span className="w-12 h-12 rounded-full bg-[#F2F4F7] flex items-center justify-center mx-auto mb-3">
              <Receipt className="w-5 h-5 text-[#667085]" />
            </span>
            <p className="text-sm font-semibold text-[#344054]">No invoices generated for this business yet</p>
            <p className="text-xs text-[#667085] mt-1">
              Monthly telecalling usage and platform retainers will automatically populate here.
            </p>
          </div>
        )}
        <div className="divide-y divide-[#F1F2F4]">
          {invoices.map((inv) => {
            const paid = isPaid(inv);
            const overdueInv = isOverdue(inv);
            return (
              <div key={inv.invoice_id} className="flex items-center gap-4 px-6 py-4 hover:bg-[#F8F9FA] transition-colors">
                <span className="w-10 h-10 rounded-full bg-[#F2F4F7] flex items-center justify-center shrink-0">
                  <Receipt className="w-[18px] h-[18px] text-[#475467]" strokeWidth={1.9} />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-[#101828]">{inv.invoice_number}</p>
                  <p className="text-xs text-[#667085] mt-0.5">
                    Issued {formatDate(inv.issue_date)} · Due {formatDate(inv.due_date)}
                  </p>
                </div>
                <span className="text-[15px] font-extrabold text-[#101828] tabular-nums">{money(inv.total, inv.currency)}</span>
                <Pill tone={paid ? 'emerald' : overdueInv ? 'rose' : 'amber'}>{paid ? 'Paid' : overdueInv ? 'Overdue' : 'Pending'}</Pill>
                <a
                  href={`${API_BASE_URL}/invoices/${inv.invoice_id}/pdf?business_id=${businessId}&access_token=${encodeURIComponent(localStorage.getItem('api_auth_token') || '')}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 h-8 px-3 rounded-full bg-white border border-[#E4E7EC] text-xs font-bold text-[#344054] hover:bg-[#F9FAFB] transition-colors shadow-2xs"
                >
                  <Download className="w-3.5 h-3.5" /> PDF
                </a>
                {!paid && (
                  <button
                    type="button"
                    onClick={() => markPaid(inv.invoice_id)}
                    className="inline-flex items-center gap-1 h-8 px-3 rounded-full bg-[#E7F8EE] text-[#16A34A] text-xs font-bold hover:bg-[#D3F2DF] transition-colors cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" /> Mark paid
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </MCard>
    </div>
  );
};
