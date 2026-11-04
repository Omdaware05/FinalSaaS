import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Drawer } from '../../components/ui/Drawer';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Switch } from '../../components/ui/Switch';
import { agentsApi } from '../../services/api/agents';
import { questionnairesApi } from '../../services/api/questionnaires';
import { voiceApi, VoiceProvider, VoiceItem } from '../../services/api/voice';
import { useToast } from '../../app/providers/ToastProvider';
import { useBusiness } from '../../app/providers/BusinessProvider';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AgentDocument, ProviderType, QuestionnaireDocument } from '../../types/api';
import {
  Save,
  Volume2,
  Play,
  Pause,
  Check,
  CheckCircle2,
  Search,
  Sliders,
  Radio,
  AudioLines,
  FileQuestion,
  Phone,
  Key,
  Lock,
  Eye,
  EyeOff,
  ShieldCheck,
} from 'lucide-react';
import { getErrorMessage } from '../../services/api/client';

export interface AgentFormDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  agent?: AgentDocument | null;
  onSuccess: () => void;
}

export const AgentFormDrawer: React.FC<AgentFormDrawerProps> = ({
  isOpen,
  onClose,
  agent,
  onSuccess,
}) => {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { businesses, selectedBusinessId, assignAgentToBusiness, getBusinessForAgent } =
    useBusiness();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form states
  const [name, setName] = useState('');
  const [assignedBusinessId, setAssignedBusinessId] = useState<string>('');
  const [description, setDescription] = useState('');
  const [companyName, setCompanyName] = useState('ARB SoftTech');
  const [companyDescription, setCompanyDescription] = useState('Leading provider of AI voice calling and customer engagement automation.');
  const [greetingMessage, setGreetingMessage] = useState('');
  const [isEnabled, setIsEnabled] = useState(true);
  const [defaultLanguage, setDefaultLanguage] = useState('Hindi');
  const [supportedLanguages, setSupportedLanguages] = useState<string[]>([
    'Hindi',
    'English',
    'Hinglish',
  ]);
  const [systemPrompt, setSystemPrompt] = useState(
    'You are a professional and courteous AI calling agent. Speak naturally, keep responses concise (1-2 sentences), answer accurately, and guide the customer effectively.'
  );
  const [concurrency, setConcurrency] = useState(2);
  const [provider, setProvider] = useState<ProviderType>('vobiz');
  const [questionnaireId, setQuestionnaireId] = useState<string>('');

  // Dedicated Agent Telephony Management States
  const [telephonyProvider, setTelephonyProvider] = useState<string>('workspace_default');
  const [telephonyFromNumber, setTelephonyFromNumber] = useState<string>('');
  const [telephonyAuthId, setTelephonyAuthId] = useState<string>('');
  const [telephonyAuthToken, setTelephonyAuthToken] = useState<string>('');
  const [showAuthToken, setShowAuthToken] = useState<boolean>(false);

  // Voice States
  const [ttsProvider, setTtsProvider] = useState<string>('sarvam');
  const [voiceId, setVoiceId] = useState<string>('shubh');
  const [voiceName, setVoiceName] = useState<string>('Shubh - Northern Conversational');
  const [voiceGender, setVoiceGender] = useState<string>('male');
  const [speakingSpeed, setSpeakingSpeed] = useState<number>(1.0);
  const [voiceStyle, setVoiceStyle] = useState<string>(
    'Friendly + Professional + Conversational'
  );
  const [selectedGender, setSelectedGender] = useState<string>('all');
  const [voiceSearch, setVoiceSearch] = useState<string>('');
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Queries
  const { data: questionnaires = [] } = useQuery({
    queryKey: ['questionnaires'],
    queryFn: () => questionnairesApi.getQuestionnaires(),
    enabled: isOpen,
  });

  const { data: voiceProviders = [] } = useQuery({
    queryKey: ['voice-providers'],
    queryFn: () => voiceApi.getProviders(),
    enabled: isOpen,
  });

  const { data: voicesResponse, isLoading: voicesLoading } = useQuery({
    queryKey: ['provider-voices', ttsProvider, selectedGender, voiceSearch],
    queryFn: () =>
      voiceApi.getVoices(ttsProvider, {
        gender: selectedGender === 'all' ? undefined : selectedGender,
        search: voiceSearch.trim() || undefined,
      }),
    enabled: isOpen,
  });

  const voices: VoiceItem[] = voicesResponse?.voices || [];
  const [displayLimit, setDisplayLimit] = useState<number>(60);

  useEffect(() => {
    setDisplayLimit(60);
  }, [ttsProvider, selectedGender, voiceSearch]);

  const visibleVoices = useMemo(() => {
    const sliced = voices.slice(0, displayLimit);
    if (voiceId && !sliced.some((v) => v.voice_id === voiceId)) {
      const activeVoice = voices.find((v) => v.voice_id === voiceId);
      if (activeVoice) {
        return [activeVoice, ...sliced];
      }
    }
    return sliced;
  }, [voices, displayLimit, voiceId]);

  // Reset form or populate from existing agent
  useEffect(() => {
    if (agent) {
      setName(agent.name || '');
      setDescription(agent.description || agent.purpose || '');
      setCompanyName(agent.company_name || 'ARB SoftTech');
      setCompanyDescription(agent.company_description || agent.purpose || agent.description || 'Leading provider of AI voice calling and customer engagement automation.');
      setGreetingMessage(agent.greeting_message || '');
      setIsEnabled(agent.is_enabled ?? true);
      setDefaultLanguage(agent.default_language || 'Hindi');
      setSupportedLanguages(
        agent.supported_languages || ['Hindi', 'English', 'Hinglish']
      );
      setSystemPrompt(agent.system_prompt || agent.instructions || '');
      setConcurrency(agent.concurrency || 2);
      setProvider(agent.provider || 'vobiz');
      setQuestionnaireId(agent.questionnaire_id || '');
      const existingBiz = getBusinessForAgent(agent.agent_id);
      setAssignedBusinessId(existingBiz?.id || '');

      // Load voice config if present
      const isSarvamVoice = (vid?: string) => {
        if (!vid) return false;
        const v = vid.toLowerCase();
        return (
          ['shubh', 'shreya', 'aditya', 'priya', 'neha', 'rahul', 'pooja', 'rohan', 'simran', 'kavya', 'amit', 'dev', 'ishita', 'meera', 'pavithra', 'mahesh', 'advait', 'anand', 'sunny', 'mani', 'gokul', 'vijay', 'shruti', 'suhani', 'mohit', 'kavitha', 'rehan', 'soham', 'rupali'].some((s) => v.includes(s)) ||
          (!v.startsWith('hm_') && !v.startsWith('hf_') && !v.startsWith('dg_'))
        );
      };

      if (agent.tts_provider?.toLowerCase() === 'sarvam' || isSarvamVoice(agent.voice_id)) {
        setTtsProvider('sarvam');
      } else if (agent.tts_provider?.toLowerCase() === 'dograh') {
        setTtsProvider('dograh');
      } else {
        setTtsProvider('sarvam');
      }

      if (agent.voice_id) setVoiceId(agent.voice_id);
      if (agent.voice_name) setVoiceName(agent.voice_name);
      if (agent.voice_gender) setVoiceGender(agent.voice_gender);
      if (agent.speaking_speed) setSpeakingSpeed(agent.speaking_speed);
      if (agent.voice_style) setVoiceStyle(agent.voice_style);

      // Load dedicated telephony configuration
      setTelephonyProvider(agent.telephony_provider || 'workspace_default');
      setTelephonyFromNumber(agent.telephony_from_number || '');
      setTelephonyAuthId(agent.telephony_auth_id || '');
      setTelephonyAuthToken(agent.telephony_auth_token || '');
      setShowAuthToken(false);
    } else {
      setName('');
      setDescription('');
      setCompanyName('ARB SoftTech');
      setCompanyDescription('Leading provider of AI voice calling and customer engagement automation.');
      setGreetingMessage('');
      setIsEnabled(true);
      setDefaultLanguage('Hindi');
      setSupportedLanguages(['Hindi', 'English', 'Hinglish']);
      setSystemPrompt(
        'You are a professional and courteous AI calling agent. Speak naturally, keep responses concise (1-2 sentences), answer accurately, and guide the customer effectively.'
      );
      setConcurrency(2);
      setProvider('vobiz');
      setQuestionnaireId('');
      setAssignedBusinessId(
        selectedBusinessId === 'all' ? businesses[0]?.id || '' : selectedBusinessId
      );
      setTtsProvider('sarvam');
      setVoiceId('shubh');
      setVoiceName('Shubh - Northern Conversational (Sarvam AI)');
      setVoiceGender('male');
      setSpeakingSpeed(1.0);
      setVoiceStyle('Friendly + Professional + Conversational');

      // Default telephony configuration
      setTelephonyProvider('workspace_default');
      setTelephonyFromNumber('');
      setTelephonyAuthId('');
      setTelephonyAuthToken('');
      setShowAuthToken(false);
    }
  }, [agent, isOpen, selectedBusinessId, businesses]);

  // Stop audio on unmount or drawer close
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      setPlayingVoiceId(null);
    };
  }, [isOpen]);

  const handleTogglePlay = (e: React.MouseEvent, voice: VoiceItem) => {
    e.stopPropagation();
    if (!voice.preview_url) {
      toast.error('No audio preview available for this voice');
      return;
    }

    if (playingVoiceId === voice.voice_id) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      setPlayingVoiceId(null);
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    try {
      const audioUrl = voiceApi.getPreviewAudioUrl(voice.preview_url);
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      setPlayingVoiceId(voice.voice_id);

      audio.play().catch((err) => {
        console.warn('Audio play notice:', err);
        setPlayingVoiceId(null);
      });

      audio.onended = () => {
        setPlayingVoiceId(null);
        audioRef.current = null;
      };
      audio.onerror = () => {
        setPlayingVoiceId(null);
        audioRef.current = null;
      };
    } catch (err) {
      setPlayingVoiceId(null);
    }
  };

  const handleSelectVoice = (voice: VoiceItem) => {
    setVoiceId(voice.voice_id);
    setVoiceName(voice.name);
    setVoiceGender(voice.gender || 'neutral');
  };

  const selectedQuestionnaire = useMemo(() => {
    return questionnaires.find((q) => q.questionnaire_id === questionnaireId);
  }, [questionnaires, questionnaireId]);

  const formatQuestionnaireScript = (q: QuestionnaireDocument): string => {
    if (!q || !q.questions || q.questions.length === 0) return '';
    const lines = [
      `### MANDATORY QUESTIONNAIRE SCRIPT (${q.title.toUpperCase()}):`,
      `You must conduct the following conversational questionnaire with the caller during this call:`,
      ...q.questions.map((item, idx) => {
        const ref = item.expected_answer
          ? `\n   - Expected Answer / Reference: "${item.expected_answer}"`
          : item.options && item.options.length > 0
          ? ` [Options: ${item.options.join(', ')}]`
          : '';
        return `${idx + 1}. Question: "${item.text}"${ref}`;
      }),
      ``,
      `Rules for conducting the questionnaire:`,
      `- Ask exactly one question at a time naturally in the caller's language.`,
      `- The Expected Answer / Reference is STRICTLY internal context for you to interpret customer responses. NEVER speak phrases like "Expected answer is..." to the customer.`,
      `- Understand caller responses semantically and flexibly — do NOT expect an exact textual match (for example, if expected answer is "गहू / हरभरा / चणा / मका" and the caller says "मी यंदा गहू करणार आहे", recognize Wheat and proceed accordingly).`,
      `- Listen attentively, warmly acknowledge the caller's response, and proceed naturally through the conversational script.`,
      `- If the caller asks clarifying questions or needs product information, answer politely and then return to the script flow.`,
    ];
    return lines.join('\n');
  };

  const handleQuestionnaireChange = (newQId: string) => {
    setQuestionnaireId(newQId);
    const selectedQ = questionnaires.find((q) => q.questionnaire_id === newQId);

    if (selectedQ) {
      const scriptBlock = formatQuestionnaireScript(selectedQ);
      // Remove any previously injected questionnaire script block cleanly
      const cleanedPrompt = systemPrompt.replace(/\n\n### MANDATORY QUESTIONNAIRE SCRIPT[\s\S]*?(?=\n\n[A-Z#]|$)/g, '').trim();
      setSystemPrompt(`${cleanedPrompt}\n\n${scriptBlock}`);
      toast.info('Questionnaire Connected', `Injected questions from "${selectedQ.title}" into system prompt.`);
    } else {
      // Clean up previous questionnaire script block if user switched back to none
      const cleanedPrompt = systemPrompt.replace(/\n\n### MANDATORY QUESTIONNAIRE SCRIPT[\s\S]*?(?=\n\n[A-Z#]|$)/g, '').trim();
      if (cleanedPrompt.length > 0) {
        setSystemPrompt(cleanedPrompt);
      }
    }
  };

  const handleInjectScript = () => {
    const selectedQ = questionnaires.find((q) => q.questionnaire_id === questionnaireId);
    if (!selectedQ) {
      toast.warning('Please select a questionnaire first');
      return;
    }
    const scriptBlock = formatQuestionnaireScript(selectedQ);
    const cleanedPrompt = systemPrompt.replace(/\n\n### MANDATORY QUESTIONNAIRE SCRIPT[\s\S]*?(?=\n\n[A-Z#]|$)/g, '').trim();
    setSystemPrompt(`${cleanedPrompt}\n\n${scriptBlock}`);
    toast.success('Script Connected', `Synchronized questions from "${selectedQ.title}" into system prompt.`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Agent name is required');
      return;
    }
    if (!systemPrompt.trim()) {
      toast.error('System prompt instructions are required');
      return;
    }

    setIsSubmitting(true);
    const trimmedDesc = description.trim();
    const trimmedName = name.trim();
    const rolePurpose = (trimmedDesc || trimmedName).slice(0, 1024);

    const payload = {
      name: trimmedName,
      purpose: rolePurpose,
      instructions: systemPrompt.trim(),
      description: trimmedDesc ? trimmedDesc.slice(0, 1024) : undefined,
      company_name: companyName.trim() || undefined,
      company_description: companyDescription.trim() || undefined,
      greeting_message: greetingMessage.trim() || undefined,
      is_enabled: isEnabled,
      default_language: defaultLanguage,
      supported_languages: supportedLanguages,
      system_prompt: systemPrompt.trim(),
      concurrency: Number(concurrency),
      provider,
      questionnaire_id: questionnaireId || undefined,
      tenant_id: assignedBusinessId || undefined,
      business_id: assignedBusinessId || undefined,

      // TTS and Voice Engine Settings
      tts_provider: ttsProvider,
      voice_id: voiceId,
      voice_name: voiceName,
      voice_gender: voiceGender,
      speaking_speed: speakingSpeed,
      voice_style: voiceStyle,
      language_mode: 'auto_match',
      primary_language: 'multi',
      allowed_topics: [],
      restricted_topics: [],
      behavior_rules: [],
      stt_config: agent?.stt_config || {},
      tts_config: agent?.tts_config || {},
      llm_config: agent?.llm_config || {},

      // Dedicated Agent Telephony Configuration
      telephony_provider: telephonyProvider,
      telephony_from_number: telephonyFromNumber.trim() || undefined,
      telephony_auth_id: telephonyAuthId.trim() || undefined,
      telephony_auth_token: telephonyAuthToken && !telephonyAuthToken.includes('•') ? telephonyAuthToken.trim() : undefined,
    };

    try {
      if (agent?.agent_id) {
        await agentsApi.updateAgent(agent.agent_id, payload);
        if (assignedBusinessId) {
          assignAgentToBusiness(assignedBusinessId, agent.agent_id);
        }
        sessionStorage.setItem('last_selected_agent_id', agent.agent_id);
        toast.success('Agent Updated', `${name} updated successfully.`);
      } else {
        const created = await agentsApi.createAgent(payload);
        const newAgentId = created.agent_id || (created as any).id;
        if (assignedBusinessId && newAgentId) {
          assignAgentToBusiness(assignedBusinessId, newAgentId);
        }
        if (newAgentId) {
          sessionStorage.setItem('last_selected_agent_id', newAgentId);
        }
        toast.success(
          'Agent Created',
          `${name} created with Dograh ${ttsProvider.toUpperCase()} voice (${voiceName}).`
        );
      }
      await queryClient.invalidateQueries({ queryKey: ['agents'] });
      await queryClient.invalidateQueries({ queryKey: ['global-stats'] });
      await queryClient.invalidateQueries({ queryKey: ['stats'] });
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error('Failed to save agent', getErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title={agent ? `Edit Agent: ${agent.name}` : 'Create New AI Voice Agent'}
      subtitle="Configure autonomous voice agent parameters, Dograh TTS voice engine, and call behavior."
      width="xl"
    >
      <form onSubmit={handleSubmit} className="space-y-6 pb-6">
        {/* Section 1: Business Assignment & Basic Info */}
        <div className="space-y-3.5">
          <h4 className="text-xs font-bold text-slate-700 dark:text-zinc-300 uppercase tracking-wider">
            1. Client Business & Identity
          </h4>

          <Select
            label="Client Business Account"
            value={assignedBusinessId}
            onChange={(e) => setAssignedBusinessId(e.target.value)}
          >
            <option value="">-- No Specific Business (Global Workspace) --</option>
            {businesses.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} ({b.industry})
              </option>
            ))}
          </Select>

          <Input
            label="Agent Name"
            placeholder="e.g. Sales Consultation Agent"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Role / Operational Purpose
              </label>
              <span
                className={`text-[11px] font-mono ${
                  description.length >= 1024
                    ? 'text-rose-500 font-bold'
                    : description.length > 800
                    ? 'text-amber-500 font-medium'
                    : 'text-slate-400 dark:text-zinc-500'
                }`}
              >
                {description.length} / 1024 characters
              </span>
            </div>
            <textarea
              rows={3}
              maxLength={1024}
              placeholder="e.g. Inbound inquiry qualification, appointment booking, and customer support consultation..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full p-2.5 text-xs rounded-xl bg-white dark:bg-white/[0.04] border border-slate-300/80 dark:border-white/[0.08] text-slate-900 dark:text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-colors leading-relaxed"
            />
            <p className="text-[11px] text-slate-400 dark:text-neutral-500">
              High-level operational role and scope of the agent (supports up to 1,024 characters).
            </p>
          </div>

          {/* Company Representation & Dynamic LLM Greeting Card */}
          <div className="p-3.5 rounded-xl bg-gradient-to-br from-orange-500/[0.05] via-amber-500/[0.03] to-transparent border border-orange-500/20 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-slate-800 dark:text-zinc-200">
                  Company Identity & Dynamic LLM Greeting
                </span>
              </div>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                Dynamic LLM Generation
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-zinc-400 leading-relaxed">
              The AI agent dynamically generates its opening greeting and conversation through the LLM based on its role prompt and system instructions.
            </p>

            <div className="space-y-2.5 pt-1">
              <Input
                label="Company / Brand Name"
                placeholder="e.g. ARB SoftTech"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
              />

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  What Company Does / Offerings & Purpose
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. We provide enterprise AI voice calling and customer engagement automation."
                  value={companyDescription}
                  onChange={(e) => setCompanyDescription(e.target.value)}
                  className="w-full p-2.5 text-xs rounded-xl bg-white dark:bg-white/[0.04] border border-slate-300/80 dark:border-white/[0.08] text-slate-900 dark:text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-colors leading-relaxed"
                />
                <p className="text-[10px] text-slate-400 dark:text-neutral-500">
                  Included in the agent's role prompt so the LLM opens the call and speaks about the company following your system instructions.
                </p>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Instant Call Opening Greeting (Spoken on Answer)
                  </label>
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-0.5">
                    ⚡ 0s Pickup Latency
                  </span>
                </div>
                <textarea
                  rows={2}
                  placeholder="e.g. नमस्कार जी, मैं ARB SoftTech से Yash बात कर रहा हूँ। क्या आप एडमिशन और कोर्स की जानकारी चाहते हैं?"
                  value={greetingMessage}
                  onChange={(e) => setGreetingMessage(e.target.value)}
                  className="w-full p-2.5 text-xs rounded-xl bg-white dark:bg-white/[0.04] border border-slate-300/80 dark:border-white/[0.08] text-slate-900 dark:text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-colors leading-relaxed"
                />
                <p className="text-[10px] text-slate-400 dark:text-neutral-500">
                  Spoken instantly by TTS when the customer answers the phone, eliminating dead silence and starting the conversation immediately.
                </p>
              </div>
            </div>
          </div>

          <div className="pt-1">
            <Switch
              label="Enable Voice Agent"
              description="Active agents can immediately handle outbound and inbound calls."
              checked={isEnabled}
              onChange={setIsEnabled}
            />
          </div>
        </div>

        {/* Section 2: Dograh TTS Voices & Audio Examples */}
        <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-white/[0.07]">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-xs font-bold text-slate-700 dark:text-neutral-300 uppercase tracking-wider flex items-center gap-1.5">
                <AudioLines className="w-3.5 h-3.5 text-orange-400" />
                2. Sarvam & Dograh AI TTS Voice Engine & Audio Examples
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-neutral-400 mt-0.5">
                Select from verified AI TTS voices provided by Dograh. Listen to voice samples before selecting.
              </p>
            </div>
            {voiceName && (
              <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800/40 flex items-center gap-1">
                <Check className="w-3 h-3" /> Selected: {voiceName}
              </span>
            )}
          </div>

          {/* Provider Tabs */}
          <div>
            <label className="text-[11px] font-semibold text-slate-600 dark:text-neutral-400 mb-1.5 block">
              TTS Provider Engine
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'dograh', label: 'Dograh Neural', desc: 'Indian accents & Hindi' },
                { id: 'sarvam', label: 'Sarvam AI', desc: 'Indian regional languages' },
              ].map((prov) => {
                const isSelected = ttsProvider === prov.id;
                return (
                  <button
                    key={prov.id}
                    type="button"
                    onClick={() => {
                      setTtsProvider(prov.id);
                      setPlayingVoiceId(null);
                      if (audioRef.current) audioRef.current.pause();
                    }}
                    className={`p-2.5 rounded-xl text-left border transition-all text-xs ${
                      isSelected
                        ? 'border-orange-500 bg-orange-500/10 text-orange-400 shadow-sm'
                        : 'border-slate-200 dark:border-white/[0.08] bg-slate-50/50 dark:bg-white/[0.03] hover:bg-slate-100 dark:hover:bg-white/[0.06]'
                    }`}
                  >
                    <div
                      className={`font-semibold ${
                        isSelected
                          ? 'text-orange-400'
                          : 'text-slate-800 dark:text-neutral-200'
                      }`}
                    >
                      {prov.label}
                    </div>
                    <div className="text-[10px] text-slate-500 dark:text-neutral-400 truncate">
                      {prov.desc}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Filters: Gender & Search */}
          <div className="flex flex-col sm:flex-row items-center gap-2">
            <div className="relative flex-1 w-full">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={voiceSearch}
                onChange={(e) => setVoiceSearch(e.target.value)}
                placeholder="Search voices by name, accent, or style..."
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] text-slate-900 dark:text-white placeholder:text-neutral-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500/20"
              />
            </div>
            <div className="flex items-center gap-1 self-start sm:self-auto">
              {['all', 'female', 'male'].map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setSelectedGender(g)}
                  className={`px-2.5 py-1 text-xs rounded-md capitalize font-medium transition-colors ${
                    selectedGender === g
                      ? 'bg-slate-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                      : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-zinc-700'
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          {/* Voice Counter & Summary */}
          <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-zinc-400 px-0.5">
            <span>
              {voicesLoading ? (
                'Loading voices...'
              ) : (
                <>
                  <strong className="text-slate-700 dark:text-zinc-200">{voices.length}</strong> voices available for{' '}
                  <span className="uppercase font-semibold">{ttsProvider}</span>
                </>
              )}
            </span>
            {voices.length > displayLimit && (
              <span>
                Showing {visibleVoices.length} of {voices.length}
              </span>
            )}
          </div>

          {/* Voice Catalog List with Example Description & Audio Sample Button */}
          <div className="border border-slate-200 dark:border-white/[0.08] rounded-xl overflow-hidden bg-slate-50/40 dark:bg-white/[0.02]">
            <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-white/[0.05] p-1">
              {voicesLoading ? (
                <div className="p-8 text-center text-xs text-slate-500 dark:text-neutral-400">
                  <div className="inline-block animate-spin w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full mb-2" />
                  <div>Loading verified voices from {ttsProvider}...</div>
                </div>
              ) : voices.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500 dark:text-neutral-400">
                  No voices match your search query. Try another term or switch provider.
                </div>
              ) : (
                <>
                  {visibleVoices.map((v) => {
                    const isSelected = voiceId === v.voice_id;
                    const isPlaying = playingVoiceId === v.voice_id;

                    return (
                      <div
                        key={v.voice_id}
                        onClick={() => handleSelectVoice(v)}
                        className={`p-2.5 rounded-xl cursor-pointer transition-all flex items-start justify-between gap-3 ${
                          isSelected
                            ? 'bg-orange-500/10 border border-orange-500/30 shadow-sm'
                            : 'hover:bg-white dark:hover:bg-white/[0.04] border border-transparent'
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span
                              className={`font-semibold text-xs ${
                                isSelected
                                  ? 'text-orange-400'
                                  : 'text-slate-900 dark:text-neutral-100'
                              }`}
                            >
                              {v.name}
                            </span>
                            <span className="text-[10px] uppercase font-bold px-1.5 py-0.2 rounded bg-slate-100 dark:bg-white/[0.06] text-slate-600 dark:text-neutral-300">
                              {v.gender || 'neutral'}
                            </span>
                            {v.accent && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-orange-500/10 text-orange-400 border border-orange-500/20">
                                Accent: {v.accent.toUpperCase()}
                              </span>
                            )}
                            {v.language && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 dark:bg-white/[0.06] text-slate-500 dark:text-neutral-400">
                                {v.language.toUpperCase()}
                              </span>
                            )}
                          </div>

                          {/* Suited for / Example Description */}
                          {v.description && (
                            <p className="text-[11px] text-slate-600 dark:text-neutral-400 mt-1 leading-snug">
                              <span className="font-medium text-slate-700 dark:text-neutral-300">
                                Example use case:{' '}
                              </span>
                              {v.description}
                            </p>
                          )}
                        </div>

                        {/* Right: Audio Sample Player Button & Select Marker */}
                        <div className="flex items-center gap-2 flex-shrink-0 pt-0.5">
                          {v.preview_url && (
                            <button
                              type="button"
                              onClick={(e) => handleTogglePlay(e, v)}
                              className={`px-2 py-1 rounded-lg text-[11px] font-medium flex items-center gap-1 transition-all ${
                                isPlaying
                                  ? 'bg-orange-500 text-white animate-pulse'
                                  : 'bg-slate-200/80 hover:bg-slate-300 dark:bg-white/[0.06] dark:hover:bg-white/[0.1] text-slate-800 dark:text-neutral-200'
                              }`}
                              title="Listen to voice example audio sample"
                            >
                              {isPlaying ? (
                                <>
                                  <Pause className="w-3 h-3" />
                                  <span>Playing</span>
                                </>
                              ) : (
                                <>
                                  <Play className="w-3 h-3 fill-current" />
                                  <span>Sample</span>
                                </>
                              )}
                            </button>
                          )}

                          <div
                            className={`w-4 h-4 rounded-full flex items-center justify-center border ${
                              isSelected
                                ? 'bg-orange-500 border-orange-500 text-white'
                                : 'border-slate-300 dark:border-white/[0.2]'
                            }`}
                          >
                            {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {voices.length > displayLimit && (
                    <div className="p-2 text-center">
                      <button
                        type="button"
                        onClick={() => setDisplayLimit((prev) => prev + 60)}
                        className="w-full py-1.5 px-3 text-xs font-medium text-orange-400 bg-orange-500/10 hover:bg-orange-500/15 rounded-xl transition-colors"
                      >
                        Load more voices (+60 of {voices.length - displayLimit} more)
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Speed & Style Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
            <div>
              <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-neutral-300 mb-1">
                <span>Speaking Speed:</span>
                <span className="font-mono text-orange-400 font-bold">
                  {speakingSpeed.toFixed(1)}x
                </span>
              </div>
              <input
                type="range"
                min="0.7"
                max="1.5"
                step="0.1"
                value={speakingSpeed}
                onChange={(e) => setSpeakingSpeed(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-slate-200 dark:bg-white/[0.08] rounded-lg appearance-none cursor-pointer accent-orange-500"
              />
              <div className="flex justify-between text-[10px] text-slate-400 dark:text-neutral-500 mt-0.5">
                <span>Slower (0.7x)</span>
                <span>Normal (1.0x)</span>
                <span>Faster (1.5x)</span>
              </div>
            </div>

            <Select
              label="Conversational Style Persona"
              value={voiceStyle}
              onChange={(e) => setVoiceStyle(e.target.value)}
            >
              <option value="Friendly + Professional + Conversational">
                Friendly + Professional + Conversational
              </option>
              <option value="Warm + Empathetic + Supportive">
                Warm + Empathetic + Supportive
              </option>
              <option value="Energetic + Confident + Sales Oriented">
                Energetic + Confident + Sales Oriented
              </option>
              <option value="Calm + Reassuring + Clear">
                Calm + Reassuring + Clear
              </option>
            </Select>
          </div>
        </div>

        {/* Section 3: Primary Language */}
        <div className="space-y-3.5 pt-4 border-t border-slate-200 dark:border-zinc-800">
          <h4 className="text-xs font-bold text-slate-700 dark:text-zinc-300 uppercase tracking-wider">
            3. Primary Spoken Language
          </h4>

          <Select
            label="Spoken Language for Voice Conversational Model"
            value={defaultLanguage}
            onChange={(e) => setDefaultLanguage(e.target.value)}
          >
            <option value="Hindi">Hindi (हिंदी) - Primary Indian Voice Dialect</option>
            <option value="English">English - Global Indian / International Accent</option>
            <option value="Hinglish">Hinglish - Mixed Conversational Hindi & English</option>
            <option value="Marathi">Marathi (मराठी) - Regional Western India Dialect</option>
          </Select>
        </div>

        {/* Section 4: Dedicated Telephony & Outbound Caller ID Management */}
        <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-zinc-800">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-700 dark:text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-orange-500" />
              4. Dedicated Agent Telephony & Caller ID
            </h4>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-400 border border-orange-500/20">
              Per-Agent Routing
            </span>
          </div>

          <p className="text-[11px] text-slate-500 dark:text-neutral-400 -mt-1">
            Assign a dedicated phone number (Caller ID) and carrier API credentials to this agent. All calls made by this agent will route through this specific number.
          </p>

          <div className="p-3.5 rounded-2xl border border-slate-200/80 dark:border-white/[0.08] bg-slate-50/50 dark:bg-white/[0.02] space-y-3.5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Select
                label="Telephony Carrier Provider"
                value={telephonyProvider}
                onChange={(e) => setTelephonyProvider(e.target.value)}
              >
                <option value="workspace_default">Workspace Default (Global Carrier)</option>
                <option value="vobiz">VoBiz Telephony (High Performance SIP Trunk)</option>
                <option value="twilio">Twilio Telephony (US & Global Telecom)</option>
              </Select>

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 mb-1.5">
                  <Phone className="w-3.5 h-3.5 text-emerald-500" />
                  Dedicated Phone Number (Caller ID)
                </label>
                <input
                  type="text"
                  placeholder="+918065354620 or +13344895368"
                  value={telephonyFromNumber}
                  onChange={(e) => setTelephonyFromNumber(e.target.value)}
                  className="w-full p-2.5 text-xs rounded-xl bg-white dark:bg-white/[0.04] border border-slate-300/80 dark:border-white/[0.08] text-slate-900 dark:text-white font-mono placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-colors"
                />
                <p className="text-[10px] text-slate-400 dark:text-neutral-500 mt-1">
                  E.164 caller ID number assigned to this agent (leave blank to use default).
                </p>
              </div>
            </div>

            {/* Carrier Credentials Override Box */}
            <div className="p-3 rounded-xl bg-slate-100/70 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-800 dark:text-zinc-200 flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5 text-amber-500" />
                  Carrier API Credentials (Optional Override)
                </span>
                <span className="text-[10px] text-slate-400 dark:text-neutral-500 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3 text-emerald-400" /> Secure Token Storage
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1 block">
                    Carrier Auth ID / Account SID
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. MA_I7SRPD7B or AC..."
                    value={telephonyAuthId}
                    onChange={(e) => setTelephonyAuthId(e.target.value)}
                    className="w-full p-2 text-xs rounded-lg bg-white dark:bg-black/30 border border-slate-300 dark:border-white/[0.08] text-slate-900 dark:text-white font-mono placeholder:text-neutral-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1 block">
                    Carrier Auth Token / API Secret
                  </label>
                  <div className="relative">
                    <input
                      type={showAuthToken ? 'text' : 'password'}
                      placeholder={
                        agent?.has_custom_telephony_token
                          ? '•••••••• (Leave blank to keep saved token)'
                          : 'Enter carrier auth secret token'
                      }
                      value={telephonyAuthToken}
                      onChange={(e) => setTelephonyAuthToken(e.target.value)}
                      className="w-full p-2 pr-9 text-xs rounded-lg bg-white dark:bg-black/30 border border-slate-300 dark:border-white/[0.08] text-slate-900 dark:text-white font-mono placeholder:text-neutral-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowAuthToken(!showAuthToken)}
                      className="absolute right-2 top-2 text-slate-400 hover:text-slate-600 dark:hover:text-white"
                      title={showAuthToken ? 'Hide token' : 'Show token'}
                    >
                      {showAuthToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Dynamic Routing Summary Badge */}
            <div className="flex items-center gap-2 p-2 rounded-lg bg-orange-500/[0.05] border border-orange-500/15 text-[11px] text-slate-700 dark:text-zinc-300">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              <span>
                {telephonyFromNumber.trim() ? (
                  <>
                    Outbound calls will route via{' '}
                    <strong className="text-orange-400">
                      {telephonyProvider === 'workspace_default' ? 'VoBiz/Twilio' : telephonyProvider.toUpperCase()}
                    </strong>{' '}
                    using dedicated caller ID:{' '}
                    <strong className="font-mono text-emerald-400">{telephonyFromNumber.trim()}</strong>
                  </>
                ) : (
                  <>
                    Using{' '}
                    <strong className="text-orange-400">Workspace Default Telephony</strong> (Caller ID +918065354620).
                  </>
                )}
              </span>
            </div>

            {/* Concurrency Channel Slider */}
            <div className="pt-2 border-t border-slate-200/60 dark:border-white/[0.06]">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1.5">
                <span>Concurrent Call Capacity:</span>
                <span className="font-mono text-slate-900 dark:text-white text-xs font-bold">
                  {concurrency} Channel{concurrency > 1 ? 's' : ''}
                </span>
              </div>
              <input
                type="range"
                min="1"
                max="20"
                value={concurrency}
                onChange={(e) => setConcurrency(parseInt(e.target.value))}
                className="w-full h-1.5 bg-slate-200 dark:bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-orange-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Section 5: System Prompt & Scripted Questionnaire Flow */}
        <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-white/[0.07]">
          <div>
            <h4 className="text-xs font-bold text-slate-700 dark:text-neutral-300 uppercase tracking-wider flex items-center gap-1.5">
              <FileQuestion className="w-3.5 h-3.5 text-orange-400" />
              5. System Prompt & Scripted Questionnaire Flow
            </h4>
            <p className="text-[11px] text-slate-500 dark:text-neutral-400 mt-0.5">
              Define the AI agent's instructions, and choose a questionnaire to connect its questions to the system prompt so the agent asks questions in sequence.
            </p>
          </div>

          {/* Connected Questionnaire Selector Card */}
          <div className="p-3.5 rounded-2xl border border-slate-200/80 dark:border-white/[0.08] bg-slate-50/40 dark:bg-white/[0.03] space-y-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <label className="text-xs font-bold text-slate-800 dark:text-neutral-200 flex items-center gap-1.5">
                <FileQuestion className="w-4 h-4 text-orange-400" />
                Choose Questionnaire Script
              </label>

              {questionnaireId && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full flex items-center gap-1 border border-emerald-500/20">
                    <CheckCircle2 className="w-3 h-3" /> Connected to Prompt
                  </span>
                  <button
                    type="button"
                    onClick={handleInjectScript}
                    className="text-[10px] font-semibold text-orange-400 hover:text-orange-300 underline underline-offset-2 flex items-center gap-1"
                    title="Re-synchronize questionnaire script into prompt"
                  >
                    Sync Prompt
                  </button>
                </div>
              )}
            </div>

            <Select
              value={questionnaireId}
              onChange={(e) => handleQuestionnaireChange(e.target.value)}
              className="bg-white dark:bg-white/[0.04] text-xs"
            >
              <option value="">-- No Questionnaire (Dynamic / Free-form Conversation) --</option>
              {questionnaires.map((q) => (
                <option key={q.questionnaire_id} value={q.questionnaire_id}>
                  {q.title} ({q.questions?.length || 0} questions)
                </option>
              ))}
            </Select>

            {/* Questions preview if questionnaire selected */}
            {selectedQuestionnaire && selectedQuestionnaire.questions?.length > 0 && (
              <div className="pt-2 border-t border-slate-100 dark:border-white/[0.06] space-y-1.5">
                <div className="flex items-center justify-between text-[11px] text-slate-600 dark:text-neutral-300">
                  <span className="font-semibold">
                    Questions in "{selectedQuestionnaire.title}":
                  </span>
                  <span className="text-[10px] text-slate-400 dark:text-neutral-500">
                    {selectedQuestionnaire.questions.length} step(s) injected into prompt
                  </span>
                </div>
                <div className="max-h-28 overflow-y-auto space-y-1 pr-1">
                  {selectedQuestionnaire.questions.map((q, idx) => (
                    <div
                      key={q.question_id || idx}
                      className="text-[11px] p-2 rounded-xl bg-white/80 dark:bg-white/[0.04] border border-slate-200/60 dark:border-white/[0.06] text-slate-700 dark:text-neutral-300 flex items-start gap-2"
                    >
                      <span className="font-mono font-bold text-orange-400 shrink-0">
                        Q{idx + 1}.
                      </span>
                      <span className="flex-1 truncate">{q.text}</span>
                      <span
                        className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-slate-100 dark:bg-white/[0.06] text-slate-500 dark:text-neutral-400 shrink-0 max-w-[130px] truncate"
                        title={q.expected_answer || q.type || 'text'}
                      >
                        {q.expected_answer ? `Ref: ${q.expected_answer}` : (q.type || 'text')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* System Prompt Textarea */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-700 dark:text-neutral-300">
                System Prompt Instructions <span className="text-rose-500">*</span>
              </label>
              {questionnaireId && (
                <span className="text-[10px] text-orange-400 font-medium">
                  Connected to Questionnaire
                </span>
              )}
            </div>
            <textarea
              rows={7}
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              className="w-full p-2.5 text-xs rounded-xl bg-white dark:bg-white/[0.04] border border-slate-300 dark:border-white/[0.08] text-slate-900 dark:text-white font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-colors"
              placeholder="Define identity, conversational guidelines, tone, phrasing rules, and questionnaire questions..."
              required
            />
            <p className="text-[11px] text-slate-400 dark:text-zinc-500">
              The AI agent follows these system prompt instructions in real-time to control voice behavior and sequential questioning.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-200 dark:border-zinc-800">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            isLoading={isSubmitting}
            leftIcon={<Save className="w-3.5 h-3.5" />}
          >
            {agent ? 'Update Agent' : 'Create Agent'}
          </Button>
        </div>
      </form>
    </Drawer>
  );
};
