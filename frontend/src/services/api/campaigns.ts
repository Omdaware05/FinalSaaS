import apiClient from './client';
import { CampaignDocument } from '../../types/api';

export const campaignsApi = {
  getCampaigns: async (agentId?: string): Promise<CampaignDocument[]> => {
    const res = await apiClient.get<any>('/campaigns', {
      params: agentId ? { agent_id: agentId } : undefined,
    });
    if (Array.isArray(res.data)) return res.data;
    if (res.data && Array.isArray(res.data.campaigns)) return res.data.campaigns;
    return [];
  },

  getCampaign: async (id: string): Promise<CampaignDocument> => {
    const res = await apiClient.get<CampaignDocument>(`/campaigns/${id}`);
    return res.data;
  },

  createCampaign: async (payload: {
    name: string;
    description?: string;
    agent_id: string;
    questionnaire_id?: string;
    phone_numbers: string[];
    concurrency?: number;
    provider?: string;
  }): Promise<CampaignDocument> => {
    const res = await apiClient.post<CampaignDocument>('/campaigns', payload);
    return res.data;
  },

  startCampaign: async (id: string): Promise<{ success: boolean; message?: string; campaign?: CampaignDocument }> => {
    const res = await apiClient.post(`/campaigns/${id}/start`);
    return res.data;
  },

  stopCampaign: async (id: string): Promise<{ success: boolean; message?: string; campaign?: CampaignDocument }> => {
    const res = await apiClient.post(`/campaigns/${id}/stop`);
    return res.data;
  },
};
