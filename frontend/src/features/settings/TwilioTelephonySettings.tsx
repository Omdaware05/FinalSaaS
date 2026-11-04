import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Phone,
  KeyRound,
  ShieldCheck,
  Check,
  Activity,
  Copy,
  CheckCheck,
  Eye,
  EyeOff,
  Radio,
  ExternalLink,
  Info,
  Server,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Badge } from '../../components/ui/Badge';
import { telephonyApi, TwilioConfigResponse, TwilioTestResponse } from '../../services/api/telephony';
import { useToast } from '../../app/providers/ToastProvider';
import { getErrorMessage } from '../../services/api/client';
import { clsx } from 'clsx';

export const TwilioTelephonySettings: React.FC = () => {
  const toast = useToast();
  const queryClient = useQueryClient();

  // Local Form State
  const [accountSid, setAccountSid] = useState('');
  const [authToken, setAuthToken] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [environment, setEnvironment] = useState('production');
  const [showToken, setShowToken] = useState(false);
  const [hasCopiedWebhook, setHasCopiedWebhook] = useState(false);
  const [testResult, setTestResult] = useState<TwilioTestResponse | null>(null);

  // Fetch current Twilio configuration
  const {
    data: config,
    isLoading,
    isRefetching,
    refetch,
  } = useQuery<TwilioConfigResponse>({
    queryKey: ['twilio-telephony-config'],
    queryFn: () => telephonyApi.getTwilioConfig(),
    refetchInterval: 30000,
  });

  // Sync state when config loads
  useEffect(() => {
    if (config) {
      setAccountSid(config.account_sid || '');
      setPhoneNumber(config.phone_number || '');
      setEnvironment(config.environment || 'production');
      setAuthToken('');
    }
  }, [config]);

  // Save Mutation
  const saveMutation = useMutation({
    mutationFn: (data: { account_sid: string; auth_token: string; phone_number: string; environment: string }) =>
      telephonyApi.saveTwilioConfig(data),
    onSuccess: (res) => {
      toast.success('Twilio Credentials Saved', res.message || 'Updated Twilio configuration successfully.');
      queryClient.invalidateQueries({ queryKey: ['twilio-telephony-config'] });
      setAuthToken('');
      setTestResult(null);
    },
    onError: (err) => {
      toast.error('Failed to Save Twilio Credentials', getErrorMessage(err));
    },
  });

  // Test Connection Mutation
  const testMutation = useMutation({
    mutationFn: () => telephonyApi.testTwilioConnection(),
    onSuccess: (res) => {
      setTestResult(res);
      if (res.connected) {
        toast.success('Twilio Telephony Connected', res.message);
      } else {
        toast.warning(res.status, res.message);
      }
    },
    onError: (err) => {
      toast.error('Connection Test Failed', getErrorMessage(err));
      setTestResult({
        status: 'NETWORK ERROR',
        connected: false,
        message: getErrorMessage(err),
        http_code: 500,
      });
    },
  });

  const handleSave = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    saveMutation.mutate({
      account_sid: accountSid.trim(),
      auth_token: authToken.trim(),
      phone_number: phoneNumber.trim(),
      environment,
    });
  };

  const handleTestConnection = () => {
    testMutation.mutate();
  };

  const handleCopyWebhook = () => {
    const url = config?.webhook_url || `${window.location.origin}/api/webhooks/twilio`;
    navigator.clipboard.writeText(url);
    setHasCopiedWebhook(true);
    toast.success('Copied to Clipboard', 'Twilio Call Status Webhook URL copied.');
    setTimeout(() => setHasCopiedWebhook(false), 2500);
  };

  const handleReset = () => {
    if (config) {
      setAccountSid(config.account_sid || '');
      setPhoneNumber(config.phone_number || '');
      setEnvironment(config.environment || 'production');
      setAuthToken('');
      setTestResult(null);
      toast.info('Form Reset', 'Reverted back to saved configuration.');
    }
  };

  const isConfigured = config?.configured || Boolean(accountSid && (config?.has_token || authToken));

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Top Overview & Status Card */}
      <Card className="border-slate-200 dark:border-zinc-800 shadow-sm overflow-hidden">
        <div className="p-5 bg-gradient-to-r from-red-500/10 via-slate-50 to-white dark:from-red-500/10 dark:via-surface-dark dark:to-surface-dark border-b border-slate-200/80 dark:border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-red-600 text-white flex items-center justify-center shadow-md shadow-red-600/20 shrink-0">
              <Phone className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Twilio Telephony Provider
                </h3>
                {isConfigured ? (
                  <Badge variant="success" size="xs" className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Configured & Active
                  </Badge>
                ) : (
                  <Badge variant="warning" size="xs">
                    Credentials Needed
                  </Badge>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                Global carrier trunk for international and US telephony routing, caller ID, and programmable voice sessions.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isLoading || isRefetching}
              className="text-xs"
              title="Refresh configuration from server"
            >
              <RotateCcw className={clsx('w-3.5 h-3.5', isRefetching && 'animate-spin')} />
              <span>Sync Status</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleTestConnection}
              disabled={testMutation.isPending || (!accountSid && !config?.account_sid)}
              className="text-xs gap-1.5 border-red-500/30 hover:bg-red-500/10 text-red-600 dark:text-red-400"
            >
              <Activity className={clsx('w-3.5 h-3.5', testMutation.isPending && 'animate-spin text-red-500')} />
              <span>{testMutation.isPending ? 'Verifying...' : 'Test Connection'}</span>
            </Button>
          </div>
        </div>

        {/* Live Diagnostics Banner if Tested */}
        {testResult && (
          <div
            className={clsx(
              'px-5 py-3 border-b text-xs flex items-center justify-between transition-all',
              testResult.connected
                ? 'bg-emerald-50/80 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/40 text-emerald-800 dark:text-emerald-300'
                : 'bg-rose-50/80 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800/40 text-rose-800 dark:text-rose-300'
            )}
          >
            <div className="flex items-center gap-2.5">
              {testResult.connected ? (
                <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
              )}
              <div>
                <span className="font-bold uppercase tracking-wider mr-2 text-[10px]">
                  [{testResult.status}]
                </span>
                <span>{testResult.message}</span>
              </div>
            </div>
            {testResult.http_code && (
              <span className="font-mono text-[11px] opacity-75 shrink-0">
                HTTP {testResult.http_code}
              </span>
            )}
          </div>
        )}

        {/* Form Content */}
        <form onSubmit={handleSave}>
          <CardContent className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Twilio Account SID */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="twilio-account-sid" className="text-xs font-semibold text-slate-700 dark:text-zinc-300 flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-red-500" />
                    Twilio Account SID
                    <span className="text-rose-500">*</span>
                  </label>
                  {config?.account_sid && (
                    <span className="text-[11px] font-mono text-slate-400">
                      Saved: {config.account_sid.slice(0, 8)}...
                    </span>
                  )}
                </div>
                <Input
                  id="twilio-account-sid"
                  type="text"
                  placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  value={accountSid}
                  onChange={(e) => setAccountSid(e.target.value)}
                  className="font-mono text-xs"
                  helperText="Your Twilio Account SID starting with AC found in your Twilio Console."
                  required
                />
              </div>

              {/* Twilio Auth Token */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="twilio-auth-token" className="text-xs font-semibold text-slate-700 dark:text-zinc-300 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-red-500" />
                    Twilio Auth Token / API Secret
                    {!config?.has_token && <span className="text-rose-500">*</span>}
                  </label>
                  {config?.has_token && !authToken && (
                    <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400">
                      Active: {config.auth_token_masked}
                    </span>
                  )}
                </div>
                <div className="relative">
                  <Input
                    id="twilio-auth-token"
                    type={showToken ? 'text' : 'password'}
                    placeholder={
                      config?.has_token
                        ? '•••••••••••••••• (Leave blank to keep existing)'
                        : 'Enter Twilio Auth Token...'
                    }
                    value={authToken}
                    onChange={(e) => setAuthToken(e.target.value)}
                    className="font-mono text-xs pr-10"
                    helperText={
                      config?.has_token
                        ? 'Current secret token is safely encrypted. Enter a new token only to replace it.'
                        : 'Primary authentication token from your Twilio Console overview.'
                    }
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken(!showToken)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 transition-colors"
                    title={showToken ? 'Hide token' : 'Show token'}
                  >
                    {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Caller ID / From Number */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="twilio-phone-number" className="text-xs font-semibold text-slate-700 dark:text-zinc-300 flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-red-500" />
                    Twilio Phone Number / Caller ID
                    <span className="text-rose-500">*</span>
                  </label>
                </div>
                <Input
                  id="twilio-phone-number"
                  type="tel"
                  placeholder="+13344895368"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  className="font-mono text-xs"
                  helperText="E.164 phone number active in your Twilio account (e.g. +13344895368)."
                  required
                />
              </div>

              {/* Environment / Routing Mode */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="twilio-env" className="text-xs font-semibold text-slate-700 dark:text-zinc-300 flex items-center gap-1.5">
                    <Server className="w-3.5 h-3.5 text-red-500" />
                    Twilio Endpoint Mode
                  </label>
                </div>
                <Select
                  id="twilio-env"
                  value={environment}
                  onChange={(e) => setEnvironment(e.target.value)}
                  className="text-xs"
                >
                  <option value="production">Production (api.twilio.com)</option>
                  <option value="sandbox">Test / Sandbox</option>
                </Select>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
                  Connects through official Twilio REST API endpoints and carrier SIP trunks.
                </p>
              </div>
            </div>

            {/* Inbound Webhook Box */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-surface-dark/80 border border-slate-200/70 dark:border-white/10 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-zinc-200">
                  <Radio className="w-4 h-4 text-red-500 animate-pulse" />
                  <span>Twilio Voice Webhook URL</span>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={handleCopyWebhook}
                  className="text-[11px] gap-1 h-7 border-slate-300 dark:border-white/10"
                >
                  {hasCopiedWebhook ? (
                    <>
                      <CheckCheck className="w-3.5 h-3.5 text-emerald-500" />
                      <span className="text-emerald-600 dark:text-emerald-400">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-slate-500" />
                      <span>Copy Webhook</span>
                    </>
                  )}
                </Button>
              </div>
              <div className="font-mono text-xs p-2 rounded-lg bg-white/70 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] text-red-600 dark:text-red-400 break-all select-all">
                {config?.webhook_url || `${window.location.origin}/api/webhooks/twilio`}
              </div>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                Paste this into your Twilio Console under <strong>Phone Numbers &gt; Active Numbers &gt; Voice Configuration</strong> for status callbacks and call lifecycle updates.
              </p>
            </div>
          </CardContent>

          {/* Action Toolbar */}
          <CardFooter className="px-6 py-4 bg-slate-50/50 dark:bg-surface-dark/60 border-t border-slate-100 dark:border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="text-[11px] text-slate-500 dark:text-zinc-400 flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-red-500 shrink-0" />
              <span>Credentials update SQLite DB, in-memory settings, Dograh carrier sync, and .env file.</span>
            </div>

            <div className="flex items-center gap-2.5 w-full sm:w-auto">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleReset}
                disabled={saveMutation.isPending}
                className="text-xs w-full sm:w-auto"
              >
                Reset
              </Button>

              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={saveMutation.isPending}
                className="text-xs gap-1.5 w-full sm:w-auto bg-red-600 hover:bg-red-700 text-white shadow-sm shadow-red-600/20"
              >
                {saveMutation.isPending ? (
                  <>
                    <Activity className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving Changes...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Save Twilio Credentials</span>
                  </>
                )}
              </Button>
            </div>
          </CardFooter>
        </form>
      </Card>

      {/* Guide Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xs uppercase tracking-wider text-slate-500 dark:text-zinc-400 flex items-center gap-2">
            <span>Twilio Setup & Verification Guide</span>
            <ExternalLink className="w-3 h-3" />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-xs text-slate-600 dark:text-zinc-400 pt-0">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3 rounded-xl border border-slate-200/60 dark:border-white/[0.08] bg-slate-50/50 dark:bg-white/[0.03]">
              <span className="font-bold text-slate-800 dark:text-zinc-200 block mb-1">
                1. Copy Account SID & Token
              </span>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Log into <strong>console.twilio.com</strong> and copy your <strong>Account SID</strong> and <strong>Auth Token</strong>.
              </p>
            </div>

            <div className="p-3 rounded-xl border border-slate-200/60 dark:border-white/[0.08] bg-slate-50/50 dark:bg-white/[0.03]">
              <span className="font-bold text-slate-800 dark:text-zinc-200 block mb-1">
                2. Set Twilio Phone Number
              </span>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Enter your active Twilio phone number in international E.164 format (e.g. <code>+13344895368</code>).
              </p>
            </div>

            <div className="p-3 rounded-xl border border-slate-200/60 dark:border-white/[0.08] bg-slate-50/50 dark:bg-white/[0.03]">
              <span className="font-bold text-slate-800 dark:text-zinc-200 block mb-1">
                3. Test & Launch Outbound
              </span>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Click <strong>Save Twilio Credentials</strong>, then click <strong>Test Connection</strong> to verify live carrier auth.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
