// ============================================================
// ARB SOFTECH / VOXORA — Complete API TypeScript Definitions
// Source of Truth: Backend/models.py & FRONTEND_MASTER_GUIDE.md
// ============================================================

export type CallState =
  | "QUEUED"
  | "DIALING"
  | "RINGING"
  | "CONNECTED"
  | "LISTENING"
  | "THINKING"
  | "SPEAKING"
  | "COMPLETED"
  | "FAILED"
  | "BUSY"
  | "NO_ANSWER"
  | "HANGUP";

export type ProviderType = "vobiz" | "twilio" | "plivo" | "mock";

export type CampaignStatus =
  | "CREATED"
  | "RUNNING"
  | "PAUSED"
  | "STOPPED"
  | "COMPLETED"
  | "FAILED";

export type Speaker = "agent" | "customer" | "system";

export type QuestionType =
  | "text"
  | "long_text"
  | "single_choice"
  | "multiple_choice"
  | "yes_no"
  | "number"
  | "rating"
  | "date"
  | "language_selection"
  | "custom";

export type QuestionnaireStatus = "draft" | "published" | "archived";

export type InterestStatus =
  | "pending"
  | "processing"
  | "interested"
  | "not_interested"
  | "uncertain"
  | "failed";

export type FollowupStatus = "pending" | "scheduled" | "completed" | "cancelled";

export type ModelType = "stt" | "tts" | "llm" | "interest";

// ============================================================
// QUESTIONNAIRE
// ============================================================
export interface ConditionalRule {
  trigger_question_id: string;
  expected_answer: any;
  action: "show_question" | "skip_to" | "terminate" | string;
  target_question_id?: string | null;
}

export interface Question {
  question_id: string;
  text: string;
  expected_answer?: string;
  type?: QuestionType;
  description?: string | null;
  required?: boolean;
  options?: string[];
  conditional_rules?: ConditionalRule[];
}

export interface ExcelImportResponse {
  success: boolean;
  filename: string;
  valid_count: number;
  questions: Question[];
  warnings: string[];
  questionnaire?: QuestionnaireDocument | null;
}

export interface QuestionnaireVersion {
  version_id: string;
  published_at: string;
  notes?: string | null;
}

export interface QuestionnaireDocument {
  questionnaire_id: string;
  version_id: string;
  title: string;
  description?: string | null;
  agent_id?: string | null;
  questions: Question[];
  status: QuestionnaireStatus;
  is_published: boolean;
  version_history: QuestionnaireVersion[];
  created_at: string;
  updated_at: string;
}

export interface QuestionAnswer {
  questionnaire_id: string;
  version_id: string;
  question_id: string;
  question_text: string;
  answer: any;
  submitted_at: string;
}

// ============================================================
// AGENT
// ============================================================
export interface AgentDocument {
  agent_id: string;
  id?: string;
  name: string;
  description?: string | null;
  purpose?: string | null;
  company_name?: string | null;
  company_description?: string | null;
  greeting_message?: string | null;
  predefined_faqs?: Array<{ question: string; answer: string }>;
  avatar?: string | null;
  is_enabled: boolean;
  default_language: string;
  supported_languages: string[];
  system_prompt: string;
  instructions?: string;
  questionnaire_id?: string | null;
  concurrency: number;
  provider: ProviderType;
  stt_config: Record<string, any>;
  tts_config: Record<string, any>;
  llm_config: Record<string, any>;
  voice_id?: string;
  voice_name?: string;
  voice_gender?: string;
  tts_provider?: string;
  language_mode?: string;
  primary_language?: string;
  voice_style?: string;
  speaking_speed?: number;
  telephony_provider?: string;
  telephony_from_number?: string | null;
  telephony_auth_id?: string | null;
  telephony_auth_token?: string | null;
  has_custom_telephony_token?: boolean;
  created_at: string;
  updated_at: string;
}

export interface AgentSummaryResponse {
  agent_id: string;
  name: string;
  description?: string | null;
  is_enabled: boolean;
  default_language: string;
  provider: ProviderType;
  total_calls: number;
  active_calls: number;
  completed_calls: number;
  failed_calls: number;
  interested_contacts: number;
  created_at: string;
}

export interface AgentDashboardResponse {
  agent_id: string;
  agent_name: string;
  total_calls: number;
  active_calls: number;
  queued_calls: number;
  completed_calls: number;
  failed_calls: number;
  average_duration_seconds: number;
  questionnaire_completion_rate: number;
  interested_count: number;
  not_interested_count: number;
  uncertain_count: number;
  language_distribution: Record<string, number>;
  recent_calls: CallDocument[];
}

