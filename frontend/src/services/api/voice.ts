import apiClient, { API_BASE_URL } from './client';

export interface VoiceProvider {
  provider: string;
  display_name: string;
  description: string;
  supports_speed: boolean;
  supports_style: boolean;
  supported_languages: string[];
}

export interface VoiceItem {
  voice_id: string;
  name: string;
  gender: string;
  language: string;
  accent: string;
  description: string;
  preview_url?: string;
  provider: string;
  styles?: string[];
}

export interface VoiceListResponse {
  provider: string;
  total: number;
  voices: VoiceItem[];
}

export const voiceApi = {
  getProviders: async (): Promise<VoiceProvider[]> => {
    const res = await apiClient.get<VoiceProvider[]>('/api/voice/providers');
    return res.data;
  },

  getVoices: async (
    provider = 'dograh',
    params?: { gender?: string; language?: string; search?: string }
  ): Promise<VoiceListResponse> => {
    const res = await apiClient.get<VoiceListResponse>(`/api/voice/providers/${provider}/voices`, {
      params,
    });
    return res.data;
  },

  getPreviewAudioUrl: (previewUrl: string): string => {
    // <audio> elements cannot send the Authorization header, so the JWT
    // rides as the access_token query param (accepted by the backend).
    const token = localStorage.getItem('api_auth_token');
    const auth = token ? `&access_token=${encodeURIComponent(token)}` : '';
    return `${API_BASE_URL}/voice/preview?preview_url=${encodeURIComponent(previewUrl)}${auth}`;
  },

  getSarvamPreviewAudioUrl: (voice: string): string => {
    const token = localStorage.getItem('api_auth_token');
    const auth = token ? `?access_token=${encodeURIComponent(token)}` : '';
    return `${API_BASE_URL}/voice/preview-sarvam/${encodeURIComponent(voice)}${auth}`;
  },

  getSarvamConfig: async (): Promise<SarvamConfigResponse> => {
    const res = await apiClient.get<SarvamConfigResponse>('/api/voice/sarvam/config');
    return res.data;
  },

  saveSarvamConfig: async (data: {
    api_key: string;
    default_voice?: string;
    set_active?: boolean;
  }): Promise<{ success: boolean; message: string }> => {
    const res = await apiClient.post<{ success: boolean; message: string }>('/api/voice/sarvam/config', data);
    return res.data;
  },

  testSarvamConnection: async (data?: {
    api_key?: string;
    default_voice?: string;
  }): Promise<SarvamTestResponse> => {
    const res = await apiClient.post<SarvamTestResponse>('/api/voice/sarvam/test', data || {});
    return res.data;
  },

  getTranscriptApiConfig: async (): Promise<TranscriptApiConfigResponse> => {
    const res = await apiClient.get<TranscriptApiConfigResponse>('/api/voice/transcript-api/config');
    return res.data;
  },

  saveTranscriptApiConfig: async (data: {
    api_key: string;
    model?: string;
  }): Promise<{ success: boolean; message: string }> => {
    const res = await apiClient.post<{ success: boolean; message: string }>('/api/voice/transcript-api/config', data);
    return res.data;
  },

  testTranscriptApiConnection: async (data?: {
    api_key?: string;
    model?: string;
  }): Promise<TranscriptApiTestResponse> => {
    const res = await apiClient.post<TranscriptApiTestResponse>('/api/voice/transcript-api/test', data || {});
    return res.data;
  },
};

export interface SarvamConfigResponse {
  success: boolean;
  api_key: string;
  masked_api_key: string;
  default_voice: string;
  tts_model: string;
  stt_model: string;
  llm_model: string;
  is_configured: boolean;
  active: boolean;
}

export interface SarvamTestResponse {
  success: boolean;
  connected: boolean;
  status: string;
  message: string;
  model?: string;
  speaker?: string;
  request_id?: string;
  has_audio?: boolean;
}

export interface TranscriptApiModelItem {
  id: string;
  name: string;
  latency?: string;
}

export interface TranscriptApiConfigResponse {
  success: boolean;
  provider: string;
  provider_name: string;
  api_key: string;
  masked_api_key: string;
  model: string;
  is_configured: boolean;
  available_models: TranscriptApiModelItem[];
  stt_engine: string;
}

export interface TranscriptApiTestResponse {
  success: boolean;
  connected: boolean;
  status: string;
  message: string;
  latency_ms?: number;
  model?: string;
  available_models_count?: number;
}

