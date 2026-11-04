import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '../../components/layout/PageHeader';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Badge } from '../../components/ui/Badge';
import { useToast } from '../../app/providers/ToastProvider';
import {
  modelLabApi,
  ModelInfo,
  GpuTelemetry,
  RuntimeHealth,
  ModelTestResponse,
  TerminalLogEntry,
  IntentAnalysis,
} from '../../services/api/modelLab';
import {
  Cpu,
  Zap,
  Mic,
  MicOff,
  PhoneCall,
  PhoneOff,
  Play,
  Square,
  RefreshCw,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  Flame,
  Gauge,
  Layers,
  MessageSquare,
  Download,
  Copy,
  ThumbsUp,
  ThumbsDown,
  Volume2,
  StopCircle,
  Terminal as TerminalIcon,
  Trash2,
  ArrowDownCircle,
  Activity,
  Radio,
  Check,
  Phone,
  ShieldCheck,
  Settings2,
  Fan,
  Wind,
  Upload,
  BrainCircuit,
  Target,
  UserCheck,
  UserX,
  ListChecks,
  HelpCircle,
} from 'lucide-react';
import { clsx } from 'clsx';

interface Message {
  speaker: 'user' | 'assistant';
  text: string;
  timestamp: string;
  stt_latency_ms?: number;
  ttft_ms?: number;
  ttfa_ms?: number;
  tokens_per_sec?: number;
  total_latency_ms?: number;
  audio_url?: string;
  audio_status?: 'generating' | 'synthesizing' | 'ready';
}

