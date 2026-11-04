import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  KeyRound,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Copy,
  CheckCheck,
  Eye,
  EyeOff,
  Activity,
  RotateCcw,
  Bot,
  Zap,
  Server,
  FileText,
  Clock,
  ShieldCheck,
  Layers,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Badge } from '../../components/ui/Badge';
import { voiceApi, TranscriptApiConfigResponse, TranscriptApiTestResponse } from '../../services/api/voice';
import { useToast } from '../../app/providers/ToastProvider';
import { getErrorMessage } from '../../services/api/client';

export const TranscriptApiSettings: React.FC = () => {
  const toast = useToast();
  const queryClient = useQueryClient();

  // Local Form State
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('gemini-2.0-flash');
  const [customModel, setCustomModel] = useState('');
  const [isCustomModel, setIsCustomModel] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [hasCopiedKey, setHasCopiedKey] = useState(false);
  const [testResult, setTestResult] = useState<TranscriptApiTestResponse | null>(null);

  // Fetch current Transcript API configuration
  const {
    data: config,
    isLoading,
    refetch,
  } = useQuery<TranscriptApiConfigResponse>({
    queryKey: ['transcript-api-config'],
    queryFn: () => voiceApi.getTranscriptApiConfig(),
    refetchInterval: 30000,
  });

  // Sync state when config loads
  useEffect(() => {
    if (config) {
      setApiKey(config.api_key || '');
      const availableIds = config.available_models?.map((m) => m.id) || [];
      if (config.model && !availableIds.includes(config.model)) {
        setIsCustomModel(true);
        setCustomModel(config.model);
        setModel('custom');
      } else {
        setIsCustomModel(false);
        setModel(config.model || 'gemini-2.0-flash');
      }
    }
  }, [config]);

  // Save Mutation
  const saveMutation = useMutation({
    mutationFn: (data: { api_key: string; model: string }) =>
      voiceApi.saveTranscriptApiConfig(data),
    onSuccess: (res) => {
      toast.success('Transcript API Key Saved', res.message || 'Key updated and active in real-time.');
      queryClient.invalidateQueries({ queryKey: ['transcript-api-config'] });
      setTestResult(null); // Prompt user to re-verify new credentials
      refetch();
    },
    onError: (err) => {
      toast.error('Failed to Save Credentials', getErrorMessage(err));
    },
  });

  // Test Connection Mutation
  const testMutation = useMutation({
    mutationFn: () =>
      voiceApi.testTranscriptApiConnection({
        api_key: apiKey,
        model: isCustomModel ? customModel : model,
      }),
    onSuccess: (res) => {
      setTestResult(res);
      if (res.connected) {
        toast.success('Google Gemini Connected', res.message);
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

  const handleCopy = () => {
    if (!apiKey) return;
    navigator.clipboard.writeText(apiKey);
    setHasCopiedKey(true);
    setTimeout(() => setHasCopiedKey(false), 2000);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const finalModel = isCustomModel ? customModel.trim() : model;
    if (!apiKey.trim() && !config?.is_configured) {
      toast.error('API Key Required', 'Please enter a valid Google Gemini API Key.');
      return;
    }
    saveMutation.mutate({
      api_key: apiKey.trim(),
      model: finalModel || 'gemini-2.5-flash',
    });
  };

  // The API no longer returns the raw key, so configuration status comes
  // from the is_configured flag alone.
  const isConfigured = Boolean(config?.is_configured);

  return (
    <div className="space-y-6">
      <Card className="border-slate-200 dark:border-zinc-800 shadow-sm overflow-hidden">
        {/* Header */}
        <CardHeader className="bg-gradient-to-r from-amber-500/10 via-orange-500/5 to-transparent dark:from-zinc-900/60 dark:to-zinc-900/40 border-b border-slate-200/80 dark:border-zinc-800 pb-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white shadow-md shadow-orange-500/20">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <CardTitle className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  Transcript & Lead Intelligence API
                  <Badge variant="amber" className="text-[10px] border-amber-500/30 text-amber-700 dark:text-amber-400">
                    Google Gemini
                  </Badge>
                </CardTitle>
                <CardDescription className="text-xs text-slate-600 dark:text-zinc-400 mt-0.5">
                  Real-time call transcription intelligence, buyer intent scoring, and objection detection API.
                </CardDescription>
              </div>
            </div>

            {/* Status Indicator */}
            <div className="flex items-center gap-2 self-start sm:self-auto">
              {isConfigured ? (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400 border border-emerald-200/80 dark:border-emerald-800/80 shadow-sm">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span>API Key Configured & Active</span>
                </div>
              ) : (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                  <span>API Key Missing</span>
                </div>
              )}
            </div>
          </div>
        </CardHeader>

        {/* Form Body */}
        <form onSubmit={handleSave}>
          <CardContent className="space-y-6 pt-6">
            {/* API Key Input */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-slate-900 dark:text-zinc-100 flex items-center gap-1.5">
                  <KeyRound className="w-4 h-4 text-amber-500" />
                  Google Gemini API Key
                  <span className="text-red-500">*</span>
                </label>
                {config?.masked_api_key && (
                  <span className="text-xs text-slate-500 dark:text-zinc-500 font-mono">
                    Current: {config.masked_api_key}
                  </span>
                )}
              </div>

              <div className="relative">
                <Input
                  type={showKey ? 'text' : 'password'}
                  placeholder="Paste your Google Gemini API key (e.g. AIzaSy...)"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="pr-20 font-mono text-sm bg-slate-50 dark:bg-zinc-900 border-slate-200 dark:border-zinc-800"
                  required
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 rounded transition-colors"
                    title={showKey ? 'Hide Key' : 'Show Key'}
                  >
                    {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={handleCopy}
                    disabled={!apiKey}
                    className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 rounded transition-colors disabled:opacity-40"
                    title="Copy Key"
                  >
                    {hasCopiedKey ? (
                      <CheckCheck className="w-4 h-4 text-emerald-500" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                Key is securely saved in runtime memory and persisted into <code className="px-1 py-0.5 rounded bg-slate-100 dark:bg-zinc-800 text-amber-600 dark:text-amber-400">.env</code>. Updates apply in real-time without restarting the server.
              </p>
            </div>

            {/* Model Selection */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-900 dark:text-zinc-100 flex items-center gap-1.5">
                  <Bot className="w-4 h-4 text-orange-500" />
                  Gemini LLM Model for Transcript Analysis
                </label>
                <Select
                  value={isCustomModel ? 'custom' : model}
                  onChange={(e) => {
                    if (e.target.value === 'custom') {
                      setIsCustomModel(true);
                    } else {
                      setIsCustomModel(false);
                      setModel(e.target.value);
                    }
                  }}
                  className="bg-slate-50 dark:bg-zinc-900 border-slate-200 dark:border-zinc-800"
                >
                  {(config?.available_models || [
                    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash (Fast & Recommended)' },
                    { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash (Standard Fast)' },
                    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash (Ultra-Fast)' },
                    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro (High Accuracy)' },
                    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro (Deep Reasoning & Complex Nuances)' },
                  ]).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                  <option value="custom">Custom Model Name...</option>
                </Select>
              </div>

              {isCustomModel && (
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-900 dark:text-zinc-100">
                    Custom Model Identifier
                  </label>
                  <Input
                    type="text"
                    placeholder="e.g. gemini-2.5-flash"
                    value={customModel}
                    onChange={(e) => setCustomModel(e.target.value)}
                    className="bg-slate-50 dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 font-mono text-xs"
                  />
                </div>
              )}

              {/* Call STT Architecture Info */}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-900 dark:text-zinc-100 flex items-center gap-1.5">
                  <Activity className="w-4 h-4 text-emerald-500" />
                  Telephony Live STT Speech Engine
                </label>
                <div className="h-10 px-3.5 rounded-lg bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-xs text-slate-700 dark:text-zinc-300 flex items-center justify-between">
                  <span className="font-medium">Sarvam AI Saaras v3 (8kHz PSTN)</span>
                  <Badge variant="success" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400">
                    PSTN Synchronized
                  </Badge>
                </div>
              </div>
            </div>

            {/* Quota Expiration & Key Refresh Guidance Banner */}
            <div className="p-4 rounded-xl bg-gradient-to-r from-amber-500/10 via-orange-500/5 to-transparent dark:from-amber-950/20 dark:via-orange-950/10 dark:to-transparent border border-amber-500/20">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
                  <Zap className="w-4 h-4" />
                </div>
                <div className="flex-1 space-y-1">
                  <h4 className="text-xs font-bold text-slate-900 dark:text-zinc-100 flex items-center gap-2">
                    API Quota Limits & Live Key Rotation:
                  </h4>
                  <p className="text-xs text-slate-600 dark:text-zinc-400 leading-relaxed">
                    If your Google Gemini API key exhausts its rate limit or free tier quota, rotate it instantly without code modifications or server downtime. Generate a new API key in Google AI Studio, paste it above, and click <strong>Save & Update Key</strong>. The platform immediately begins using the new key in real time.
                  </p>
                  <div className="pt-2">
                    <a
                      href="https://aistudio.google.com/app/apikey"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 underline"
                    >
                      <span>Generate Google AI Studio API Key</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              </div>
            </div>

            {/* Test Results Banner */}
            {testResult && (
              <div
                className={`p-4 rounded-xl border ${
                  testResult.connected
                    ? 'bg-emerald-50/80 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/60'
                    : 'bg-red-50/80 dark:bg-red-950/20 border-red-200 dark:border-red-800/60'
                }`}
              >
                <div className="flex items-start gap-3">
                  {testResult.connected ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                  )}
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-white">
                        Status: {testResult.status}
                      </span>
                      {testResult.latency_ms && (
                        <span className="text-xs text-slate-500 dark:text-zinc-400 font-mono">
                          ({testResult.latency_ms}ms)
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-700 dark:text-zinc-300">
                      {testResult.message}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>

          {/* Footer Actions */}
          <CardFooter className="bg-slate-50 dark:bg-zinc-900/60 border-t border-slate-200/80 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 py-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => testMutation.mutate()}
              disabled={testMutation.isPending || !apiKey.trim()}
              className="w-full sm:w-auto text-xs flex items-center gap-1.5"
            >
              {testMutation.isPending ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                  Testing Google API...
                </>
              ) : (
                <>
                  <Activity className="w-3.5 h-3.5 text-amber-500" />
                  Test Live Connection
                </>
              )}
            </Button>

            <Button
              type="submit"
              size="sm"
              disabled={saveMutation.isPending}
              className="w-full sm:w-auto text-xs bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-medium shadow-sm shadow-orange-500/20"
            >
              {saveMutation.isPending ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Saving & Updating...
                </>
              ) : (
                <>
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Save & Update Key (Real-Time)
                </>
              )}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
};
