import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '../../components/layout/PageHeader';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { Tabs } from '../../components/ui/Tabs';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Badge } from '../../components/ui/Badge';
import { Skeleton } from '../../components/ui/Skeleton';
import { modelConfigApi } from '../../services/api/modelConfig';
import { useToast } from '../../app/providers/ToastProvider';
import { getErrorMessage } from '../../services/api/client';
import { ModelType, ModelProviderSchema } from '../../types/api';
import {
  Sliders,
  CheckCircle2,
  AlertTriangle,
  Zap,
  Radio,
  KeyRound,
  ShieldCheck,
  ShieldAlert,
  Server,
  RefreshCw,
  Cpu,
} from 'lucide-react';

export const ModelConfigPage: React.FC = () => {
  const queryClient = useQueryClient();
  const toast = useToast();

  const [activeModelType, setActiveModelType] = useState<ModelType>('stt');
  const [selectedProvider, setSelectedProvider] = useState<string>('');
  const [formParams, setFormParams] = useState<Record<string, any>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isActivating, setIsActivating] = useState(false);
  const [isDeactivating, setIsDeactivating] = useState(false);

  // Queries
  const { data: allProviders = [] } = useQuery({
    queryKey: ['model-providers'],
    queryFn: () => modelConfigApi.getModelProviders(),
  });

  const { data: activeConfig, refetch: refetchConfig } = useQuery({
    queryKey: ['model-config', activeModelType],
    queryFn: () => modelConfigApi.getModelConfig(activeModelType),
  });

  const { data: credStatus } = useQuery({
    queryKey: ['model-cred-status', activeModelType],
    queryFn: () => modelConfigApi.getCredentialsStatus(activeModelType),
  });

  // Providers filtered by current model type
  const typeProviders = React.useMemo(() => {
    return allProviders.filter((p) => p.model_type === activeModelType);
  }, [allProviders, activeModelType]);

  // Selected Provider Schema query
  const { data: providerSchema, isLoading: schemaLoading } = useQuery<ModelProviderSchema>({
    queryKey: ['provider-schema', selectedProvider],
    queryFn: () => modelConfigApi.getProviderSchema(selectedProvider),
    enabled: !!selectedProvider,
  });

  useEffect(() => {
    if (activeConfig) {
      setSelectedProvider(activeConfig.provider || (typeProviders[0]?.provider_id || ''));
      setFormParams(activeConfig.parameters || {});
    } else if (typeProviders.length > 0) {
      setSelectedProvider(typeProviders[0].provider_id);
      setFormParams({});
    }
  }, [activeConfig, typeProviders, activeModelType]);

  // 1. Save Draft
  const handleSaveDraft = async () => {
    setIsSaving(true);
    try {
      await modelConfigApi.saveDraftConfig(activeModelType, {
        provider: selectedProvider,
        parameters: formParams,
      });
      toast.success('Draft Saved', `Config draft for ${activeModelType.toUpperCase()} updated.`);
      refetchConfig();
    } catch (err: any) {
      toast.error('Save Draft Failed', getErrorMessage(err));
    } finally {
      setIsSaving(false);
    }
  };

  // 2. Validate
  const handleValidate = async () => {
    setIsValidating(true);
    try {
      const res = await modelConfigApi.validateDraftConfig(activeModelType);
      if (res.valid) {
        toast.success('Validation Passed', 'Configuration parameters are syntactically valid.');
      } else {
        toast.warning('Validation Issues', res.errors.join(', '));
      }
    } catch (err: any) {
      toast.error('Validation Error', getErrorMessage(err));
    } finally {
      setIsValidating(false);
    }
  };

  // 3. Test Connectivity
  const handleTestDraft = async () => {
    setIsTesting(true);
    try {
      const res = await modelConfigApi.testDraftConnectivity(activeModelType);
      if (res.reachable) {
        toast.success(
          'Connection Successful',
          `Target reached with latency ${res.latency_ms || 0}ms: ${res.message || 'Server responded.'}`
        );
      } else {
        toast.error('Cannot Reach Server', res.message || 'Connection timed out or failed.');
      }
    } catch (err: any) {
      toast.error('Connection Test Failed', getErrorMessage(err));
    } finally {
      setIsTesting(false);
    }
  };

  // 4. Activate
  const handleActivate = async () => {
    setIsActivating(true);
    try {
      await modelConfigApi.activateModelConfig(activeModelType);
      toast.success('Model Activated', `Active runtime switched to snapshot for ${activeModelType.toUpperCase()}.`);
      refetchConfig();
    } catch (err: any) {
      toast.error('Activation Failed', getErrorMessage(err));
    } finally {
      setIsActivating(false);
    }
  };

  // 5. Deactivate (Fallback to .env)
  const handleDeactivate = async () => {
    setIsDeactivating(true);
    try {
      await modelConfigApi.deactivateModelConfig(activeModelType);
      toast.info('Model Deactivated', `Restored fallback environment variable resolution for ${activeModelType.toUpperCase()}.`);
      refetchConfig();
    } catch (err: any) {
      toast.error('Deactivation Failed', getErrorMessage(err));
    } finally {
      setIsDeactivating(false);
    }
  };

  const tabs = [
    { id: 'stt', label: 'Speech-to-Text (STT)' },
    { id: 'tts', label: 'Text-to-Speech (TTS)' },
    { id: 'llm', label: 'Language Model (LLM)' },
    { id: 'interest', label: 'Interest Classifier' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        category="AI Configuration"
        title="AI Pipeline & Model Providers"
        subtitle="Configure Speech-to-Text, Voice Synthesis, LLMs, and post-call interest classifiers with zero downtime."
      />

      {/* Model Type Tabs */}
      <Tabs
        tabs={tabs}
        activeTab={activeModelType}
        onChange={(t) => setActiveModelType(t as ModelType)}
        variant="segmented"
        size="md"
      />

      {/* Active Model Snapshot Summary Card */}
      <div data-glow="" className="p-4 rounded-2xl bg-white/75 dark:bg-[var(--card-glass-bg)] backdrop-blur-[18px] border border-slate-200/80 dark:border-white/[0.09] flex flex-wrap items-center justify-between gap-4 shadow-sm dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_8px_32px_rgba(0,0,0,0.35)] glow-card">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-500/10 text-orange-500 dark:text-orange-400 flex items-center justify-center font-bold">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-slate-900 dark:text-slate-100">
                {activeModelType.toUpperCase()} Engine: {activeConfig?.provider || 'Default Environment'}
              </span>
              <Badge variant={activeConfig?.is_active ? 'success' : 'default'} size="xs" dot>
                {activeConfig?.is_active ? 'Active DB Snapshot' : 'Env Var Fallback'}
              </Badge>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Source: <code className="text-slate-700 dark:text-slate-300">{activeConfig?.source || 'environment'}</code>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {credStatus?.configured ? (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 border border-emerald-200 dark:border-emerald-800/60">
              <ShieldCheck className="w-3.5 h-3.5" /> Credentials Configured
            </span>
          ) : (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-500">
              <KeyRound className="w-3.5 h-3.5" /> Public / Local Target
            </span>
          )}

          {activeConfig?.is_active && (
            <Button
              variant="outline"
              size="xs"
              onClick={handleDeactivate}
              isLoading={isDeactivating}
              className="text-rose-600 border-rose-300 dark:border-rose-900/60"
            >
              Restore Env Fallback
            </Button>
          )}
        </div>
      </div>

      {/* Dynamic Schema Form Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Provider & Parameter Configuration</CardTitle>
          <CardDescription>
            Select a driver schema and customize connection URLs, model identifiers, temperature, and audio sample rates.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-5">
            {/* Provider Selector */}
            <div className="max-w-md">
              <Select
                label="Target Provider Driver"
                value={selectedProvider}
                onChange={(e) => {
                  setSelectedProvider(e.target.value);
                  setFormParams({});
                }}
              >
                {typeProviders.map((p) => (
                  <option key={p.provider_id} value={p.provider_id}>
                    {p.name} {p.description ? `— ${p.description}` : ''}
                  </option>
                ))}
                {typeProviders.length === 0 && <option value="custom_http">Custom HTTP Server</option>}
              </Select>
            </div>

            {/* Dynamic Schema Form Fields */}
            {schemaLoading ? (
              <div className="space-y-3 py-4">
                <Skeleton height={36} />
                <Skeleton height={36} />
              </div>
            ) : providerSchema && providerSchema.fields?.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-2xl bg-slate-50/70 dark:bg-slate-900/40 border border-slate-200/60 dark:border-slate-800">
                {providerSchema.fields.map((field) => (
                  <div key={field.name} className={field.type === 'text' && field.name.includes('prompt') ? 'sm:col-span-2' : ''}>
                    {field.type === 'select' ? (
                      <Select
                        label={field.label}
                        value={formParams[field.name] ?? field.default ?? ''}
                        onChange={(e) => setFormParams({ ...formParams, [field.name]: e.target.value })}
                        required={field.required}
                        helperText={field.description}
                      >
                        {field.options?.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      <Input
                        label={field.label}
                        type={field.type === 'password' ? 'password' : field.type === 'number' ? 'number' : 'text'}
                        placeholder={field.placeholder || `Enter ${field.label}...`}
                        value={formParams[field.name] ?? field.default ?? ''}
                        onChange={(e) =>
                          setFormParams({
                            ...formParams,
                            [field.name]: field.type === 'number' ? parseFloat(e.target.value) : e.target.value,
                          })
                        }
                        required={field.required}
                        helperText={field.description}
                      />
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200/60 dark:border-slate-800 space-y-4">
                <Input
                  label="Server Endpoint URL"
                  placeholder="http://10.217.120.77:8001/transcribe"
                  value={formParams['url'] || ''}
                  onChange={(e) => setFormParams({ ...formParams, url: e.target.value })}
                  helperText="Enter the full HTTP target URL for this microservice"
                />
                <Input
                  label="Model Identifier / Name"
                  placeholder="e.g. whisper-large-v3-turbo, qwen2.5-7b-instruct"
                  value={formParams['model'] || ''}
                  onChange={(e) => setFormParams({ ...formParams, model: e.target.value })}
                />
              </div>
            )}

            {/* 4-Step Activation Workflow Controls */}
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSaveDraft}
                  isLoading={isSaving}
                >
                  1. Save Draft
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleValidate}
                  isLoading={isValidating}
                >
                  2. Validate
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleTestDraft}
                  isLoading={isTesting}
                  leftIcon={<Radio className="w-3.5 h-3.5" />}
                >
                  3. Test Connection
                </Button>
              </div>

              <Button
                variant="primary"
                size="sm"
                onClick={handleActivate}
                isLoading={isActivating}
                leftIcon={<Zap className="w-4 h-4" />}
                className="shadow-sm"
              >
                4. Activate Snapshot
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
