import apiClient, { API_BASE_URL } from './client';

export interface ModelInfo {
  model_id: string;
  model_name: string;
  model_type: 'llm' | 'stt' | 'tts' | 'classifier' | 'vision' | 'embedding';
  framework: string;
  model_path: string;
  description: string;
  languages_supported: string[];
  gpu_required: boolean;
  approx_vram_mb: number;
  supports_streaming: boolean;
  port?: number;
  health_endpoint?: string;
  status: 'OFFLINE' | 'LOADING' | 'READY' | 'BUSY' | 'ERROR' | 'STOPPING';
  active_pid?: number;
  last_error?: string;
}

export interface GpuTelemetry {
  gpu_name: string;
  vram_total_mb: number;
  vram_used_mb: number;
  vram_free_mb: number;
  gpu_utilization_pct: number;
  temperature_c: number;
}

export interface RuntimeHealth {
  status: string;
  active_model_id?: string;
  active_model_type?: string;
  gpu?: GpuTelemetry;
  cpu_usage_pct: number;
  ram_used_mb: number;
}

export interface ModelTestRequest {
  model_id?: string;
  input_text?: string;
  audio_base64?: string;
  system_prompt?: string;
}

export interface ModelTestResponse {
  model_id: string;
  success: boolean;
  status: string;
  output_text?: string;
  audio_base64?: string;
  latency_ms: number;
  ttft_ms?: number;
  ttfa_ms?: number;
  tokens_per_second?: number;
  gpu_vram_mb?: number;
  error_message?: string;
}

export interface TurnMetrics {
  stt_latency_ms: number;
  llm_ttft_ms: number;
  llm_tokens_per_sec: number;
  tts_ttfa_ms: number;
  total_latency_ms: number;
}

export interface IntentAnalysis {
  classification: 'INTERESTED' | 'NOT_INTERESTED';
  confidence: number;
  reason: string;
  signals?: string[];
  rule_applied?: string;
  languages_detected?: string[];
  customer_turns_count?: number;
  total_turns_count?: number;
  is_ambiguous_rescued?: boolean;
}

export interface TurnResponse {
  success: boolean;
  turn: number;
  user_text: string;
  ai_text: string;
  audio_base64?: string;
  audio_url?: string;
  intent_analysis?: IntentAnalysis | null;
  metrics: TurnMetrics;
}

export interface TerminalLogEntry {
  id: number;
  timestamp: string;
  category: string;
  level: string;
  message: string;
  metadata?: Record<string, any>;
}

export interface TerminalLogsResponse {
  success: boolean;
  logs: TerminalLogEntry[];
  total: number;
  active_model_id?: string;
}

