import apiClient from './client';
import { SystemHealthResponse, SystemInfoResponse, ServiceHealthStatus } from '../../types/api';

export const healthApi = {
  getSystemInfo: async (): Promise<SystemInfoResponse> => {
    const res = await apiClient.get<SystemInfoResponse>('/');
    return res.data;
  },

  getHealth: async (): Promise<SystemHealthResponse> => {
    const res = await apiClient.get<SystemHealthResponse>('/health');
    return res.data;
  },

  getServiceHealth: async (
    service: 'stt' | 'tts' | 'llm' | 'mongodb' | 'providers' | 'interest-model'
  ): Promise<ServiceHealthStatus | Record<string, string>> => {
    const res = await apiClient.get(`/health/${service}`);
    return res.data;
  },
};
