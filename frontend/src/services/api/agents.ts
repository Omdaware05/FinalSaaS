import apiClient from './client';
import {
  AgentDocument,
  AgentSummaryResponse,
  AgentDashboardResponse,
  StartCallsRequest,
  AgentInterestAnalytics,
} from '../../types/api';

export const agentsApi = {
  getAgents: async (limit = 50, skip = 0): Promise<AgentDocument[]> => {
    const res = await apiClient.get<AgentDocument[]>('/agents', {
      params: { limit, skip },
    });
    return res.data;
  },

  getAgent: async (agentId: string): Promise<AgentDocument> => {
    const res = await apiClient.get<AgentDocument>(`/agents/${agentId}`);
    return res.data;
  },

  createAgent: async (payload: Partial<AgentDocument>): Promise<AgentDocument> => {
    const res = await apiClient.post<AgentDocument>('/agents', payload);
    return res.data;
  },

  updateAgent: async (agentId: string, payload: Partial<AgentDocument>): Promise<AgentDocument> => {
    const res = await apiClient.put<AgentDocument>(`/agents/${agentId}`, payload);
    return res.data;
  },

  deleteAgent: async (agentId: string): Promise<{ deleted: boolean; agent_id: string }> => {
    const res = await apiClient.delete(`/agents/${agentId}`);
    return res.data;
  },

  duplicateAgent: async (agentId: string): Promise<AgentDocument> => {
    const res = await apiClient.post<AgentDocument>(`/agents/${agentId}/duplicate`);
    return res.data;
  },

  toggleAgent: async (agentId: string): Promise<AgentDocument> => {
    const res = await apiClient.post<AgentDocument>(`/agents/${agentId}/toggle`);
    return res.data;
  },

  getAgentSummary: async (agentId: string): Promise<AgentSummaryResponse> => {
    const res = await apiClient.get<AgentSummaryResponse>(`/agents/${agentId}/summary`);
    return res.data;
  },

  getAgentDashboard: async (agentId: string): Promise<AgentDashboardResponse> => {
    const res = await apiClient.get<AgentDashboardResponse>(`/agents/${agentId}/dashboard`);
    return res.data;
  },

  getAgentInterestAnalytics: async (agentId: string): Promise<AgentInterestAnalytics> => {
    const res = await apiClient.get<AgentInterestAnalytics>(`/agents/${agentId}/analytics/interest`);
    return res.data;
  },

  startCalls: async (agentId: string, payload: StartCallsRequest): Promise<{ status: string; queued: number; message?: string }> => {
    const res = await apiClient.post(`/agents/${agentId}/start-calls`, payload);
    return res.data;
  },

  previewBatch: async (agentId: string, phone_numbers: string[]): Promise<{ total: number; valid: string[]; invalid: string[] }> => {
    const res = await apiClient.post(`/agents/${agentId}/preview-batch`, { phone_numbers });
    return res.data;
  },
};
