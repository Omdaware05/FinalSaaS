import { apiClient } from './client';

export interface BusinessSummary {
  business_id: string;
  org_id: string;
  name: string;
  industry: string;
  primary_contact?: string;
  email?: string;
  phone?: string;
  timezone: string;
  country: string;
  preferred_languages: string[];
  assigned_agent_ids: string[];
  total_calls: number;
  total_leads: number;
  qualified_leads: number;
  conversion_rate: number;
  is_active: boolean;
  created_at: string;
}

export interface BusinessDocument extends BusinessSummary {
  updated_at?: string;
  settings?: Record<string, any>;
}

export interface CreateBusinessRequest {
  name: string;
  industry?: string;
  primary_contact?: string;
  email?: string;
  phone?: string;
  timezone?: string;
  country?: string;
  preferred_languages?: string[];
  settings?: Record<string, any>;
}

export interface UpdateBusinessRequest {
  name?: string;
  industry?: string;
  primary_contact?: string;
  email?: string;
  phone?: string;
  timezone?: string;
  country?: string;
  preferred_languages?: string[];
  is_active?: boolean;
  settings?: Record<string, any>;
}

export const businessesApi = {
  list: async (params?: { org_id?: string; is_active?: boolean; limit?: number; skip?: number }): Promise<BusinessSummary[]> => {
    const { data } = await apiClient.get<BusinessSummary[]>('/api/businesses', { params });
    return data;
  },

  get: async (businessId: string): Promise<BusinessDocument> => {
    const { data } = await apiClient.get<BusinessDocument>(`/api/businesses/${businessId}`);
    return data;
  },

  create: async (req: CreateBusinessRequest): Promise<BusinessDocument> => {
    const { data } = await apiClient.post<BusinessDocument>('/api/businesses', req);
    return data;
  },

  update: async (businessId: string, req: UpdateBusinessRequest): Promise<BusinessDocument> => {
    const { data } = await apiClient.put<BusinessDocument>(`/api/businesses/${businessId}`, req);
    return data;
  },

  delete: async (businessId: string, hardDelete = false): Promise<void> => {
    await apiClient.delete(`/api/businesses/${businessId}`, { params: { hard_delete: hardDelete } });
  },

  assignAgent: async (businessId: string, agentId: string): Promise<void> => {
    await apiClient.post(`/api/businesses/${businessId}/agents/${agentId}/assign`);
  },

  unassignAgent: async (businessId: string, agentId: string): Promise<void> => {
    await apiClient.post(`/api/businesses/${businessId}/agents/${agentId}/unassign`);
  },

  getDashboard: async (businessId: string) => {
    const { data } = await apiClient.get(`/api/businesses/${businessId}/dashboard`);
    return data;
  }
};
