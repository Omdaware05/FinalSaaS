import apiClient, { API_BASE_URL } from './client';
import { CallDocument, TranscriptDocument, InterestAnalysisDocument } from '../../types/api';

export const callsApi = {
  getCalls: async (params?: {
    agent_id?: string;
    campaign_id?: string;
    state?: string;
    limit?: number;
    skip?: number;
  }): Promise<CallDocument[]> => {
    const res = await apiClient.get<any>('/calls', { params });
    if (Array.isArray(res.data)) return res.data;
    if (res.data && Array.isArray(res.data.calls)) return res.data.calls;
    return [];
  },

  getCall: async (callId: string): Promise<CallDocument> => {
    const res = await apiClient.get<CallDocument>(`/calls/${callId}`);
    return res.data;
  },

  hangupCall: async (callId: string): Promise<{ success: boolean; message?: string }> => {
    const res = await apiClient.post(`/calls/${callId}/hangup`);
    return res.data;
  },

  getTranscript: async (callId: string): Promise<TranscriptDocument> => {
    const res = await apiClient.get<TranscriptDocument>(`/calls/${callId}/transcript`);
    return res.data;
  },

  getRecordingUrl: (callId: string): string => {
    // Used directly as an <audio> src, which cannot send headers — the
    // backend accepts the JWT via the access_token query param.
    const token = localStorage.getItem('api_auth_token');
    const auth = token ? `?access_token=${encodeURIComponent(token)}` : '';
    return `${API_BASE_URL}/calls/${callId}/recording${auth}`;
  },

  analyzeInterest: async (callId: string): Promise<InterestAnalysisDocument> => {
    const res = await apiClient.post<InterestAnalysisDocument>(`/calls/${callId}/analyze-interest`);
    return res.data;
  },

  getInterest: async (callId: string): Promise<InterestAnalysisDocument> => {
    const res = await apiClient.get<InterestAnalysisDocument>(`/calls/${callId}/interest`);
    return res.data;
  },
};
