import { apiClient } from './client';

export interface VoBizConfigResponse {
  provider: string;
  configured: boolean;
  auth_id: string;
  auth_token_masked: string;
  has_token: boolean;
  phone_number: string;
  webhook_url: string;
  environment: string;
  is_ready_for_outbound?: boolean;
  updated_at?: string | null;
}

export interface VoBizSaveRequest {
  auth_id?: string;
  auth_token?: string;
  phone_number?: string;
  webhook_url?: string;
  environment?: string;
}

export interface VoBizTestResponse {
  status: 'CONNECTED' | 'AUTHENTICATION FAILED' | 'INVALID CONFIGURATION' | 'NETWORK ERROR' | 'NOT CONFIGURED';
  connected: boolean;
  message: string;
  http_code: number | null;
}

export interface TwilioConfigResponse {
  provider: string;
  configured: boolean;
  account_sid: string;
  auth_token_masked: string;
  has_token: boolean;
  phone_number: string;
  webhook_url: string;
  environment: string;
  is_ready_for_outbound?: boolean;
  updated_at?: string | null;
}

export interface TwilioSaveRequest {
  account_sid?: string;
  auth_token?: string;
  phone_number?: string;
  webhook_url?: string;
  environment?: string;
}

export interface TwilioTestResponse {
  status: 'CONNECTED' | 'AUTHENTICATION FAILED' | 'INVALID CONFIGURATION' | 'NETWORK ERROR' | 'NOT CONFIGURED';
  connected: boolean;
  message: string;
  http_code: number | null;
}

export const telephonyApi = {
  getVoBizConfig: async (): Promise<VoBizConfigResponse> => {
    const res = await apiClient.get<VoBizConfigResponse>('/api/telephony/vobiz');
    return res.data;
  },

  saveVoBizConfig: async (data: VoBizSaveRequest) => {
    const res = await apiClient.post<{
      success: boolean;
      message: string;
      auth_id?: string;
      phone_number?: string;
      configured?: boolean;
      config?: any;
    }>('/api/telephony/vobiz', data);
    return res.data;
  },

  testVoBizConnection: async (): Promise<VoBizTestResponse> => {
    const res = await apiClient.post<VoBizTestResponse>('/api/telephony/vobiz/test');
    return res.data;
  },

  getTwilioConfig: async (): Promise<TwilioConfigResponse> => {
    const res = await apiClient.get<TwilioConfigResponse>('/api/telephony/twilio');
    return res.data;
  },

  saveTwilioConfig: async (data: TwilioSaveRequest) => {
    const res = await apiClient.post<{
      success: boolean;
      message: string;
      account_sid?: string;
      phone_number?: string;
      configured?: boolean;
      config?: any;
    }>('/api/telephony/twilio', data);
    return res.data;
  },

  testTwilioConnection: async (): Promise<TwilioTestResponse> => {
    const res = await apiClient.post<TwilioTestResponse>('/api/telephony/twilio/test');
    return res.data;
  },
};