export interface StartCallsRequest {
  phone_numbers: string[];
  concurrency?: number;
  provider?: ProviderType;
  language?: string;
  questionnaire_id?: string | null;
}

// ============================================================
// CALLS & TRANSCRIPTS & RECORDINGS
// ============================================================
export interface TranscriptSegment {
  speaker: Speaker;
  text: string;
  timestamp: string;
}

export interface TranscriptDocument {
  call_id: string;
  agent_id?: string | null;
  phone_number: string;
  duration: number;
  language: string;
  provider: string;
  stt_model: string;
  llm_model: string;
  tts_model: string;
  segments: TranscriptSegment[];
  created_at: string;
}

export interface RecordingDocument {
  call_id: string;
  agent_id?: string | null;
  local_path?: string;
  provider_url?: string | null;
  duration_seconds: number;
  sample_rate: number;
  format: string;
  file_size: number;
  created_at: string;
}

export interface CallModelInfo {
  stt: string;
  tts: string;
  llm: string;
}

export interface CallRecordingInfo {
  local_path?: string | null;
  provider_url?: string | null;
}

export interface CallDocument {
  call_id: string;
  tenant_id?: string | null;
  disposition?: string | null;
  termination_reason?: string | null;
  campaign_id?: string | null;
  agent_id?: string | null;
  phone_number: string;
  provider: ProviderType;
  state: CallState;
  duration: number;
  transcript?: TranscriptDocument | null;
  recording?: CallRecordingInfo | null;
  models?: CallModelInfo | null;
  answers?: QuestionAnswer[];
  last_interest_status?: InterestStatus | null;
  created_at: string;
  updated_at: string;
}

export interface ActiveCallItem {
  call_id: string;
  phone_number: string;
  provider: ProviderType;
  state: CallState;
  duration: number;
  agent_id?: string | null;
}

export interface ActiveCallsResponse {
  active_count: number;
  calls: ActiveCallItem[];
}

export interface QueueResponse {
  queued_count: number;
  is_running: boolean;
  stop_requested: boolean;
}

// ============================================================
// STATS & METRICS
// ============================================================
export interface ProviderStats {
  total: number;
  completed: number;
  failed: number;
}

export interface StatsResponse {
  total_calls: number;
  queued: number;
  active: number;
  completed: number;
  failed: number;
  busy: number;
  no_answer: number;
  average_duration_seconds: number;
  vobiz: ProviderStats;
  plivo: ProviderStats;
  mock: ProviderStats;
}

export interface ProviderBreakdownResponse {
  vobiz: ProviderStats;
  plivo: ProviderStats;
  mock: ProviderStats;
}

// ============================================================
// INTEREST & CRM
// ============================================================
export interface FollowupInfo {
  category_id: number;
  name: string;
  description?: string;
  requires_followup: boolean;
  action?: string;
  suggested_scheduled_at?: string;
  matched_utterance?: string;
}

export interface InterestAnalysisDocument {
  analysis_id: string;
  call_id: string;
  agent_id?: string | null;
  contact_id?: string | null;
  status: InterestStatus;
  confidence_score: number;
  reasoning?: string | null;
  rule_applied?: string | null;
  signals?: string[];
  languages?: string[];
  keywords: string[];
  followup?: FollowupInfo | null;
  raw_model_output?: Record<string, any> | null;
  created_at: string;
}

export interface AgentInterestAnalytics {
  interested: number;
  not_interested: number;
  uncertain: number;
  pending: number;
}

export interface ContactDocument {
  contact_id: string;
  tenant_id?: string | null;
  phone_number: string;
  name?: string | null;
  email?: string | null;
  agent_id?: string | null;
  status?: string | null;
  custom_fields: Record<string, any>;
  interaction_count: number;
  last_call_id?: string | null;
  last_call_at?: string | null;
  last_interest_status?: InterestStatus | null;
  created_at: string;
  updated_at: string;
}

export interface CsvImportError {
  row_number: number;
  raw_data: Record<string, any>;
  error: string;
}

export interface CsvImportResponse {
  total_rows: number;
  valid_rows: number;
  invalid_rows: number;
  duplicate_rows: number;
  imported_rows: number;
  skipped_rows: number;
  errors: CsvImportError[];
}

/** One categorized reason from the offline transcript analyzer, with the
 * customer's exact words as evidence. */