export const ModelLabPage: React.FC = () => {
  const queryClient = useQueryClient();
  const toast = useToast();

  // Active Mode: Browser Voice Sandbox vs VoBiz Telephony vs Intent Classifier
  const [activeTab, setActiveTab] = useState<'browser' | 'telephony' | 'classifier'>('browser');

  // Model Selection State
  const [selectedStt, setSelectedStt] = useState<string>('whisper-large-v3-turbo');
  const [selectedLlm, setSelectedLlm] = useState<string>('gemma-2-9b-it');
  const [selectedTts, setSelectedTts] = useState<string>('indic-parler-tts');
  const [selectedLang, setSelectedLang] = useState<string>('Auto');

  // Terminal State
  const [terminalFilter, setTerminalFilter] = useState<string>('ALL');
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const terminalEndRef = useRef<HTMLDivElement | null>(null);

  // Session State
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [callId, setCallId] = useState<string | null>(null);
  const [isSessionActive, setIsSessionActive] = useState<boolean>(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [textInput, setTextInput] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  // Live Customer Intent Classifier State
  const [liveIntent, setLiveIntent] = useState<IntentAnalysis | null>(null);

  // Standalone Intent Classifier Workbench State
  const [classifierInput, setClassifierInput] = useState<string>(
    'Caller: नमस्कार, मला 5 एकर शेतीसाठी गहू बियाण्याचे भाव आणि खतांची माहिती हवी आहे.\nSamruddhi: नमस्कार! 5 एकरासाठी 200 किलो बियाणे लागेल. आम्ही सविस्तर माहिती देऊ.'
  );
  const [classifierResult, setClassifierResult] = useState<any | null>(null);
  const [isClassifying, setIsClassifying] = useState<boolean>(false);

  // Audio Recording State
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Telemetry & Outcome State
  const [latestMetrics, setLatestMetrics] = useState<{
    stt_ms?: number;
    ttft_ms?: number;
    ttfa_ms?: number;
    tps?: number;
    total_ms?: number;
  }>({});
  const [callSummary, setCallSummary] = useState<any | null>(null);
  const [interestOutcome, setInterestOutcome] = useState<boolean | null>(null);
  const [leadNotes, setLeadNotes] = useState<string>('');

  // Standalone Model Testing Modal/State
  const [testingModelId, setTestingModelId] = useState<string | null>(null);
  const [testInputText, setTestInputText] = useState<string>('');
  const [testResult, setTestResult] = useState<ModelTestResponse | null>(null);
  const [isTestingModel, setIsTestingModel] = useState<boolean>(false);

  // Telephony State (VoBiz)
  const [vobizAuthId, setVobizAuthId] = useState<string>('');
  const [vobizAuthToken, setVobizAuthToken] = useState<string>('');
  const [vobizPhone, setVobizPhone] = useState<string>('');
  const [vobizEnv, setVobizEnv] = useState<string>('production');
  const [connTestResult, setConnTestResult] = useState<{
    status: string;
    connected: boolean;
    message: string;
  } | null>(null);
  const [isTestingConn, setIsTestingConn] = useState<boolean>(false);
  const [telephonyOutboundNumber, setTelephonyOutboundNumber] = useState<string>('');
  const [telephonyCallStatus, setTelephonyCallStatus] = useState<string | null>(null);
  const [activeTelephonyCallId, setActiveTelephonyCallId] = useState<string | null>(null);
  const [isPlacingCall, setIsPlacingCall] = useState<boolean>(false);

  // 1. Live Models Query (poll every 2.5s)
  const { data: models = [], refetch: refetchModels } = useQuery({
    queryKey: ['model-lab-models'],
    queryFn: () => modelLabApi.getModels(),
    refetchInterval: 2500,
  });

  // 2. Live GPU Telemetry Query (poll every 2s)
  const { data: gpuData } = useQuery({
    queryKey: ['model-lab-gpu'],
    queryFn: () => modelLabApi.getGpuTelemetry(),
    refetchInterval: 2000,
  });

  // 3. System Runtime Health Query
  const { data: runtimeHealth } = useQuery({
    queryKey: ['model-lab-runtime'],
    queryFn: () => modelLabApi.getRuntimeHealth(),
    refetchInterval: 2000,
  });

  // 4. Live Terminal Logs Query (poll every 1.2s)
  const { data: terminalData, refetch: refetchTerminal } = useQuery({
    queryKey: ['model-lab-terminal-logs'],
    queryFn: () => modelLabApi.getTerminalLogs(0),
    refetchInterval: 1200,
  });

  // 5. Telephony Configuration Query
  const { data: telephonyConfig, refetch: refetchTelephonyConfig } = useQuery({
    queryKey: ['model-lab-telephony-config'],
    queryFn: () => modelLabApi.getTelephonyConfig(),
    refetchInterval: 15000,
  });

  useEffect(() => {
    if (telephonyConfig) {
      setVobizAuthId(telephonyConfig.auth_id || '');
      setVobizPhone(telephonyConfig.phone_number || '');
      setVobizEnv(telephonyConfig.environment || 'production');
    }
  }, [telephonyConfig]);

  // Auto-scroll terminal when new logs arrive
  useEffect(() => {
    if (autoScroll && terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [terminalData?.logs, autoScroll]);

  // Model Activation Mutation (Shift/Load)
  const startModelMutation = useMutation({
    mutationFn: (modelId: string) => modelLabApi.startModel(modelId),
    onSuccess: (data, modelId) => {
      toast.success(`Model ${modelId} activated successfully on GPU`);
      refetchModels();
      refetchTerminal();
      queryClient.invalidateQueries({ queryKey: ['model-lab-runtime'] });
      queryClient.invalidateQueries({ queryKey: ['model-lab-gpu'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || `Failed to activate model`);
      refetchTerminal();
    },
  });

  const stopModelMutation = useMutation({
    mutationFn: (modelId: string) => modelLabApi.stopModel(modelId),
    onSuccess: (data, modelId) => {
      toast.info(`Model ${modelId} stopped and VRAM released`);
      refetchModels();
      refetchTerminal();
      queryClient.invalidateQueries({ queryKey: ['model-lab-runtime'] });
      queryClient.invalidateQueries({ queryKey: ['model-lab-gpu'] });
    },
  });

  // Direct Model Shift Handler
  const handleShiftModel = async (modelId: string) => {
    const target = models.find((m) => m.model_id === modelId);
    if (target?.model_type === 'llm') {
      setSelectedLlm(modelId);
    } else if (target?.model_type === 'stt') {
      setSelectedStt(modelId);
    } else if (target?.model_type === 'tts') {
      setSelectedTts(modelId);
    }
    toast.info(`Shifting runtime to ${modelId}...`);
    startModelMutation.mutate(modelId);
  };

  // Clear Terminal Logs
  const handleClearTerminal = async () => {
    try {
      await modelLabApi.clearTerminalLogs();
      refetchTerminal();
      toast.info('Terminal console cleared');
    } catch (err) {
      toast.error('Failed to clear terminal');
    }
  };

  // Copy Terminal Logs
  const handleCopyTerminal = () => {
    if (!terminalData?.logs) return;
    const text = terminalData.logs
      .map((l) => `[${l.timestamp}] [${l.category}] [${l.level}] ${l.message}`)
      .join('\n');
    navigator.clipboard.writeText(text);
    toast.success('Terminal logs copied to clipboard');
  };

  // Start Voice Session
  const handleStartSession = async () => {
    try {
      setIsProcessing(true);
      const res = await modelLabApi.startSession({
        stt_model_id: selectedStt,
        llm_model_id: selectedLlm,
        tts_model_id: selectedTts,
        language: selectedLang,
      });

      setSessionId(res.session_id);
      setCallId(res.call_id);
      setIsSessionActive(true);
      setMessages([]);
      setLiveIntent(null);
      setCallSummary(null);
      setInterestOutcome(null);
      setLeadNotes('');
      toast.success('Conversation session started. Models locked.');
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to start session');
    } finally {
      setIsProcessing(false);
    }
  };

  // End Voice Session
  const handleEndSession = async () => {
    if (!sessionId) return;
    try {
      setIsProcessing(true);
      const res = await modelLabApi.endSession(sessionId, {
        interested: interestOutcome ?? undefined,
        notes: leadNotes,
      });

      setCallSummary(res.summary);
      if (res.summary?.interested !== undefined && interestOutcome === null) {
        setInterestOutcome(res.summary.interested);
      }
      setIsSessionActive(false);
      setSessionId(null);
      toast.success(
        `Session ended. AI Lead Intent: ${res.summary?.classification || 'CLASSIFIED'} (${((res.summary?.confidence || 0.85) * 100).toFixed(0)}%)`
      );
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to end session');
    } finally {
      setIsProcessing(false);
    }
  };

  // Play Latest Synthesized Audio
  const playLatestAudio = () => {
    const url = modelLabApi.getLatestAudioUrl();
    const audio = new Audio(url);
    audio.play().then(() => {
      toast.success('Playing latest complete AI voice audio');
    }).catch((err) => {
      toast.info('Loading latest voice audio...');
    });
  };

  // Standalone Intent Classifier Execution
  const handleClassifyIntent = async (customText?: string) => {
    const text = customText || classifierInput;
    if (!text.trim()) return;
    try {
      setIsClassifying(true);
      const res = await modelLabApi.classifyIntent({ transcript: text, explain: true });
      setClassifierResult(res);
      if (res.classification === 'INTERESTED') {
        toast.success(`Classified: INTERESTED (${(res.confidence * 100).toFixed(0)}%)`, res.reason);
      } else {
        toast.info(`Classified: NOT_INTERESTED (${(res.confidence * 100).toFixed(0)}%)`, res.reason);
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Classification analysis failed');
    } finally {
      setIsClassifying(false);
    }
  };

  // Turn Execution (Text)
  const handleSendTurn = async (customText?: string) => {
    const textToSend = customText || textInput;
    if (!textToSend.trim()) return;

    let activeSid = sessionId;
    if (!activeSid) {
      try {
        const startRes = await modelLabApi.startSession({
          stt_model_id: selectedStt,
          llm_model_id: selectedLlm,
          tts_model_id: selectedTts,
          language: selectedLang,
        });
        activeSid = startRes.session_id;
        setSessionId(startRes.session_id);
        setCallId(startRes.call_id);
        setIsSessionActive(true);
        setLiveIntent(null);
      } catch (err: any) {
        toast.error('Failed to start conversation session');
        return;
      }
    }

    setTextInput('');
    setIsProcessing(true);

    const tempUserMsg: Message = {
      speaker: 'user',
      text: textToSend,
      timestamp: new Date().toLocaleTimeString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    try {
      const turnRes = await modelLabApi.executeTurn(activeSid!, {
        user_text: textToSend,
      });

      if (turnRes.intent_analysis) {
        setLiveIntent(turnRes.intent_analysis);
      }

      let audioUrl: string = turnRes.audio_url
        ? modelLabApi.getAudioUrl(turnRes.audio_url.split('/').pop() || 'latest.wav')
        : modelLabApi.getLatestAudioUrl();
      if (turnRes.audio_base64) {
        audioUrl = `data:audio/wav;base64,${turnRes.audio_base64}`;
      }

      // Automatically play complete synthesized audio
      const audio = new Audio(audioUrl);
      audio.play().catch(() => {});

      const aiMsg: Message = {
        speaker: 'assistant',
        text: turnRes.ai_text,
        timestamp: new Date().toLocaleTimeString(),
        stt_latency_ms: turnRes.metrics.stt_latency_ms,
        ttft_ms: turnRes.metrics.llm_ttft_ms,
        ttfa_ms: turnRes.metrics.tts_ttfa_ms,
        tokens_per_sec: turnRes.metrics.llm_tokens_per_sec,
        total_latency_ms: turnRes.metrics.total_latency_ms,
        audio_url: audioUrl,
        audio_status: 'ready',
      };

      setMessages((prev) => [...prev, aiMsg]);
      setLatestMetrics({
        stt_ms: turnRes.metrics.stt_latency_ms,
        ttft_ms: turnRes.metrics.llm_ttft_ms,
        ttfa_ms: turnRes.metrics.tts_ttfa_ms,
        tps: turnRes.metrics.llm_tokens_per_sec,
        total_ms: turnRes.metrics.total_latency_ms,
      });
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Error executing turn');
    } finally {
      setIsProcessing(false);
    }
  };

  // Barge-In Interruption
  const handleInterrupt = async () => {
    if (!sessionId) return;
    try {
      await modelLabApi.interruptSession(sessionId);
      toast.info('Barge-in: AI generation & speech halted');
    } catch (err) {
      toast.warning('Interruption signal sent');
    }
  };

// Helper: Convert decoded AudioBuffer to standard 16-bit 16kHz mono WAV Blob
function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numChannels = 1;
  const sampleRate = buffer.sampleRate;
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  
  const channelData = buffer.getChannelData(0);
  const wavBuffer = new ArrayBuffer(44 + channelData.length * bytesPerSample);
  const view = new DataView(wavBuffer);
  
  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };
  
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + channelData.length * bytesPerSample, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeStr(36, 'data');
  view.setUint32(40, channelData.length * bytesPerSample, true);
  
  let offset = 44;
  for (let i = 0; i < channelData.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, channelData[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  
  return new Blob([view], { type: 'audio/wav' });
}

  // Shared Audio Turn Processing
  const processAudioTurn = async (base64data: string) => {
    let activeSid = sessionId;
    if (!activeSid) {
      try {
        const startRes = await modelLabApi.startSession({
          stt_model_id: selectedStt,
          llm_model_id: selectedLlm,
          tts_model_id: selectedTts,
          language: selectedLang,
        });
        activeSid = startRes.session_id;
        setSessionId(startRes.session_id);
        setCallId(startRes.call_id);
        setIsSessionActive(true);
      } catch (err: any) {
        toast.error('Failed to start conversation session');
        return;
      }
    }

    if (activeSid && base64data) {
      setIsProcessing(true);
      try {
        const turnRes = await modelLabApi.executeTurn(activeSid, {
          audio_base64: base64data,
        });

        if (turnRes.intent_analysis) {
          setLiveIntent(turnRes.intent_analysis);
        }

        let audioUrl: string | undefined;
        if (turnRes.audio_base64) {
          audioUrl = `data:audio/wav;base64,${turnRes.audio_base64}`;
          const audio = new Audio(audioUrl);
          audio.play().catch(() => {});
        }

        setMessages((prev) => [
          ...prev,
          {
            speaker: 'user',
            text: turnRes.user_text,
            timestamp: new Date().toLocaleTimeString(),
          },
          {
            speaker: 'assistant',
            text: turnRes.ai_text,
            timestamp: new Date().toLocaleTimeString(),
            stt_latency_ms: turnRes.metrics.stt_latency_ms,
            ttft_ms: turnRes.metrics.llm_ttft_ms,
            ttfa_ms: turnRes.metrics.tts_ttfa_ms,
            tokens_per_sec: turnRes.metrics.llm_tokens_per_sec,
            total_latency_ms: turnRes.metrics.total_latency_ms,
            audio_url: audioUrl,
            audio_status: 'ready',
          },
        ]);

        setLatestMetrics({
          stt_ms: turnRes.metrics.stt_latency_ms,
          ttft_ms: turnRes.metrics.llm_ttft_ms,
          ttfa_ms: turnRes.metrics.tts_ttfa_ms,
          tps: turnRes.metrics.llm_tokens_per_sec,
          total_ms: turnRes.metrics.total_latency_ms,
        });
      } catch (err: any) {
        toast.error(err?.response?.data?.detail || 'Audio turn processing failed');
      } finally {
        setIsProcessing(false);
      }
    }
  };

  // Audio File Upload Handler
  const handleAudioFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onloadend = async () => {
        const base64data = (reader.result as string).split(',')[1];
        if (base64data) {
          toast.info(`Uploaded '${file.name}'. Transcribing & responding...`);
          await processAudioTurn(base64data);
        }
      };
    } catch (err) {
      toast.error('Failed to read selected audio file');
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Microphone Recording via MediaRecorder
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream);

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        try {
          const rawBlob = new Blob(audioChunksRef.current, { type: mediaRecorder.mimeType || 'audio/webm' });
          const reader = new FileReader();
          reader.readAsDataURL(rawBlob);
          reader.onloadend = async () => {
            const base64data = (reader.result as string).split(',')[1];
            if (!base64data) return;
            await processAudioTurn(base64data);
          };
        } catch (convErr) {
          toast.error('Failed to process recorded audio');
        }
      };

      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
      toast.info('Microphone active. Speak now...');
    } catch (err) {
      toast.error('Microphone access denied or unsupported.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
      setIsRecording(false);
    }
  };

  // Standalone Model Quick Test
  const runStandaloneTest = async (modelId: string) => {
    setIsTestingModel(true);
    setTestResult(null);
    try {
      const res = await modelLabApi.testModel(modelId, {
        input_text: testInputText || 'One acre needs 40 kg seed. How much for 5 acres?',
      });
      setTestResult(res);
      refetchModels();
      toast.success(`Test completed with status: ${res.status}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Test query failed');
    } finally {
      setIsTestingModel(false);
    }
  };

  // Telephony: Test VoBiz Connection
  const handleTestVoBizConnection = async () => {
    setIsTestingConn(true);
    try {
      const res = await modelLabApi.testTelephonyConnection();
      setConnTestResult(res);
      if (res.connected) {
        toast.success('VoBiz Telephony Connected!');
      } else {
        toast.warning(res.message);
      }
      refetchTerminal();
    } catch (err: any) {
      toast.error('Failed to test VoBiz connection');
    } finally {
      setIsTestingConn(false);
    }
  };

  // Telephony: Save Config
  const handleSaveVoBizConfig = async () => {
    try {
      await modelLabApi.saveTelephonyConfig({
        auth_id: vobizAuthId,
        auth_token: vobizAuthToken,
        phone_number: vobizPhone,
        environment: vobizEnv,
      });
      toast.success('VoBiz configuration updated');
      refetchTelephonyConfig();
    } catch (err) {
      toast.error('Failed to save VoBiz configuration');
    }
  };

  // Telephony: Make Test Call
  const handleMakeTelephonyCall = async () => {
    if (!telephonyOutboundNumber || telephonyOutboundNumber.length < 10) {
      toast.error('Please enter a valid 10-digit phone number');
      return;
    }
    setIsPlacingCall(true);
    try {
      const res = await modelLabApi.makeTelephonyTestCall({
        phone_number: telephonyOutboundNumber,
        stt_model_id: selectedStt,
        llm_model_id: selectedLlm,
        tts_model_id: selectedTts,
        language: selectedLang,
      });
      setActiveTelephonyCallId(res.call_id);
      setTelephonyCallStatus(res.status);
      toast.success(`Call placed to ${res.phone_number}! UUID: ${res.provider_call_id}`);
      refetchTerminal();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to place test call');
    } finally {
      setIsPlacingCall(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Page Header */}
      <PageHeader
        title="AI Model Lab"
        subtitle="Local Model Discovery, Hardware-Safe Resource Locking, Voice Sandbox & VoBiz Telephony"
        category="Enterprise AI Voice Engine"
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="success" className="gap-1.5 px-3 py-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              RTX 4050 Exclusive Lock Active
            </Badge>
          </div>
        }
      />

      {/* GPU & Hardware Telemetry Widget */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-slate-900/90 text-white border-slate-800 shadow-lg backdrop-blur-md">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">GPU Dedicated VRAM</div>
              <div className="text-xl font-bold mt-1 text-orange-400">
                {gpuData ? `${(gpuData.vram_used_mb / 1024).toFixed(2)} / ${(gpuData.vram_total_mb / 1024).toFixed(1)} GB` : 'N/A'}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                {gpuData ? `${gpuData.vram_free_mb.toFixed(0)} MB Free (${((gpuData.vram_used_mb / gpuData.vram_total_mb) * 100).toFixed(0)}% Used)` : 'Checking GPU...'}
              </div>
            </div>
            <div className="p-3 bg-orange-500/20 text-orange-400 rounded-xl">
              <Cpu className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/90 text-white border-slate-800 shadow-lg backdrop-blur-md">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">GPU Utilization & Temp</div>
              <div className="text-xl font-bold mt-1 text-emerald-400">
                {gpuData ? `${gpuData.gpu_utilization_pct.toFixed(0)}%` : 'N/A'}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                {gpuData ? `${gpuData.temperature_c}°C | Power: ${(gpuData as any).power_draw_w || 2.3}W` : 'NVIDIA Driver'}
              </div>
            </div>
            <div className="p-3 bg-emerald-500/20 text-emerald-400 rounded-xl">
              <Flame className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/90 text-white border-slate-800 shadow-lg backdrop-blur-md">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Hardware Performance</div>
              <div className="text-sm font-bold mt-1 text-amber-400 flex items-center gap-1.5">
                <Wind className="w-4 h-4 text-amber-400 animate-spin" style={{ animationDuration: '3s' }} />
                <span>High Performance</span>
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                Fan: Auto / Maximum | OEM Safe
              </div>
            </div>
            <div className="p-3 bg-amber-500/20 text-amber-400 rounded-xl">
              <Fan className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/90 text-white border-slate-800 shadow-lg backdrop-blur-md">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Active Model Lock</div>
              <div className="text-sm font-bold mt-1 text-orange-400 truncate max-w-[140px]">
                {runtimeHealth?.active_model_id || 'IDLE (Baseline)'}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                {runtimeHealth?.active_model_type?.toUpperCase() || 'Single-Model Enforced'}
              </div>
            </div>
            <div className="p-3 bg-orange-500/20 text-orange-400 rounded-xl">
              <Gauge className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Live Runtime & Model Shifting Terminal Console */}
      <Card className="bg-slate-950 text-slate-100 border-slate-800 shadow-xl overflow-hidden">
        <CardHeader className="p-4 border-b border-slate-800/80 bg-slate-900/60">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-lg">
                <TerminalIcon className="w-5 h-5" />
              </div>
              <div>
                <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
                  <span>Hardware Runtime & Model Shifting Terminal</span>
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                </CardTitle>
                <CardDescription className="text-[11px] text-slate-400">
                  Real-time local model execution, port binding, VRAM allocation, and single-GPU exclusivity lifecycle
                </CardDescription>
              </div>
            </div>

            {/* Current Model & Status Badges */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <div className="px-2.5 py-1 bg-slate-900 rounded-lg border border-slate-800 flex items-center gap-1.5">
                <span className="text-[10px] text-slate-400 uppercase font-semibold">Loaded Model:</span>
                <Badge
                  variant={runtimeHealth?.active_model_id ? 'success' : 'default'}
                  className="font-mono text-[10px] px-1.5 py-0.2"
                >
                  {runtimeHealth?.active_model_id || 'NONE (Idle)'}
                </Badge>
              </div>

              <div className="px-2.5 py-1 bg-slate-900 rounded-lg border border-slate-800 flex items-center gap-1.5">
                <span className="text-[10px] text-slate-400 uppercase font-semibold">Status:</span>
                <span className="font-mono text-[11px] text-orange-400 font-bold">
                  {isProcessing ? 'PROCESSING TURN' : startModelMutation.isPending ? 'SHIFTING MODEL' : 'READY'}
                </span>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-1 ml-auto">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setAutoScroll(!autoScroll)}
                  className={clsx(
                    'h-7 text-[10px] px-2 gap-1 border-slate-700',
                    autoScroll ? 'bg-emerald-950/40 text-emerald-400 border-emerald-600/40' : 'text-slate-400'
                  )}
                  title="Toggle Auto-Scroll"
                >
                  <ArrowDownCircle className="w-3 h-3" />
                  {autoScroll ? 'Scroll: ON' : 'Scroll: OFF'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCopyTerminal}
                  className="h-7 text-[10px] px-2 gap-1 border-slate-700 text-slate-300 hover:text-white"
                  title="Copy Console Logs"
                >
                  <Copy className="w-3 h-3" />
                  Copy
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleClearTerminal}
                  className="h-7 text-[10px] px-2 gap-1 border-slate-700 text-slate-400 hover:text-rose-400"
                  title="Clear Console"
                >
                  <Trash2 className="w-3 h-3" />
                  Clear
                </Button>
              </div>
            </div>
          </div>

          {/* Quick Model Shift Buttons Bar */}
          <div className="mt-3 pt-3 border-t border-slate-800 flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold text-amber-400 flex items-center gap-1">
              <Zap className="w-3 h-3" /> Shift Active Model:
            </span>
            {[
              { id: 'gemma-2-9b-it', label: 'Gemma 2 9B', vram: '4.2GB' },
              { id: 'qwen3-4b-instruct', label: 'Qwen 3 4B', vram: '2.8GB' },
              { id: 'qwen2.5-coder-7b', label: 'Qwen 2.5 Coder 7B', vram: '3.8GB' },
              { id: 'qwen3.5-9b', label: 'Qwen 3.5 9B', vram: '4.4GB' },
              { id: 'sarvam-1', label: 'Sarvam 1 2B', vram: '2.2GB' },
              { id: 'whisper-large-v3-turbo', label: 'Whisper Large v3', vram: '2.8GB' },
            ].map((item) => {
              const isCurrent = runtimeHealth?.active_model_id === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleShiftModel(item.id)}
                  disabled={startModelMutation.isPending || isCurrent}
                  className={clsx(
                    'px-2.5 py-1 rounded-md text-[11px] font-mono transition-all border flex items-center gap-1.5',
                    isCurrent
                      ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 font-bold'
                      : 'bg-slate-900/90 border-slate-800 text-slate-300 hover:border-orange-500 hover:text-white'
                  )}
                >
                  <span
                    className={clsx(
                      'w-1.5 h-1.5 rounded-full',
                      isCurrent ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'
                    )}
                  />
                  <span>{item.label}</span>
                  <span className="text-[9px] text-slate-400">({item.vram})</span>
                </button>
              );
            })}
          </div>

          {/* Category Filter Pills */}
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px]">
            <span className="text-slate-500 font-medium">Filter:</span>
            {['ALL', 'SWITCH', 'LIFECYCLE', 'LLM', 'TTS', 'AUDIO', 'STT', 'TELEPHONY', 'THERMAL', 'VRAM', 'ERROR'].map(
              (cat) => (
                <button
                  key={cat}
                  onClick={() => setTerminalFilter(cat)}
                  className={clsx(
                    'px-2 py-0.5 rounded transition-colors',
                    terminalFilter === cat
                      ? 'bg-orange-500 text-white font-bold shadow-sm shadow-orange-500/20'
                      : 'bg-slate-900 text-slate-400 hover:bg-slate-800'
                  )}
                >
                  {cat}
                </button>
              )
            )}
          </div>
        </CardHeader>

        <CardContent className="p-4 bg-slate-950 font-mono text-xs max-h-60 overflow-y-auto">
          <div className="space-y-1">
            {!terminalData?.logs || terminalData.logs.length === 0 ? (
              <div className="text-slate-600 italic">No runtime logs yet. Ready for inference...</div>
            ) : (
              terminalData.logs
                .filter((l) => terminalFilter === 'ALL' || l.category.toUpperCase().includes(terminalFilter))
                .map((log) => {
                  let tagColor = 'text-slate-400 bg-slate-900 border-slate-800';
                  if (log.category === 'SWITCH') tagColor = 'text-orange-400 bg-orange-950/40 border-orange-800/50';
                  else if (log.category === 'LIFECYCLE') tagColor = 'text-slate-300 bg-slate-800/60 border-slate-700/50';
                  else if (log.category === 'VRAM') tagColor = 'text-amber-400 bg-amber-950/40 border-amber-800/50';
                  else if (log.category === 'READY') tagColor = 'text-emerald-400 bg-emerald-950/40 border-emerald-800/50';
                  else if (log.category === 'INFERENCE' || log.category.startsWith('LLM')) tagColor = 'text-orange-400 bg-orange-950/40 border-orange-800/50';
                  else if (log.category === 'TTS' || log.category.startsWith('TTS')) tagColor = 'text-amber-400 bg-amber-950/40 border-amber-800/50';
                  else if (log.category === 'AUDIO' || log.category.startsWith('AUDIO')) tagColor = 'text-green-400 bg-green-950/40 border-green-800/50';
                  else if (log.category === 'STT') tagColor = 'text-emerald-400 bg-emerald-950/40 border-emerald-800/50';
                  else if (log.category.startsWith('VOIBIZ') || log.category === 'TELEPHONY') tagColor = 'text-orange-400 bg-orange-950/40 border-orange-800/50';
                  else if (log.level === 'ERROR' || log.category === 'ERROR') tagColor = 'text-rose-400 bg-rose-950/40 border-rose-800/50';

                  return (
                    <div key={log.id} className="flex items-start gap-2 hover:bg-slate-900/40 py-0.5 px-1 rounded transition-colors">
                      <span className="text-slate-500 shrink-0 text-[10px]">{log.timestamp}</span>
                      <span className={clsx('px-1.5 py-0.2 rounded text-[9px] font-bold border shrink-0', tagColor)}>
                        {log.category}
                      </span>
                      <span
                        className={clsx(
                          'flex-1 break-words',
                          log.level === 'ERROR'
                            ? 'text-rose-300 font-semibold'
                            : log.category === 'SWITCH'
                            ? 'text-orange-200'
                            : log.category === 'READY'
                            ? 'text-emerald-300'
                            : log.category.startsWith('TTS')
                            ? 'text-amber-200'
                            : log.category.startsWith('LLM')
                            ? 'text-orange-200'
                            : log.category.startsWith('AUDIO')
                            ? 'text-green-200'
                            : log.category.startsWith('VOIBIZ')
                            ? 'text-orange-200'
                            : 'text-slate-300'
                        )}
                      >
                        {log.message}
                      </span>
                    </div>
                  );
                })
            )}
            <div ref={terminalEndRef} />
          </div>
        </CardContent>
      </Card>

      {/* Main Mode Navigation Tabs */}
      <div className="flex items-center gap-3 border-b border-slate-200 dark:border-slate-800 pb-2">
        <button
          onClick={() => setActiveTab('browser')}
          className={clsx(
            'flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-all',
            activeTab === 'browser'
              ? 'bg-orange-500 text-white shadow-sm shadow-orange-500/20'
              : 'bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-white'
          )}
        >
          <span>Browser Voice Sandbox</span>
        </button>

        <button
          onClick={() => setActiveTab('telephony')}
          className={clsx(
            'flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-all',
            activeTab === 'telephony'
              ? 'bg-orange-500 text-white shadow-sm shadow-orange-500/20'
              : 'bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-white'
          )}
        >
          <Phone className="w-4 h-4" />
          <span>VoBiz Telephony & Real Calls</span>
        </button>

        <button
          onClick={() => setActiveTab('classifier')}
          className={clsx(
            'flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-all',
            activeTab === 'classifier'
              ? 'bg-orange-500 text-white shadow-sm shadow-orange-500/20'
              : 'bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-white'
          )}
        >
          <BrainCircuit className="w-4 h-4 text-emerald-400" />
          <span>Customer Intent & Lead Classifier</span>
        </button>
      </div>

      {/* TAB 1: BROWSER VOICE SANDBOX */}
      {activeTab === 'browser' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left 2 Cols: Live Conversational Sandbox */}
          <div className="lg:col-span-2 space-y-6">
            <Card className="border-slate-200 dark:border-slate-800 shadow-md">
              <CardHeader className="border-b border-slate-100 dark:border-slate-800/80 pb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">
                      Conversational Voice Sandbox
                    </CardTitle>
                    <CardDescription>
                      Pipecat sequential voice loop with real-time STT, LLM streaming, and complete TTS audio synthesis
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    {liveIntent && (
                      <div
                        className={clsx(
                          'flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border shadow-xs transition-all',
                          liveIntent.classification === 'INTERESTED'
                            ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                            : 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30'
                        )}
                        title={liveIntent.reason}
                      >
                        <span
                          className={clsx(
                            'w-2 h-2 rounded-full',
                            liveIntent.classification === 'INTERESTED' ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'
                          )}
                        />
                        <span>
                          AI Lead: <strong>{liveIntent.classification}</strong> ({(liveIntent.confidence * 100).toFixed(0)}%)
                        </span>
                      </div>
                    )}
                    <Button
                      size="sm"
                      onClick={playLatestAudio}
                      className="bg-orange-500 hover:bg-orange-600 text-white text-xs gap-1.5 shadow-sm shadow-orange-500/20"
                    >
                      <Volume2 className="w-3.5 h-3.5 animate-pulse" />
                      Play Latest Audio
                    </Button>
                    {isSessionActive && (
                      <Badge variant="success" className="animate-pulse">
                        Live Session Active
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>

              <CardContent className="p-6 space-y-4">
                {/* Session Setup Bar */}
                {!isSessionActive ? (
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3 p-4 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200/80 dark:border-slate-800">
                    <div>
                      <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">STT Engine</label>
                      <Select
                        value={selectedStt}
                        onChange={(e) => setSelectedStt(e.target.value)}
                        className="mt-1 text-xs font-medium"
                      >
                        <option value="whisper-large-v3-turbo">Whisper Large-v3 (Auto Detect)</option>
                      </Select>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">LLM Engine</label>
                      <Select
                        value={selectedLlm}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSelectedLlm(val);
                          handleShiftModel(val);
                        }}
                        className="mt-1 text-xs font-medium"
                      >
                        <option value="gemma-2-9b-it">Gemma 2 9B IT (Q4_K_M - 4.2GB)</option>
                        <option value="qwen3-4b-instruct">Qwen 3 4B Instruct (Fast - 2.8GB)</option>
                        <option value="qwen2.5-coder-7b">Qwen 2.5 Coder 7B (3.8GB)</option>
                        <option value="qwen3.5-9b">Qwen 3.5 9B (4.4GB)</option>
                        <option value="sarvam-1">Sarvam 1 Indic 2B (2.2GB)</option>
                      </Select>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">TTS Engine</label>
                      <Select
                        value={selectedTts}
                        onChange={(e) => setSelectedTts(e.target.value)}
                        className="mt-1 text-xs"
                      >
                        <option value="indic-parler-tts">Indic Parler-TTS (Rohit)</option>
                      </Select>
                    </div>

                    <div className="flex flex-col justify-end">
                      <Button
                        onClick={handleStartSession}
                        disabled={isProcessing}
                        className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold text-xs gap-1.5 shadow-sm shadow-orange-500/20"
                      >
                        <PhoneCall className="w-4 h-4" />
                        Start Conversation
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between p-3 bg-orange-500/10 rounded-xl border border-orange-500/20">
                    <div className="flex items-center gap-3">
                      <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
                      <div>
                        <div className="text-xs font-bold text-orange-950 dark:text-orange-200">
                          Session: {sessionId} ({selectedLang})
                        </div>
                        <div className="text-[11px] text-orange-600 dark:text-orange-400">
                          {selectedStt} → {selectedLlm} → {selectedTts}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleInterrupt}
                        className="text-amber-600 border-amber-300 hover:bg-amber-50 text-xs"
                      >
                        <AlertTriangle className="w-3.5 h-3.5 mr-1" />
                        Interrupt
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={handleEndSession}
                        className="text-xs gap-1"
                      >
                        <PhoneOff className="w-3.5 h-3.5" />
                        End Call
                      </Button>
                    </div>
                  </div>
                )}

                {/* Real-time Telemetry Strip */}
                <div className="grid grid-cols-5 gap-2 p-2.5 bg-slate-100 dark:bg-slate-900 rounded-lg text-center text-xs">
                  <div>
                    <span className="text-[10px] text-slate-500 block">STT Latency</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      {latestMetrics.stt_ms ? `${latestMetrics.stt_ms} ms` : 'N/A'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block">LLM TTFT</span>
                    <span className="font-bold text-orange-600 dark:text-orange-400">
                      {latestMetrics.ttft_ms ? `${latestMetrics.ttft_ms} ms` : 'N/A'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block">LLM Speed</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">
                      {latestMetrics.tps ? `${latestMetrics.tps} tok/s` : 'N/A'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block">TTS TTFA</span>
                    <span className="font-bold text-orange-600 dark:text-orange-400">
                      {latestMetrics.ttfa_ms ? `${latestMetrics.ttfa_ms} ms` : 'N/A'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block">Total Turn</span>
                    <span className="font-bold text-orange-600 dark:text-orange-400">
                      {latestMetrics.total_ms ? `${(latestMetrics.total_ms / 1000).toFixed(2)} s` : 'N/A'}
                    </span>
                  </div>
                </div>

                {/* Transcript & Conversation Area */}
                <div className="h-[380px] overflow-y-auto space-y-3 p-4 bg-slate-50/70 dark:bg-slate-950/70 rounded-xl border border-slate-200/80 dark:border-slate-800">
                  {messages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 text-xs">
                      <MessageSquare className="w-8 h-8 mb-2 text-slate-300 dark:text-slate-700" />
                      <span>No messages yet. Start a session or use text/microphone below to test.</span>
                    </div>
                  ) : (
                    messages.map((msg, i) => (
                      <div
                        key={i}
                        className={clsx(
                          'flex flex-col max-w-[85%] rounded-xl p-3 text-xs leading-relaxed',
                          msg.speaker === 'user'
                            ? 'ml-auto bg-orange-500 text-white rounded-br-none shadow-sm shadow-orange-500/20'
                            : 'mr-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 rounded-bl-none shadow-xs'
                        )}
                      >
                        <div className="flex items-center justify-between gap-4 mb-1 text-[10px] opacity-75">
                          <span className="font-bold uppercase tracking-wider">{msg.speaker === 'user' ? 'Caller' : 'Samruddhi AI'}</span>
                          <span>{msg.timestamp}</span>
                        </div>
                        <div className="font-medium text-[13px]">{msg.text}</div>
                        {msg.speaker === 'assistant' && (
                          <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2 text-[10px] text-slate-500">
                            {msg.audio_url && (
                              <div className="p-2 bg-orange-500/10 rounded-lg border border-orange-500/20 flex flex-col gap-1.5">
                                <div className="flex items-center justify-between text-orange-700 dark:text-orange-300 font-semibold text-xs">
                                  <span className="flex items-center gap-1.5">
                                    <Volume2 className="w-4 h-4 text-orange-500 animate-pulse" />
                                    Synthesized Audio Reply (Complete)
                                  </span>
                                  <button
                                    onClick={() => {
                                      const a = new Audio(msg.audio_url);
                                      a.play().catch(() => {});
                                    }}
                                    className="px-2 py-0.5 bg-orange-500 hover:bg-orange-600 text-white rounded text-[10px] font-medium transition-colors"
                                  >
                                    ▶ Replay
                                  </button>
                                </div>
                                <audio
                                  controls
                                  autoPlay
                                  src={msg.audio_url}
                                  className="w-full h-8 rounded mt-1"
                                />
                              </div>
                            )}

                            <div className="flex items-center justify-between text-[10px]">
                              <div className="flex items-center gap-2">
                                {msg.ttft_ms && <span>TTFT: {msg.ttft_ms}ms</span>}
                                {msg.ttfa_ms && <span>TTS: {msg.ttfa_ms}ms</span>}
                                {msg.tokens_per_sec && <span>Speed: {msg.tokens_per_sec} t/s</span>}
                              </div>
                              {msg.total_latency_ms && (
                                <span className="font-semibold text-orange-600 dark:text-orange-400">
                                  Total: {(msg.total_latency_ms / 1000).toFixed(2)}s
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>

                {/* Controls: Real Microphone & Text Input */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    {!isRecording ? (
                      <Button
                        type="button"
                        onClick={startRecording}
                        disabled={!isSessionActive || isProcessing}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 text-xs px-4"
                      >
                        <Mic className="w-4 h-4" />
                        Record Voice
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        onClick={stopRecording}
                        className="bg-rose-600 hover:bg-rose-700 text-white gap-1.5 text-xs px-4 animate-pulse"
                      >
                        <StopCircle className="w-4 h-4" />
                        Stop & Transcribe
                      </Button>
                    )}

                    <input
                      type="file"
                      ref={fileInputRef}
                      accept="audio/*,.ogg,.wav,.mp3,.m4a,.webm"
                      onChange={handleAudioFileUpload}
                      className="hidden"
                    />

                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={!isSessionActive || isProcessing}
                      className="gap-1.5 text-xs px-3 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <Upload className="w-4 h-4 text-orange-500" />
                      Upload Audio
                    </Button>

                    <div className="flex-1 flex items-center gap-2">
                      <Input
                        placeholder={
                          isSessionActive
                            ? 'Type your question in Marathi, Hindi, English, or Hinglish...'
                            : 'Start a session above to chat...'
                        }
                        value={textInput}
                        onChange={(e) => setTextInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSendTurn()}
                        disabled={!isSessionActive || isProcessing}
                        className="text-xs"
                      />
                      <Button
                        onClick={() => handleSendTurn()}
                        disabled={!isSessionActive || isProcessing || !textInput.trim()}
                        className="bg-orange-500 hover:bg-orange-600 text-white text-xs px-4 shadow-sm shadow-orange-500/20"
                      >
                        Send
                      </Button>
                    </div>
                  </div>

                  {/* Pre-made Agricultural Test Prompts */}
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className="text-slate-400 font-medium">Quick Prompts:</span>
                    {[
                      '5 एकरासाठी 40 किलो प्रमाणे किती बियाणे लागेल?',
                      'अगर 5 एकड़ के लिए 40 किलो बीज चाहिए तो कुल कितना लगेगा?',
                      'How much seed is needed for 5 acres at 40kg per acre?',
                      'Explain wheat seed preparation and quantity calculation in detail.',
                    ].map((p, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleSendTurn(p)}
                        disabled={!isSessionActive || isProcessing}
                        className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors"
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Call Summary & Interested Outcome Panel */}
            {callSummary && (
              <Card className="border-emerald-500/30 bg-emerald-500/5 shadow-md">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base text-emerald-900 dark:text-emerald-300 flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                    Call Completed & Summary Saved
                  </CardTitle>
                  <CardDescription>
                    Call ID: {callSummary.call_id} | Duration: {callSummary.duration_seconds}s | Turns: {callSummary.turn_count}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* AI Intent Classifier Diagnosis */}
                  {callSummary.classification && (
                    <div className="p-3.5 bg-slate-900 text-white rounded-xl border border-slate-800 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <BrainCircuit className="w-4 h-4 text-emerald-400" />
                          <span className="text-xs font-bold text-slate-200">AI Intent Model Decision</span>
                        </div>
                        <Badge
                          variant={callSummary.classification === 'INTERESTED' ? 'success' : 'danger'}
                          className="font-bold text-xs"
                        >
                          {callSummary.classification} ({(callSummary.confidence * 100).toFixed(0)}% Conf)
                        </Badge>
                      </div>

                      <div className="text-xs text-slate-300 leading-relaxed">
                        <span className="font-semibold text-slate-400">Reason: </span>
                        {callSummary.reason || 'Transcript evaluated for customer intent signals.'}
                      </div>

                      {callSummary.signals && callSummary.signals.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                          <span className="text-[10px] text-slate-400 uppercase tracking-wider">Signals:</span>
                          {callSummary.signals.map((sig: string, idx: number) => (
                            <span
                              key={idx}
                              className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-mono border border-emerald-500/30"
                            >
                              {sig}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                    <div>
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
                        Manual Lead Override / Confirm Interest
                      </span>
                      <span className="text-[11px] text-slate-500">
                        {interestOutcome === true
                          ? 'Saved as positive lead in CRM'
                          : interestOutcome === false
                          ? 'Marked not interested'
                          : 'Auto-classified by AI Model'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant={interestOutcome === true ? 'success' : 'outline'}
                        onClick={() => setInterestOutcome(true)}
                        className={clsx('gap-1 text-xs', interestOutcome === true && 'bg-emerald-600 text-white')}
                      >
                        <ThumbsUp className="w-3.5 h-3.5" /> Interested
                      </Button>
                      <Button
                        size="sm"
                        variant={interestOutcome === false ? 'danger' : 'outline'}
                        onClick={() => setInterestOutcome(false)}
                        className={clsx('gap-1 text-xs', interestOutcome === false && 'bg-rose-600 text-white')}
                      >
                        <ThumbsDown className="w-3.5 h-3.5" /> Not Interested
                      </Button>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Lead Notes</label>
                    <Input
                      placeholder="e.g. Farmer needs 200kg wheat seed for 5 acres in Solapur..."
                      value={leadNotes}
                      onChange={(e) => setLeadNotes(e.target.value)}
                      className="mt-1 text-xs"
                    />
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right 1 Col: Discovered Models Inventory & Quick Load */}
          <div className="space-y-6">
            <Card className="border-slate-200 dark:border-slate-800 shadow-md">
              <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-orange-500" />
                    Local Model Inventory
                  </CardTitle>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => refetchModels()}
                    className="h-7 text-xs gap-1"
                  >
                    <RefreshCw className="w-3 h-3" /> Refresh
                  </Button>
                </div>
              </CardHeader>

              <CardContent className="p-4 space-y-3 max-h-[600px] overflow-y-auto">
                {models.map((m) => (
                  <div
                    key={m.model_id}
                    className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 space-y-2 hover:border-orange-500/50 transition-all shadow-xs"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-bold text-xs text-slate-900 dark:text-white flex items-center gap-1.5">
                          {m.model_name}
                        </div>
                        <div className="text-[10px] text-slate-500">{m.framework}</div>
                      </div>
                      <Badge
                        variant={
                          m.status === 'READY'
                            ? 'success'
                            : m.status === 'LOADING'
                            ? 'warning'
                            : m.status === 'ERROR'
                            ? 'danger'
                            : 'default'
                        }
                        className="text-[10px] px-1.5 py-0.5"
                      >
                        {m.status}
                      </Badge>
                    </div>

                    <div className="text-[11px] text-slate-600 dark:text-slate-400 line-clamp-2">
                      {m.description}
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-100 dark:border-slate-800/60">
                      <span>VRAM: {m.approx_vram_mb > 0 ? `${(m.approx_vram_mb / 1024).toFixed(1)} GB` : 'CPU'}</span>
                      <span>{m.languages_supported.slice(0, 3).join(', ')}</span>
                    </div>

                    <div className="flex items-center gap-1.5 pt-1">
                      {m.status !== 'READY' ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => startModelMutation.mutate(m.model_id)}
                          disabled={startModelMutation.isPending}
                          className="h-6 text-[10px] flex-1 bg-orange-500/10 hover:bg-orange-500/20 text-orange-600 dark:text-orange-400 border-orange-500/30"
                        >
                          <Zap className="w-3 h-3 mr-1" /> Load Model
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => stopModelMutation.mutate(m.model_id)}
                          disabled={stopModelMutation.isPending}
                          className="h-6 text-[10px] flex-1 text-rose-600 hover:bg-rose-50 border-rose-200"
                        >
                          <Square className="w-3 h-3 mr-1" /> Unload
                        </Button>
                      )}

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setTestingModelId(m.model_id);
                          runStandaloneTest(m.model_id);
                        }}
                        disabled={isTestingModel}
                        className="h-6 text-[10px] px-2"
                      >
                        <Play className="w-3 h-3 mr-1" /> Test
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Standalone Quick Test Result */}
            {testResult && (
              <Card className="border-orange-500/20 bg-orange-500/10">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-bold text-orange-950 dark:text-orange-200 flex items-center justify-between">
                    <span>Last Test: {testResult.model_id}</span>
                    <Badge variant={testResult.status === 'PASS' ? 'success' : 'danger'} className="text-[10px]">
                      {testResult.status}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-3 text-xs space-y-2">
                  <div className="p-2 bg-white dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-800 text-[11px] font-mono whitespace-pre-wrap">
                    {testResult.output_text || testResult.error_message}
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-slate-500">
                    <span>Latency: {testResult.latency_ms} ms</span>
                    {testResult.tokens_per_second && <span>Speed: {testResult.tokens_per_second} t/s</span>}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: VOBIZ TELEPHONY & REAL CALLS */}
      {activeTab === 'telephony' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: VoBiz Configuration Panel */}
          <Card className="border-slate-200 dark:border-slate-800 shadow-md">
            <CardHeader className="border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Phone className="w-5 h-5 text-orange-500" />
                    VoBiz Telephony Provider Configuration
                  </CardTitle>
                  <CardDescription>
                    Enterprise SIP/Telephony integration with real provider authentication check
                  </CardDescription>
                </div>
                <Badge
                  variant={connTestResult?.connected ? 'success' : 'default'}
                  className="text-xs"
                >
                  {connTestResult?.status || (telephonyConfig?.configured ? 'CONFIGURED' : 'NOT CONFIGURED')}
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="p-6 space-y-4">
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">VoBiz Auth ID / Account SID</label>
                  <Input
                    placeholder="Enter VoBiz Auth ID..."
                    value={vobizAuthId}
                    onChange={(e) => setVobizAuthId(e.target.value)}
                    className="mt-1 text-xs font-mono"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">VoBiz Auth Token / API Secret</label>
                    {telephonyConfig?.has_token && !vobizAuthToken && (
                      <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400">
                        Active: {telephonyConfig.auth_token_masked}
                      </span>
                    )}
                  </div>
                  <Input
                    type="password"
                    placeholder={
                      telephonyConfig?.has_token
                        ? '•••••••••••••••• (Leave blank to keep existing)'
                        : 'Enter VoBiz Auth Token...'
                    }
                    value={vobizAuthToken}
                    onChange={(e) => setVobizAuthToken(e.target.value)}
                    className="mt-1 text-xs font-mono"
                  />
                  <span className="text-[10px] text-slate-500">Stored securely in environment backend. Current token kept unless you enter a new one.</span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Caller ID / From Number</label>
                    <Input
                      placeholder="+91..."
                      value={vobizPhone}
                      onChange={(e) => setVobizPhone(e.target.value)}
                      className="mt-1 text-xs font-mono"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Environment</label>
                    <Select
                      value={vobizEnv}
                      onChange={(e) => setVobizEnv(e.target.value)}
                      className="mt-1 text-xs"
                    >
                      <option value="production">Production</option>
                      <option value="sandbox">Sandbox / Staging</option>
                    </Select>
                  </div>
                </div>

                <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg text-xs space-y-1 text-slate-600 dark:text-slate-400">
                  <div className="font-semibold text-slate-700 dark:text-slate-300">Live Inbound Webhook URL:</div>
                  <div className="font-mono text-[11px] text-orange-500 break-all">
                    {telephonyConfig?.webhook_url || '/api/v1/webhooks/vobiz/answer'}
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <Button
                    onClick={handleSaveVoBizConfig}
                    className="flex-1 bg-orange-500 hover:bg-orange-600 text-white text-xs gap-1.5 shadow-sm shadow-orange-500/20"
                  >
                    <Check className="w-4 h-4" /> Save Credentials
                  </Button>

                  <Button
                    variant="outline"
                    onClick={handleTestVoBizConnection}
                    disabled={isTestingConn}
                    className="flex-1 text-xs gap-1.5 border-slate-700"
                  >
                    <Activity className={clsx('w-4 h-4 text-emerald-500', isTestingConn && 'animate-spin')} />
                    Test Connection
                  </Button>
                </div>

                {/* Connection Status Banner */}
                {connTestResult && (
                  <div
                    className={clsx(
                      'p-3 rounded-xl border text-xs flex items-center justify-between',
                      connTestResult.connected
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                        : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 shrink-0" />
                      <span>{connTestResult.message}</span>
                    </div>
                    <Badge variant={connTestResult.connected ? 'success' : 'danger'}>
                      {connTestResult.status}
                    </Badge>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Right: Outbound Telephony Test Call Panel */}
          <Card className="border-slate-200 dark:border-slate-800 shadow-md">
            <CardHeader className="border-b border-slate-100 dark:border-slate-800 pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <PhoneCall className="w-5 h-5 text-emerald-500" />
                Make Outbound Telephony Test Call
              </CardTitle>
              <CardDescription>
                Initiates real phone call via VoBiz connected directly to Pipecat AI pipeline
              </CardDescription>
            </CardHeader>

            <CardContent className="p-6 space-y-4">
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Destination Phone Number</label>
                  <Input
                    placeholder="+919876543210"
                    value={telephonyOutboundNumber}
                    onChange={(e) => setTelephonyOutboundNumber(e.target.value)}
                    className="mt-1 text-xs font-mono"
                  />
                  <span className="text-[10px] text-slate-500">Include country code (e.g. +91 for India).</span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Call LLM Model</label>
                    <Select
                      value={selectedLlm}
                      onChange={(e) => setSelectedLlm(e.target.value)}
                      className="mt-1 text-xs font-medium"
                    >
                      <option value="gemma-2-9b-it">Gemma 2 9B IT (4.2GB)</option>
                      <option value="qwen3-4b-instruct">Qwen 3 4B Instruct (2.8GB)</option>
                      <option value="qwen2.5-coder-7b">Qwen 2.5 Coder 7B (3.8GB)</option>
                      <option value="qwen3.5-9b">Qwen 3.5 9B (4.4GB)</option>
                      <option value="sarvam-1">Sarvam 1 Indic 2B (2.2GB)</option>
                    </Select>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Language</label>
                    <Select
                      value={selectedLang}
                      onChange={(e) => setSelectedLang(e.target.value)}
                      className="mt-1 text-xs"
                    >
                      <option value="Marathi">Marathi</option>
                      <option value="Hindi">Hindi</option>
                      <option value="English">English</option>
                      <option value="Hinglish">Hinglish</option>
                    </Select>
                  </div>
                </div>

                <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg text-xs space-y-1 text-slate-600 dark:text-slate-400">
                  <div className="font-semibold text-slate-700 dark:text-slate-300">Hardware Validation:</div>
                  <div className="text-[11px]">
                    Before placing call, the engine automatically acquires the exclusive GPU lock and validates model readiness on port 8002.
                  </div>
                </div>

                <Button
                  onClick={handleMakeTelephonyCall}
                  disabled={isPlacingCall || !telephonyOutboundNumber}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs gap-1.5 py-3"
                >
                  <PhoneCall className="w-4 h-4" />
                  {isPlacingCall ? 'Acquiring Lock & Placing Call...' : 'Initiate Outbound VoBiz Call'}
                </Button>

                {/* Live Telephony Call Monitor */}
                {telephonyCallStatus && (
                  <div className="p-4 bg-slate-900 text-white rounded-xl border border-slate-800 space-y-2 mt-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-300">Active Call Monitor</span>
                      <Badge variant="success" className="animate-pulse">
                        {telephonyCallStatus}
                      </Badge>
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono">
                      Call ID: {activeTelephonyCallId}
                    </div>
                    <div className="text-[11px] text-emerald-400">
                      Pipecat AI Audio Stream Active. Telephony turn audio and transcripts will persist automatically to MongoDB.
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 3: CUSTOMER INTENT & LEAD CLASSIFIER WORKBENCH */}
      {activeTab === 'classifier' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left 2 Cols: Interactive Transcript Tester */}
          <div className="lg:col-span-2 space-y-6">
            <Card className="border-slate-200 dark:border-slate-800 shadow-md">
              <CardHeader className="border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <BrainCircuit className="w-5 h-5 text-emerald-500" />
                      Multilingual Customer Intent & Lead Classifier
                    </CardTitle>
                    <CardDescription>
                      Evaluates conversational transcripts to determine customer interest (INTERESTED vs NOT_INTERESTED) with signal extraction and rule verification.
                    </CardDescription>
                  </div>
                  <Badge variant="success" className="gap-1 font-mono text-xs">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Model Active
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="p-6 space-y-4">
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Conversation Transcript (Multi-Turn or Single Statement)
                  </label>
                  <textarea
                    rows={6}
                    value={classifierInput}
                    onChange={(e) => setClassifierInput(e.target.value)}
                    placeholder="Enter transcript (e.g. Caller: मला 5 एकर शेतीसाठी गहू बियाणे पाहिजे...)"
                    className="w-full text-xs font-mono p-3 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 focus:outline-hidden focus:ring-2 focus:ring-orange-500"
                  />
                </div>

                {/* Preset Test Scenarios */}
                <div className="space-y-1.5">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    Quick Scenario Presets:
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {[
                      {
                        label: '🌾 Marathi Seed Inquiry (Interested)',
                        text: 'Caller: नमस्कार, मला 5 एकर शेतीसाठी गहू बियाण्याचे भाव आणि खतांची माहिती हवी आहे.\nSamruddhi: नमस्कार! 5 एकरासाठी 200 किलो बियाणे लागेल. आम्ही सविस्तर माहिती देऊ.'
                      },
                      {
                        label: '🌱 Hindi Crop Dosage (Interested)',
                        text: 'Caller: नमस्ते, मेरी गेहूं की फसल में कीड़े लगे हैं, कौनसी दवाई डालूं और कितने में मिलेगी?\nSamruddhi: नमस्ते! आप नीम तेल या कीटनाशक स्प्रे कर सकते हैं.'
                      },
                      {
                        label: '❌ Marathi Call Rejection (Not Interested)',
                        text: 'Caller: मला काहीही नको आहे, फोन ठेवा आणि परत फोन करू नका.\nSamruddhi: ठीक आहे सर, धन्यवाद.'
                      },
                      {
                        label: '🚫 Hindi DND Rejection (Not Interested)',
                        text: 'Caller: मुझे कोई बीमा या खाद नहीं चाहिए, मेरा नंबर डिलीट कर दो.\nSamruddhi: जी, हम आपका नंबर हटा रहे हैं.'
                      },
                      {
                        label: '💰 Hinglish Price Query (Interested)',
                        text: 'Caller: Hello, mujhe 10 bags DAP fertilizer ka rate janna hai aur home delivery kab tak hogi?\nSamruddhi: Hello! DAP 1350 rs per bag hai aur 2 din mein delivery ho jayegi.'
                      },
                    ].map((preset, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          setClassifierInput(preset.text);
                          handleClassifyIntent(preset.text);
                        }}
                        className="px-2.5 py-1 text-xs rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors border border-slate-200 dark:border-slate-700"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <Button
                    onClick={() => handleClassifyIntent()}
                    disabled={isClassifying || !classifierInput.trim()}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1.5 py-2.5 shadow-sm"
                  >
                    <Activity className={clsx('w-4 h-4', isClassifying && 'animate-spin')} />
                    {isClassifying ? 'Classifying Transcript...' : 'Run Intent Classification'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setClassifierInput('');
                      setClassifierResult(null);
                    }}
                    className="text-xs"
                  >
                    Clear
                  </Button>
                </div>

                {/* Real-time Classification Results */}
                {classifierResult && (
                  <div className="p-4 bg-slate-900 text-white rounded-xl border border-slate-800 space-y-4 animate-fade-in mt-4">
                    <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                      <div className="flex items-center gap-2">
                        {classifierResult.classification === 'INTERESTED' ? (
                          <UserCheck className="w-5 h-5 text-emerald-400" />
                        ) : (
                          <UserX className="w-5 h-5 text-rose-400" />
                        )}
                        <div>
                          <div className="text-xs text-slate-400 uppercase tracking-wider">Classification Outcome</div>
                          <div
                            className={clsx(
                              'text-lg font-black',
                              classifierResult.classification === 'INTERESTED' ? 'text-emerald-400' : 'text-rose-400'
                            )}
                          >
                            {classifierResult.classification}
                          </div>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-xs text-slate-400 uppercase tracking-wider">Confidence Score</div>
                        <div className="text-lg font-black text-orange-400">
                          {((classifierResult.confidence || 0.85) * 100).toFixed(0)}%
                        </div>
                      </div>
                    </div>

                    {/* Confidence Visual Bar */}
                    <div>
                      <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                        <span>Model Certainty</span>
                        <span>{((classifierResult.confidence || 0.85) * 100).toFixed(0)}%</span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                        <div
                          className={clsx(
                            'h-full rounded-full transition-all duration-500',
                            classifierResult.classification === 'INTERESTED' ? 'bg-emerald-500' : 'bg-rose-500'
                          )}
                          style={{ width: `${(classifierResult.confidence || 0.85) * 100}%` }}
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5 text-xs text-slate-300">
                      <span className="font-semibold text-slate-400 block">Classifier Reasoning:</span>
                      <p className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800/80 text-xs font-sans leading-relaxed">
                        {classifierResult.reason}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-2 text-xs">
                      {classifierResult.rule_applied && (
                        <div className="p-2.5 bg-slate-950/60 rounded-lg border border-slate-800">
                          <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Decision Rule Applied:</span>
                          <span className="font-medium text-orange-300">{classifierResult.rule_applied}</span>
                        </div>
                      )}

                      {classifierResult.languages_detected && (
                        <div className="p-2.5 bg-slate-950/60 rounded-lg border border-slate-800">
                          <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Languages Detected:</span>
                          <span className="font-medium text-amber-300">
                            {classifierResult.languages_detected.join(', ') || 'Multilingual (Indic)'}
                          </span>
                        </div>
                      )}
                    </div>

                    {classifierResult.signals_detected && classifierResult.signals_detected.length > 0 && (
                      <div>
                        <span className="text-[10px] text-slate-400 uppercase tracking-wider block mb-1.5">
                          Extracted Intent Signals:
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {classifierResult.signals_detected.map((sig: string, idx: number) => (
                            <span
                              key={idx}
                              className="px-2.5 py-1 rounded-md bg-emerald-500/20 text-emerald-300 text-xs font-mono border border-emerald-500/30"
                            >
                              ✓ {sig}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right 1 Col: Model Specifications & Lead Policies */}
          <div className="space-y-6">
            <Card className="border-slate-200 dark:border-slate-800 shadow-md">
              <CardHeader className="border-b border-slate-100 dark:border-slate-800 pb-3">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <Target className="w-4 h-4 text-orange-500" />
                  Intent Classifier Specifications
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-3 text-xs">
                <div className="space-y-1">
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Engine Architecture:</span>
                  <div className="font-semibold text-slate-800 dark:text-slate-200">
                    Two-Class Multilingual Intent Engine (Lexicon + Syntax Decision Tree)
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Target Output:</span>
                  <div className="flex items-center gap-2">
                    <Badge variant="success">INTERESTED</Badge>
                    <Badge variant="danger">NOT_INTERESTED</Badge>
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Language Coverage:</span>
                  <div className="text-slate-600 dark:text-slate-400">
                    Marathi (मराठी), Hindi (हिंदी), English, Hinglish, Code-Switching
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Lead Optimization Policy:</span>
                  <div className="text-slate-600 dark:text-slate-400 leading-relaxed">
                    High-Recall Lead Preservation: Never drops ambiguous or curiosity inquiries without explicit caller rejection.
                  </div>
                </div>

                <div className="p-3 bg-orange-500/10 rounded-lg border border-orange-500/20 text-slate-700 dark:text-slate-300">
                  <div className="font-semibold text-orange-950 dark:text-orange-200 mb-1">Automatic CRM Lead Pipeline:</div>
                  <div className="text-[11px] leading-relaxed">
                    Every voice turn or finished call automatically runs this classifier. Calls classified as <strong>INTERESTED</strong> are immediately ingested into the CRM Leads database with extracted notes and intent tags.
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
};
