import apiClient from './client';

export interface CalendarDayCounts {
  calls: number;
  leads: number;
  followups: number;
}

export interface CalendarSummary {
  year: number;
  month: number;
  days: Record<string, CalendarDayCounts>;
}

export interface CalendarDayDetail {
  date: string;
  calls: Array<{
    call_id: string;
    phone_number: string;
    agent_id?: string | null;
    state: string;
    duration?: number | null;
    created_at?: string | null;
  }>;
  leads: Array<{
    lead_id: string;
    name?: string | null;
    phone_number: string;
    status: string;
    score?: number | null;
    created_at?: string | null;
  }>;
  followups: Array<{
    followup_id: string;
    phone_number: string;
    status: string;
    notes?: string | null;
    scheduled_at?: string | null;
  }>;
}

export const calendarApi = {
  getSummary: async (year: number, month: number): Promise<CalendarSummary> => {
    const res = await apiClient.get<CalendarSummary>('/calendar/summary', { params: { year, month } });
    return res.data;
  },
  getDay: async (date: string): Promise<CalendarDayDetail> => {
    const res = await apiClient.get<CalendarDayDetail>('/calendar/day', { params: { date } });
    return res.data;
  },
};
