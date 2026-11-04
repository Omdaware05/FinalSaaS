import apiClient from './client';
import {
  ModelType,
  ModelConfigDocument,
  ModelProviderSchema,
  ValidationResponse,
  ConnectivityTestResponse,
} from '../../types/api';

export const modelConfigApi = {
  getModelProviders: async (): Promise<Array<{ provider_id: string; name: string; model_type: ModelType; description?: string }>> => {
    const res = await apiClient.get('/api/model-providers');
    return res.data;
  },

  getProviderSchema: async (providerId: string): Promise<ModelProviderSchema> => {
    const res = await apiClient.get<ModelProviderSchema>(`/api/model-providers/${providerId}/schema`);
    return res.data;
  },

  getModelConfigs: async (): Promise<ModelConfigDocument[]> => {
    const res = await apiClient.get<ModelConfigDocument[]>('/api/model-config');
    return res.data;
  },

  getModelConfig: async (modelType: ModelType): Promise<ModelConfigDocument> => {
    const res = await apiClient.get<ModelConfigDocument>(`/api/model-config/${modelType}`);
    return res.data;
  },

  saveDraftConfig: async (modelType: ModelType, payload: Partial<ModelConfigDocument>): Promise<ModelConfigDocument> => {
    const res = await apiClient.put<ModelConfigDocument>(`/api/model-config/${modelType}`, payload);
    return res.data;
  },

  toggleConfigStatus: async (modelType: ModelType, is_active: boolean): Promise<ModelConfigDocument> => {
    const res = await apiClient.patch<ModelConfigDocument>(`/api/model-config/${modelType}/status`, { is_active });
    return res.data;
  },

  validateDraftConfig: async (modelType: ModelType): Promise<ValidationResponse> => {
    const res = await apiClient.post<ValidationResponse>(`/api/model-config/${modelType}/validate`);
    return res.data;
  },

  testDraftConnectivity: async (modelType: ModelType): Promise<ConnectivityTestResponse> => {
    const res = await apiClient.post<ConnectivityTestResponse>(`/api/model-config/${modelType}/test-draft`);
    return res.data;
  },

  testSavedConnectivity: async (modelType: ModelType): Promise<ConnectivityTestResponse> => {
    const res = await apiClient.post<ConnectivityTestResponse>(`/api/model-config/${modelType}/test`);
    return res.data;
  },

  getCredentialsStatus: async (modelType: ModelType): Promise<{ configured: boolean; model_type: string }> => {
    const res = await apiClient.get(`/api/model-config/${modelType}/credentials-status`);
    return res.data;
  },

  activateModelConfig: async (modelType: ModelType): Promise<{ success: boolean; message?: string; config?: ModelConfigDocument }> => {
    const res = await apiClient.post(`/api/model-config/${modelType}/activate`);
    return res.data;
  },

  deactivateModelConfig: async (modelType: ModelType): Promise<{ success: boolean; message?: string }> => {
    const res = await apiClient.post(`/api/model-config/${modelType}/deactivate`);
    return res.data;
  },

  getActiveModelConfig: async (modelType: ModelType): Promise<ModelConfigDocument> => {
    const res = await apiClient.get<ModelConfigDocument>(`/api/model-config/${modelType}/active`);
    return res.data;
  },

  getModelMode: async (): Promise<{
    success: boolean;
    mode: 'sarvam' | 'local' | 'api';
    is_local: boolean;
    is_sarvam?: boolean;
    local_server_ready: boolean;
    models: { llm: string; stt: string; tts: string };
  }> => {
    const res = await apiClient.get('/api/model-mode');
    return res.data;
  },

  toggleModelMode: async (mode?: 'sarvam' | 'local' | 'api'): Promise<{
    success: boolean;
    mode: 'sarvam' | 'local' | 'api';
    is_local: boolean;
    is_sarvam?: boolean;
    message: string;
  }> => {
    const res = await apiClient.post('/api/model-mode/toggle', mode ? { mode } : {});
    return res.data;
  },
};

