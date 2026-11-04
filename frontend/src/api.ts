import axios, { AxiosError } from "axios";

// ---------------------------------------------------------------------------
// API client. baseURL is RELATIVE ("/api/v1") on purpose: in dev, Vite proxies
// /api to http://127.0.0.1:8001; in production any reverse proxy can do the
// same. The app must never hardcode localhost.
// ---------------------------------------------------------------------------

export const TOKEN_KEY = "finalsaas_token";

export const api = axios.create({ baseURL: "/api/v1" });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err: AxiosError) => {
    if (err.response?.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
    return Promise.reject(err);
  }
);

/** Backend error shape: { success:false, error: CODE, message: "..." } */
export function errorMessage(err: unknown, fallback = "Something went wrong"): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { message?: string; detail?: string } | undefined;
    if (data?.message) return data.message;
    if (typeof data?.detail === "string") return data.detail;
    if (err.response) return `Request failed (${err.response.status})`;
    return "Cannot reach the server. Is the backend running?";
  }
  return fallback;
}

/** List endpoints may return a bare array or an envelope; normalise both. */
export function asList<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    for (const key of ["items", "results", "data"]) {
      if (Array.isArray(obj[key])) return obj[key] as T[];
    }
  }
  return [];
}

// ---------------------------------------------------------------------------
// Types (mirror the backend contract)
// ---------------------------------------------------------------------------

export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
}

export interface LoginResponse {
  access_token: string;
  user: User;
}

export interface Agent {
  id: string;
  name: string;
  purpose: string;
  company_name: string;
  company_description: string;
  greeting_message: string;
  instructions: string;
  voice_id: string;
  language: string;
  enabled: boolean;
  concurrency: number;
  created_at?: string;
}

export type AgentInput = Omit<Agent, "id" | "created_at">;

export interface Contact {
  id: string;
  name: string;
  phone: string;
  email: string;
  status: string; // active | do_not_call | ...
  consent_status: string; // granted | unknown | denied | ...
  consent_source: string;
  notes: string;
  created_at?: string;
}

export interface TranscriptSegment {
  speaker: string; // "agent" | "customer"
  text: string;
  offset_seconds: number;
}

export interface Call {
  id: string;
  agent_id: string;
  contact_id?: string | null;
  phone: string;
  status: string; // queued | initiating | ringing | in_progress | completed | failed | busy | no_answer
  disposition?: string | null;
  duration_seconds?: number | null;
  failure_reason?: string | null;
  recording_status?: string | null; // none | pending | ready | synthesized
  created_at?: string;
  transcript?: TranscriptSegment[];
}

export interface BatchResult {
  created?: number;
  queued?: number;
  call_ids?: string[];
  errors?: string[];
  [key: string]: unknown;
}

export interface Campaign {
  id: string;
  name: string;
  agent_id: string;
  status: string;
  contact_ids?: string[];
  total_contacts?: number;
  calls_created?: number;
  completed?: number;
  interested?: number;
  counts?: Record<string, number>;
  created_at?: string;
  [key: string]: unknown;
}

export interface CampaignStartResult {
  created: number;
  blocked: number;
  errors: string[];
}

export interface Lead {
  id: string;
  call_id?: string;
  agent_id?: string;
  contact_id?: string | null;
  phone?: string;
  contact_name?: string;
  disposition?: string;
  status?: string;
  interest?: string;
  confidence_score?: number | null;
  summary?: string;
  created_at?: string;
  [key: string]: unknown;
}

export interface SettingsStatus {
  telephony_configured: boolean;
  from_number_masked: string;
  voice_provider: string;
  voice_provider_configured: boolean;
  public_url_configured: boolean;
  calling_hours: string;
  storage_backend: string;
}

// ---------------------------------------------------------------------------
// Endpoint helpers
// ---------------------------------------------------------------------------

export const authApi = {
  login: (email: string, password: string) =>
    api.post<LoginResponse>("/auth/login", { email, password }).then((r) => r.data),
  me: () => api.get<User>("/auth/me").then((r) => r.data),
};

export const agentsApi = {
  list: () => api.get("/agents").then((r) => asList<Agent>(r.data)),
  create: (body: AgentInput) => api.post<Agent>("/agents", body).then((r) => r.data),
  update: (id: string, body: Partial<AgentInput>) =>
    api.patch<Agent>(`/agents/${id}`, body).then((r) => r.data),
  remove: (id: string) => api.delete(`/agents/${id}`),
};

export const contactsApi = {
  list: () => api.get("/contacts").then((r) => asList<Contact>(r.data)),
  create: (body: Partial<Contact>) => api.post<Contact>("/contacts", body).then((r) => r.data),
  update: (id: string, body: Partial<Contact>) =>
    api.patch<Contact>(`/contacts/${id}`, body).then((r) => r.data),
  optOut: (id: string) => api.post(`/contacts/${id}/opt-out`).then((r) => r.data),
  importCsv: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return api
      .post("/contacts/import", form, { headers: { "Content-Type": "multipart/form-data" } })
      .then((r) => r.data as Record<string, unknown>);
  },
};

export const callsApi = {
  initiate: (agent_id: string, phone: string, contact_id?: string) =>
    api
      .post<Call>("/calls/initiate", { agent_id, phone, ...(contact_id ? { contact_id } : {}) })
      .then((r) => r.data),
  batch: (agent_id: string, phones: string[]) =>
    api.post<BatchResult>("/calls/batch", { agent_id, phones }).then((r) => r.data),
  list: (params: { status?: string; agent_id?: string } = {}) =>
    api.get("/calls", { params }).then((r) => asList<Call>(r.data)),
  get: (id: string) =>
    api.get(`/calls/${id}`).then((r) => {
      const data = r.data as Record<string, unknown>;
      // Accept either the call object itself or a { call, transcript } envelope.
      const call = (data.call as Call) ?? (data as unknown as Call);
      const transcript =
        (data.transcript as TranscriptSegment[]) ?? call.transcript ?? [];
      return { ...call, transcript };
    }),
  hangup: (id: string) => api.post(`/calls/${id}/hangup`).then((r) => r.data),
  recordingBlob: (id: string) =>
    api.get(`/calls/${id}/recording`, { responseType: "blob" }).then((r) => r.data as Blob),
};

export const campaignsApi = {
  list: () => api.get("/campaigns").then((r) => asList<Campaign>(r.data)),
  create: (body: { name: string; agent_id: string; contact_ids: string[] }) =>
    api.post<Campaign>("/campaigns", body).then((r) => r.data),
  start: (id: string) =>
    api.post<CampaignStartResult>(`/campaigns/${id}/start`).then((r) => r.data),
  get: (id: string) => api.get<Campaign>(`/campaigns/${id}`).then((r) => r.data),
};

export const leadsApi = {
  list: () => api.get("/leads").then((r) => asList<Lead>(r.data)),
  exportBlob: () =>
    api.get("/leads/export.xlsx", { responseType: "blob" }).then((r) => r.data as Blob),
};

export const settingsApi = {
  status: () => api.get<SettingsStatus>("/settings/status").then((r) => r.data),
};