export interface LeadReason {
  code?: string;
  reason: string;
  evidence?: string;
}

/** Customer details the transcript analyzer extracted from the call. */
export interface LeadCustomerInfo {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  budget_inr?: number | null;
  budget_raw?: string | null;
  product_interest?: string | null;
  business_type?: string | null;
  preferred_callback_time?: string | null;
}

export interface LeadMetadata {
  classification?: string;
  interest_strength?: string;
  signals?: string[];
  customer_info?: LeadCustomerInfo;
  why_interested?: LeadReason[];
  why_not_interested?: LeadReason[];
  [key: string]: any;
}

export interface LeadDocument {
  id?: string;
  lead_id: string;
  tenant_id?: string | null;
  call_id: string;
  agent_id?: string | null;
  contact_id?: string | null;
  name?: string | null;
  phone_number: string;
  email?: string | null;
  confidence_score: number;
  score?: number;
  reasoning?: string | null;
  // Backend vocabulary (models/lead.py): 'new', 'interested',
  // 'not_interested', 'qualified', 'closed'
  status: string;
  notes?: string | null;
  metadata?: LeadMetadata | null;
  created_at: string;
  updated_at: string;
}

export interface FollowupDocument {
  followup_id: string;
  tenant_id?: string | null;
  lead_id?: string | null;
  call_id?: string | null;
  agent_id?: string | null;
  phone_number: string;
  scheduled_at: string;
  status: FollowupStatus;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================
// CAMPAIGN
// ============================================================
export interface CampaignDocument {
  campaign_id: string;
  name: string;
  description?: string | null;
  agent_id: string;
  questionnaire_id?: string | null;
  phone_numbers: string[];
  concurrency: number;
  provider: ProviderType;
  status: CampaignStatus;
  total_calls: number;
  completed_calls: number;
  failed_calls: number;
  created_at: string;
  updated_at: string;
}

// ============================================================
// MODEL CONFIG & HEALTH
// ============================================================
export interface ModelProviderField {
  name: string;
  label: string;
  type: "text" | "password" | "number" | "select" | "boolean";
  required: boolean;
  default?: any;
  options?: string[];
  placeholder?: string;
  description?: string;
}

export interface ModelProviderSchema {
  provider_id: string;
  name: string;
  description?: string;
  model_type: ModelType;
  fields: ModelProviderField[];
}

export interface ModelConfigDocument {
  config_id?: string;
  model_type: ModelType;
  provider: string;
  is_active: boolean;
  is_draft?: boolean;
  credentials_configured?: boolean;
  parameters: Record<string, any>;
  source?: "database" | "environment" | "fallback";
  created_at?: string;
  updated_at?: string;
}

export interface ValidationResponse {
  valid: boolean;
  errors: string[];
}

export interface ConnectivityTestResponse {
  reachable: boolean;
  latency_ms?: number;
  message?: string;
  details?: Record<string, any>;
}

export interface ServiceHealthStatus {
  status: "ok" | "degraded" | "unhealthy";
  url?: string;
  details?: string;
  model?: string;
  available_models?: string[];
}

export interface SystemHealthResponse {
  status: string;
  service?: string;
  controller?: "ok" | "degraded" | "unhealthy" | string;
  database?: {
    type: string;
    status: string;
  };
  redis?: {
    status: string;
  };
  storage?: {
    provider: string;
    bucket: string;
    status: string;
  };
  dograh?: {
    healthy: {
      reachable: boolean;
      status: string;
      detail?: Record<string, any>;
    };
  };
  voice_ai?: {
    status: string;
    stt: string;
    tts: string;
    llm: string;
  };
  telephony?: {
    provider?: string;
    configured?: boolean;
    from_number?: string | null;
    vobiz?: {
      configured: boolean;
      from_number?: string | null;
      status: string;
    };
    twilio?: {
      configured: boolean;
      from_number?: string | null;
      status: string;
    };
  };
  // Legacy compatibility fields
  mongodb?: "ok" | "degraded" | "unhealthy";
  stt?: ServiceHealthStatus;
  tts?: ServiceHealthStatus;
  llm?: ServiceHealthStatus;
  interest_model?: ServiceHealthStatus;
  providers?: {
    vobiz: string;
    twilio?: string;
    plivo?: string;
    mock?: string;
  };
}

export interface SystemInfoResponse {
  app: string;
  version: string;
  status: string;
  stt_target: string;
  tts_target: string;
  llm_target: string;
}