export const modelLabApi = {
  // Latest synthesized session audio, served by the backend under
  // /api/v1/model-lab/audio/{file}. Played via new Audio()/ <audio src>,
  // which cannot send headers, so the JWT rides as access_token.
  getLatestAudioUrl: (): string => {
    const token = localStorage.getItem('api_auth_token');
    const params = new URLSearchParams({ t: String(Date.now()) });
    if (token) params.set('access_token', token);
    return `${API_BASE_URL}/model-lab/audio/latest.wav?${params.toString()}`;
  },

  getAudioUrl: (file: string): string => {
    const token = localStorage.getItem('api_auth_token');
    const auth = token ? `?access_token=${encodeURIComponent(token)}` : '';
    return `${API_BASE_URL}/model-lab/audio/${encodeURIComponent(file)}${auth}`;
  },

  getModels: async (): Promise<ModelInfo[]> => {
    const res = await apiClient.get<ModelInfo[]>('/api/model-lab/models');
    return res.data;
  },

  getModel: async (modelId: string): Promise<ModelInfo> => {
    const res = await apiClient.get<ModelInfo>(`/api/model-lab/models/${modelId}`);
    return res.data;
  },

  startModel: async (modelId: string) => {
    const res = await apiClient.post(`/api/model-lab/models/${modelId}/start`);
    return res.data;
  },

  stopModel: async (modelId: string) => {
    const res = await apiClient.post(`/api/model-lab/models/${modelId}/stop`);
    return res.data;
  },

  testModel: async (modelId: string, data: ModelTestRequest): Promise<ModelTestResponse> => {
    const res = await apiClient.post<ModelTestResponse>(`/api/model-lab/models/${modelId}/test`, data);
    return res.data;
  },

  getGpuTelemetry: async (): Promise<GpuTelemetry | null> => {
    const res = await apiClient.get<GpuTelemetry | null>('/api/model-lab/gpu');
    return res.data;
  },

  getRuntimeHealth: async (): Promise<RuntimeHealth> => {
    const res = await apiClient.get<RuntimeHealth>('/api/model-lab/runtime');
    return res.data;
  },

  getTerminalLogs: async (sinceId: number = 0): Promise<TerminalLogsResponse> => {
    const res = await apiClient.get<TerminalLogsResponse>(`/api/model-lab/terminal-logs?since_id=${sinceId}`);
    return res.data;
  },

  clearTerminalLogs: async () => {
    const res = await apiClient.post('/api/model-lab/terminal-logs/clear');
    return res.data;
  },

  startSession: async (data: {
    stt_model_id: string;
    llm_model_id: string;
    tts_model_id: string;
    language: string;
    system_prompt?: string;
  }) => {
    const res = await apiClient.post('/api/model-lab/session/start', data);
    return res.data;
  },

  executeTurn: async (sessionId: string, data: { user_text?: string; audio_base64?: string }): Promise<TurnResponse> => {
    const res = await apiClient.post<TurnResponse>(`/api/model-lab/session/${sessionId}/turn`, data);
    return res.data;
  },

  interruptSession: async (sessionId: string) => {
    const res = await apiClient.post(`/api/model-lab/session/${sessionId}/interrupt`);
    return res.data;
  },

  endSession: async (sessionId: string, data: {
    interested?: boolean;
    outcome?: string;
    notes?: string;
    phone_number?: string;
    lead_name?: string;
  }) => {
    const res = await apiClient.post(`/api/model-lab/session/${sessionId}/end`, data);
    return res.data;
  },

  getBenchmarks: async () => {
    const res = await apiClient.get('/api/model-lab/benchmarks');
    return res.data;
  },

  getTelephonyConfig: async () => {
    const res = await apiClient.get<{
      provider: string;
      configured: boolean;
      auth_id: string;
      auth_token_masked: string;
      has_token: boolean;
      phone_number: string;
      webhook_url: string;
      environment: string;
    }>('/api/model-lab/telephony/config');
    return res.data;
  },

  saveTelephonyConfig: async (data: {
    auth_id?: string;
    auth_token?: string;
    phone_number?: string;
    webhook_url?: string;
    environment?: string;
  }) => {
    const res = await apiClient.post('/api/model-lab/telephony/config', data);
    return res.data;
  },

  testTelephonyConnection: async () => {
    const res = await apiClient.post<{
      status: 'CONNECTED' | 'AUTHENTICATION FAILED' | 'INVALID CONFIGURATION' | 'NETWORK ERROR' | 'NOT CONFIGURED';
      connected: boolean;
      message: string;
      http_code: number | null;
    }>('/api/model-lab/telephony/test-connection');
    return res.data;
  },

  makeTelephonyTestCall: async (data: {
    phone_number: string;
    stt_model_id: string;
    llm_model_id: string;
    tts_model_id: string;
    language: string;
  }) => {
    const res = await apiClient.post<{
      success: boolean;
      call_id: string;
      provider_call_id: string;
      status: string;
      phone_number: string;
    }>('/api/model-lab/telephony/call', data);
    return res.data;
  },

  classifyIntent: async (data: { transcript: string; explain?: boolean }): Promise<{
    success: boolean;
    classification: 'INTERESTED' | 'NOT_INTERESTED';
    confidence: number;
    reason: string;
    rule_applied?: string;
    languages_detected?: string[];
    signals_detected?: string[];
    customer_turns_count?: number;
    total_turns_count?: number;
    is_ambiguous_rescued?: boolean;
  }> => {
    const res = await apiClient.post('/api/model-lab/classify-intent', data);
    return res.data;
  },
};

