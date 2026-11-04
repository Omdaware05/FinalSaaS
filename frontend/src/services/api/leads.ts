import apiClient from './client';
import { LeadDocument } from '../../types/api';

export const leadsApi = {
  getLeads: async (params?: { agent_id?: string; tenant_id?: string; business_id?: string; limit?: number; skip?: number }): Promise<LeadDocument[]> => {
    const res = await apiClient.get<any>('/leads', { params: { limit: 500, ...params } });
    if (Array.isArray(res.data)) return res.data;
    if (res.data && Array.isArray(res.data.leads)) return res.data.leads;
    return [];
  },

  /**
   * Download the server-generated Excel workbook of leads
   * (GET /leads/export.xlsx), optionally filtered by status and tenant/business.
   */
  downloadLeadsExcel: async (status?: string, tenantId?: string): Promise<void> => {
    const params: Record<string, string> = {};
    if (status) params.status = status;
    if (tenantId && tenantId !== 'all') params.tenant_id = tenantId;

    const res = await apiClient.get('/leads/export.xlsx', {
      params,
      responseType: 'blob',
    });
    const url = URL.createObjectURL(res.data as Blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leads_${status || 'all'}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  },

  getLead: async (id: string): Promise<LeadDocument> => {
    const res = await apiClient.get<LeadDocument>(`/leads/${id}`);
    return res.data;
  },

  updateLead: async (id: string, payload: { status?: string; notes?: string }): Promise<LeadDocument> => {
    const res = await apiClient.patch<LeadDocument>(`/leads/${id}`, payload);
    return res.data;
  },
};
