import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  KeyRound,
  ShieldCheck,
  Check,
  CheckCheck,
  Activity,
  Copy,
  Eye,
  EyeOff,
  Radio,
  ExternalLink,
  Volume2,
  Play,
  Pause,
  RotateCcw,
  Cpu,
  Layers,
  Languages,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Zap,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Badge } from '../../components/ui/Badge';
import { voiceApi, SarvamConfigResponse, SarvamTestResponse } from '../../services/api/voice';
import { modelConfigApi } from '../../services/api/modelConfig';
import { useToast } from '../../app/providers/ToastProvider';
import apiClient, { getErrorMessage } from '../../services/api/client';

export const SarvamSettings: React.FC = () => {
  const toast = useToast();
  const queryClient = useQueryClient();

  // Form State
  const [apiKey, setApiKey] = useState('');
  const [defaultVoice, setDefaultVoice] = useState('shubh');
  const [showKey, setShowKey] = useState(false);
  const [testResult, setTestResult] = useState<SarvamTestResponse | null>(null);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const previewObjectUrlRef = useRef<string | null>(null);

  // Load Sarvam config from backend
  const { data: config, isLoading, refetch } = useQuery<SarvamConfigResponse>({
    queryKey: ['sarvam-config'],
    queryFn: () => voiceApi.getSarvamConfig(),
    refetchInterval: 30000,
  });

  const { data: modelMode, refetch: refetchModelMode } = useQuery({
    queryKey: ['model-mode-status'],
    queryFn: () => modelConfigApi.getModelMode(),
  });

  useEffect(() => {
    if (config) {
      setApiKey(config.api_key || '');
      setDefaultVoice(config.default_voice || 'shubh');
    }
  }, [config]);

  // Clean up audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // Save Mutation
  const saveMutation = useMutation({
    mutationFn: (data: { api_key: string; default_voice: string; set_active?: boolean }) =>
      voiceApi.saveSarvamConfig(data),
    onSuccess: (res) => {
      toast.success('Sarvam AI Credentials Saved', res.message || 'Saved successfully.');
      queryClient.invalidateQueries({ queryKey: ['sarvam-config'] });
      queryClient.invalidateQueries({ queryKey: ['model-mode-status'] });
      refetch();
    },
    onError: (err) => {
      toast.error('Failed to Save Credentials', getErrorMessage(err));
    },
  });

  // Test Connection Mutation
  const testMutation = useMutation({
    mutationFn: () => voiceApi.testSarvamConnection({ api_key: apiKey, default_voice: defaultVoice }),
    onSuccess: (res) => {
      setTestResult(res);
      if (res.connected) {
        toast.success('Sarvam AI Connected', res.message);
      } else {
        toast.warning(res.status, res.message);
      }
    },
    onError: (err) => {
      toast.error('Connection Test Failed', getErrorMessage(err));
      setTestResult({
        success: false,
        connected: false,
        status: 'NETWORK_ERROR',
        message: getErrorMessage(err),
      });
    },
  });

  // Switch Active Engine Mutation
  const activateMutation = useMutation({
    mutationFn: () => modelConfigApi.toggleModelMode('sarvam'),
    onSuccess: (res) => {
      toast.success('Engine Activated', 'Sarvam AI set as the active voice engine for outbound calling.');
      queryClient.invalidateQueries({ queryKey: ['model-mode-status'] });
      queryClient.invalidateQueries({ queryKey: ['sarvam-config'] });
      refetchModelMode();
    },
    onError: (err) => {
      toast.error('Activation Failed', getErrorMessage(err));
    },
  });

  const handleSave = (setActive = false) => {
    // A blank key means "keep the existing one" once a key is configured
    // (the API no longer returns the raw key to prefill this field).
    if (!apiKey.trim() && !config?.is_configured) {
      toast.error('Validation Error', 'Sarvam AI API key is required.');
      return;
    }
    saveMutation.mutate({
      api_key: apiKey.trim(),
      default_voice: defaultVoice,
      set_active: setActive,
    });
  };

  const handlePlayPreview = async () => {
    if (isPlayingPreview && audioRef.current) {
      audioRef.current.pause();
      setIsPlayingPreview(false);
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (previewObjectUrlRef.current) {
      URL.revokeObjectURL(previewObjectUrlRef.current);
      previewObjectUrlRef.current = null;
    }

    try {
      setIsPlayingPreview(true);
      // Fetch through apiClient so the JWT header is attached, then play
      // the returned blob via an object URL.
      const res = await apiClient.get(`/voice/preview-sarvam/${encodeURIComponent(defaultVoice)}`, {
        responseType: 'blob',
      });
      const objectUrl = URL.createObjectURL(res.data as Blob);
      previewObjectUrlRef.current = objectUrl;
      const audio = new Audio(objectUrl);
      audioRef.current = audio;

      audio.play().catch((err) => {
        console.warn('Audio play error:', err);
        setIsPlayingPreview(false);
        toast.error('Preview Error', 'Could not play voice sample. Ensure API key is valid.');
      });

      audio.onended = () => {
        setIsPlayingPreview(false);
        audioRef.current = null;
      };

      audio.onerror = () => {
        setIsPlayingPreview(false);
        audioRef.current = null;
      };
    } catch (e) {
      setIsPlayingPreview(false);
      toast.error('Preview Error', 'Could not load voice sample. Ensure API key is valid.');
    }
  };

  const isCurrentActive = modelMode?.mode === 'sarvam';

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-amber-500/5 dark:from-amber-950/20 dark:via-orange-950/20 dark:to-transparent border border-amber-500/20 rounded-2xl gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Sarvam AI Platform</h3>
              <Badge variant={isCurrentActive ? 'success' : 'default'} className="text-[10px] uppercase font-bold tracking-wider">
                {isCurrentActive ? 'Active Call Engine' : 'Configured'}
              </Badge>
              <Badge variant="amber" className="text-[10px] border-amber-500/30 text-amber-700 dark:text-amber-400">
                Bulbul v3 + Saaras v3
              </Badge>
            </div>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
              Specialized Indian language intelligence with state-of-the-art Hindi, Marathi, Bengali, Tamil, Telugu, and English neural voices.
            </p>
          </div>

        <div className="flex items-center gap-2">
          {!isCurrentActive ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={activateMutation.isPending}
              onClick={() => activateMutation.mutate()}
              className="border-orange-500/30 text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-950/30 text-xs"
            >
              {activateMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Zap className="w-3.5 h-3.5 mr-1.5" />}
              Set as Active Engine
            </Button>
          ) : (
            <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-lg border border-emerald-500/20">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Active for All Calls</span>
            </div>
          )}
        </div>
      </div>

      {/* Main Settings Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-orange-500" />
              <CardTitle className="text-sm">API Subscription Key & Voice Engine</CardTitle>
            </div>
            <a
              href="https://www.sarvam.ai/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-orange-600 dark:text-orange-400 hover:underline flex items-center gap-1"
            >
              <span>Sarvam Console</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          <CardDescription className="text-xs">
            Enter your Sarvam AI API subscription key to enable Bulbul v3 neural voice synthesis and Saaras v3 speech recognition for phone calls.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-5">
          {/* API Key Input */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-slate-700 dark:text-zinc-300">
                Sarvam API Key <span className="text-red-500">*</span>
              </label>
              <span className="text-[11px] text-slate-400">Header: api-subscription-key</span>
            </div>
            <div className="relative">
              <Input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk_nipv0trp_..."
                className="font-mono text-xs pr-10"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200"
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Voice & Models Configuration Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            {/* Default Voice */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-700 dark:text-zinc-300">Default Sarvam Voice</label>
              <div className="flex items-center gap-2">
                <Select
                  value={defaultVoice}
                  onChange={(e) => setDefaultVoice(e.target.value)}
                  className="text-xs flex-1"
                >
                  <option value="shubh">Shubh (Male - Hindi Conversational)</option>
                  <option value="ritu">Ritu (Female - Hindi Professional)</option>
                  <option value="aditya">Aditya (Male - Marathi & Hindi)</option>
                  <option value="priya">Priya (Female - Tamil & Hindi)</option>
                  <option value="rahul">Rahul (Male - Punjabi & Hindi)</option>
                  <option value="pooja">Pooja (Female - Cheerful & Friendly)</option>
                  <option value="kavya">Kavya (Female - Soft & Empathetic)</option>
                  <option value="rohan">Rohan (Male - Executive Hindi)</option>
                  <option value="neha">Neha (Female - Advisory)</option>
                  <option value="simran">Simran (Female - Welcoming)</option>
                  <option value="amit">Amit (Male - Articulate Support)</option>
                  <option value="ashutosh">Ashutosh (Male - Trustworthy)</option>
                </Select>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handlePlayPreview}
                  className="text-xs flex items-center gap-1.5 shrink-0 px-3"
                  title="Listen to sample audio"
                >
                  {isPlayingPreview ? (
                    <>
                      <Pause className="w-3.5 h-3.5 text-amber-500 fill-amber-500 animate-pulse" />
                      <span>Stop</span>
                    </>
                  ) : (
                    <>
                      <Volume2 className="w-3.5 h-3.5 text-slate-600 dark:text-zinc-300" />
                      <span>Hear Sample</span>
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* STT Model */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-700 dark:text-zinc-300">Speech-to-Text Model</label>
              <Input
                value="saaras:v3 (Multilingual Indic STT)"
                readOnly
                disabled
                className="text-xs bg-slate-50 dark:bg-zinc-900 text-slate-500"
              />
            </div>

            {/* TTS Model */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-700 dark:text-zinc-300">Text-to-Speech Engine</label>
              <Input
                value="bulbul:v3 (Neural Voice Synthesis)"
                readOnly
                disabled
                className="text-xs bg-slate-50 dark:bg-zinc-900 text-slate-500"
              />
            </div>

            {/* LLM Model */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-700 dark:text-zinc-300">Chat & Reasoning Intelligence</label>
              <Input
                value="sarvam-105b (Conversational Indic)"
                readOnly
                disabled
                className="text-xs bg-slate-50 dark:bg-zinc-900 text-slate-500"
              />
            </div>
          </div>

          {/* Test Connection Banner */}
          {testResult && (
            <div
              className={`p-3 rounded-xl border flex items-start gap-3 text-xs transition-all ${
                testResult.connected
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-800 dark:text-rose-300'
              }`}
            >
              {testResult.connected ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              )}
              <div className="flex-1">
                <div className="font-semibold">{testResult.status}</div>
                <div className="text-[11px] opacity-90 mt-0.5">{testResult.message}</div>
                {testResult.connected && (
                  <div className="mt-1 text-[10px] opacity-75">
                    Model: {testResult.model} • Speaker: {testResult.speaker} • Live Audio Stream Verified
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>

        <CardFooter className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-100 dark:border-zinc-800/80 pt-4">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={testMutation.isPending || !apiKey}
            onClick={() => testMutation.mutate()}
            className="w-full sm:w-auto text-xs flex items-center gap-1.5"
          >
            {testMutation.isPending ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Verifying with Sarvam API...</span>
              </>
            ) : (
              <>
                <Activity className="w-3.5 h-3.5 text-amber-500" />
                <span>Test Live Connection</span>
              </>
            )}
          </Button>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={saveMutation.isPending}
              onClick={() => handleSave(true)}
              className="w-full sm:w-auto text-xs bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-medium shadow-sm"
            >
              {saveMutation.isPending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5 mr-1.5" />
                  <span>Save & Activate Engine</span>
                </>
              )}
            </Button>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
};
