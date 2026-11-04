import { apiClient, API_BASE_URL } from './client';

export interface BusinessReportSummary {
  total_calls: number;
  completed_calls: number;
  answer_rate: number;
  average_duration_seconds: number;
  total_leads: number;
  qualified_leads: number;
  hot_leads: number;
  converted_leads: number;
  qualification_rate: number;
  conversion_rate: number;
}

export interface BusinessReport {
  report_id: string;
  business_id: string;
  period_days: number;
  generated_at: string;
  summary: BusinessReportSummary;
  lead_status_distribution: Record<string, number>;
  agent_performance: Record<string, { calls: number; completed: number; leads: number; qualified: number }>;
}

export const reportsApi = {
  getBusinessReport: async (businessId: string, days = 30): Promise<BusinessReport> => {
    const { data } = await apiClient.get<BusinessReport>(`/api/reports/business/${businessId}`, {
      params: { days }
    });
    return data;
  },

  getAgencyOverview: async (days = 30): Promise<BusinessReport> => {
    const { data } = await apiClient.get<BusinessReport>('/api/reports/agency/overview', {
      params: { days }
    });
    return data;
  },

  getExportUrl: (businessId: string, type: 'leads' | 'calls' = 'leads'): string => {
    // Opened via window.open (no headers possible) — JWT rides as a query param.
    const token = localStorage.getItem('api_auth_token');
    const auth = token ? `&access_token=${encodeURIComponent(token)}` : '';
    return `${API_BASE_URL}/reports/business/${businessId}/export?type=${type}${auth}`;
  }
};
