import apiClient from './client';
import { StatsResponse, ActiveCallsResponse, QueueResponse, ProviderBreakdownResponse } from '../../types/api';

export const statsApi = {
  getStats: async (params?: any): Promise<StatsResponse> => {
    const tenantId = typeof params === 'string' ? params : (params?.tenant_id || undefined);
    const res = await apiClient.get<StatsResponse>('/stats', {
      params: tenantId && tenantId !== 'all' ? { tenant_id: tenantId } : undefined,
    });
    return res.data;
  },

  getActiveCalls: async (params?: any): Promise<ActiveCallsResponse> => {
    const tenantId = typeof params === 'string' ? params : (params?.tenant_id || undefined);
    const res = await apiClient.get<ActiveCallsResponse>('/active-calls', {
      params: tenantId && tenantId !== 'all' ? { tenant_id: tenantId } : undefined,
    });
    return res.data;
  },

  getQueue: async (): Promise<QueueResponse> => {
    const res = await apiClient.get<QueueResponse>('/queue');
    return res.data;
  },

  getProviderBreakdown: async (params?: any): Promise<ProviderBreakdownResponse> => {
    const tenantId = typeof params === 'string' ? params : (params?.tenant_id || undefined);
    const res = await apiClient.get<ProviderBreakdownResponse>('/stats/providers', {
      params: tenantId && tenantId !== 'all' ? { tenant_id: tenantId } : undefined,
    });
    return res.data;
  },
};
