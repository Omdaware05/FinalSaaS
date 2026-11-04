import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Badge } from '../ui/Badge';
import { useAuth } from '../../app/providers/AuthProvider';
import { useToast } from '../../app/providers/ToastProvider';
import { telephonyApi, VoBizConfigResponse, VoBizTestResponse } from '../../services/api/telephony';
import { agentsApi } from '../../services/api/agents';
import { getErrorMessage } from '../../services/api/client';
import {
  KeyRound,
  Shield,
  CheckCircle2,
  LogOut,
  Phone,
  PhoneCall,
  Activity,
  Check,
  Eye,
  EyeOff,
  Radio,
  Bot,
} from 'lucide-react';
import { clsx } from 'clsx';

export const AuthModal: React.FC = () => {
  const { isAuthModalOpen, closeAuthModal, token, logout, login } = useAuth();
  const [activeTab, setActiveTab] = useState<'vobiz' | 'api'>('vobiz');
  const toast = useToast();
  const queryClient = useQueryClient();

  // Sign-in State (email + password -> JWT)
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  // VoBiz Credentials State
  const [authId, setAuthId] = useState('');
  const [authToken, setAuthTokenInput] = useState('');
  const [fromNumber, setFromNumber] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [testResult, setTestResult] = useState<VoBizTestResponse | null>(null);

  // Quick Agent Call State
  const [destinationNumber, setDestinationNumber] = useState('');
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [isCalling, setIsCalling] = useState(false);

  // Load VoBiz Configuration
  const { data: vobizConfig, refetch: refetchVobiz } = useQuery<VoBizConfigResponse>({
    queryKey: ['vobiz-telephony-config'],
    queryFn: () => telephonyApi.getVoBizConfig(),
    enabled: isAuthModalOpen,
  });

  // Load Agents for Quick Call
  const { data: agents = [] } = useQuery({
    queryKey: ['agents'],
    queryFn: () => agentsApi.getAgents(50),
    enabled: isAuthModalOpen,
  });

  useEffect(() => {
    if (vobizConfig) {
      setAuthId(vobizConfig.auth_id || '');
      setFromNumber(vobizConfig.phone_number || '');
      setAuthTokenInput('');
    }
  }, [vobizConfig]);

  useEffect(() => {
    if (agents.length > 0 && !selectedAgentId) {
      setSelectedAgentId(agents[0].agent_id);
    }
  }, [agents, selectedAgentId]);

  // Save VoBiz Credentials Mutation
  const saveVobizMutation = useMutation({
    mutationFn: (data: { auth_id: string; auth_token: string; phone_number: string }) =>
      telephonyApi.saveVoBizConfig(data),
    onSuccess: (res) => {
      toast.success('VoBiz Credentials Updated', res.message || 'Saved VoBiz Auth ID, Token & From Number.');
      queryClient.invalidateQueries({ queryKey: ['vobiz-telephony-config'] });
      queryClient.invalidateQueries({ queryKey: ['model-lab-telephony-config'] });
      setAuthTokenInput('');
      setTestResult(null);
    },
    onError: (err) => {
      toast.error('Failed to Save VoBiz Credentials', getErrorMessage(err));
    },
  });

  // Test VoBiz Connection Mutation
  const testVobizMutation = useMutation({
    mutationFn: () => telephonyApi.testVoBizConnection(),
    onSuccess: (res) => {
      setTestResult(res);
      if (res.connected) {
        toast.success('VoBiz Connected', res.message);
      } else {
        toast.warning(res.status, res.message);
      }
    },
    onError: (err) => {
      toast.error('Connection Test Failed', getErrorMessage(err));
    },
  });

  // Email + Password Sign-in Handler (JWT)
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail.trim() || !loginPassword) {
      toast.error('Sign-in details required', 'Enter your email and password to sign in.');
      return;
    }

    setIsVerifying(true);
    try {
      const ok = await login(loginEmail.trim(), loginPassword);
      if (ok) {
        toast.success('Signed in', 'Welcome back.');
        setLoginPassword('');
        queryClient.invalidateQueries();
        closeAuthModal();
      } else {
        toast.error('Sign-in failed', 'The backend did not return an access token.');
      }
    } catch (err) {
      toast.error('Sign-in failed', getErrorMessage(err));
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSignOut = () => {
    logout();
    setLoginPassword('');
    toast.info('Signed out');
    closeAuthModal();
  };

  // Save VoBiz Handler
  const handleSaveVobiz = (e: React.FormEvent) => {
    e.preventDefault();
    saveVobizMutation.mutate({
      auth_id: authId.trim(),
      auth_token: authToken.trim(),
      phone_number: fromNumber.trim(),
    });
  };

  // Trigger Outbound Agent Call
  const handleTriggerAgentCall = async () => {
    if (!destinationNumber.trim()) {
      toast.error('Phone number required', 'Please enter a destination phone number to call.');
      return;
    }
    if (!selectedAgentId) {
      toast.error('Agent required', 'Please select an agent to place the call.');
      return;
    }

    setIsCalling(true);
    try {
      const res = await agentsApi.startCalls(selectedAgentId, {
        phone_numbers: [destinationNumber.trim()],
        concurrency: 1,
        provider: 'vobiz',
        language: 'English',
      });
      toast.success('Call Dispatched', `Agent is calling ${destinationNumber} via VoBiz (${res.status})`);
      setDestinationNumber('');
      queryClient.invalidateQueries({ queryKey: ['active-calls'] });
      queryClient.invalidateQueries({ queryKey: ['calls'] });
    } catch (err) {
      toast.error('Failed to Initiate Call', getErrorMessage(err));
    } finally {
      setIsCalling(false);
    }
  };

  return (
    <Modal
      isOpen={isAuthModalOpen}
      onClose={closeAuthModal}
      title="Authentication & Telephony Credentials"
      description="Update your VoBiz Auth ID, Auth Token, From Number (Caller ID), or sign in to your account."
      size="lg"
    >
      <div className="flex flex-col gap-4">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-200 dark:border-zinc-800 pb-2">
            <button
            type="button"
            onClick={() => setActiveTab('vobiz')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition-colors flex items-center gap-1.5 ${
              activeTab === 'vobiz'
                ? 'bg-orange-500 text-white shadow-sm'
                : 'text-slate-600 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.05]'
            }`}
          >
            <Phone className="w-3.5 h-3.5" />
            <span>VoBiz Telephony & Caller ID</span>
            {vobizConfig?.configured && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 ml-0.5" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('api')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition-colors flex items-center gap-1.5 ${
              activeTab === 'api'
                ? 'bg-orange-500 text-white shadow-sm'
                : 'text-slate-600 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.05]'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span>Account Sign-in</span>
          </button>
        </div>

        {/* TAB 1: VoBiz Telephony & Calling */}
        {activeTab === 'vobiz' && (
          <div className="space-y-4">
            <form onSubmit={handleSaveVobiz} className="space-y-4">
              <div className="p-3.5 rounded-2xl border border-slate-200/80 dark:border-white/[0.08] bg-slate-50/50 dark:bg-white/[0.03] text-xs text-slate-900 dark:text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Radio className="w-4 h-4 text-orange-400 shrink-0 animate-pulse" />
                  <div>
                    <span className="font-semibold">VoBiz Trunk Status: </span>
                    <span className="text-neutral-400">{vobizConfig?.configured ? 'Active & Configured' : 'Credentials Required'}</span>
                  </div>
                </div>
                {vobizConfig?.phone_number && (
                  <Badge variant="warning" size="xs">
                    Caller ID: {vobizConfig.phone_number}
                  </Badge>
                )}
              </div>

              {/* Diagnostic Banner */}
              {testResult && (
                <div
                  className={clsx(
                    'p-2.5 rounded-lg border text-xs flex items-center justify-between',
                    testResult.connected
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                      : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300'
                  )}
                >
                  <span>{testResult.message}</span>
                  {testResult.http_code && (
                    <span className="font-mono text-[10px] opacity-75">HTTP {testResult.http_code}</span>
                  )}
                </div>
              )}

              {/* Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <Input
                    label="VoBiz Auth ID"
                    placeholder="e.g. MA_73H300AC..."
                    value={authId}
                    onChange={(e) => setAuthId(e.target.value)}
                    className="font-mono text-xs"
                    helperText="Your VoBiz Account SID / Auth ID"
                    required
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300 flex items-center justify-between mb-1.5">
                    <span>VoBiz Auth Token</span>
                    {vobizConfig?.has_token && !authToken && (
                      <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400">
                        {vobizConfig.auth_token_masked}
                      </span>
                    )}
                  </label>
                  <div className="relative">
                    <Input
                      type={showToken ? 'text' : 'password'}
                      placeholder={
                        vobizConfig?.has_token
                          ? '•••••••••••••••• (Leave blank to keep current)'
                          : 'Enter VoBiz Auth Token...'
                      }
                      value={authToken}
                      onChange={(e) => setAuthTokenInput(e.target.value)}
                      className="font-mono text-xs pr-10"
                      helperText="Leave empty to retain existing stored token"
                    />
                    <button
                      type="button"
                      onClick={() => setShowToken(!showToken)}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200"
                    >
                      {showToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <Input
                    label="VoBiz From Number (Caller ID)"
                    type="tel"
                    placeholder="+918065354620 or +1..."
                    value={fromNumber}
                    onChange={(e) => setFromNumber(e.target.value)}
                    className="font-mono text-xs"
                    helperText="E.164 assigned number with country code used for outbound calls"
                    required
                  />
                </div>
              </div>

              {/* Action Buttons for VoBiz */}
              <div className="flex items-center justify-between pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="xs"
                  onClick={() => testVobizMutation.mutate()}
                  disabled={testVobizMutation.isPending || !authId}
                  className="gap-1 text-xs"
                >
                  <Activity className={clsx('w-3.5 h-3.5 text-orange-400', testVobizMutation.isPending && 'animate-spin')} />
                  <span>{testVobizMutation.isPending ? 'Verifying...' : 'Test VoBiz Connection'}</span>
                </Button>

                <Button
                  type="submit"
                  variant="primary"
                  size="xs"
                  disabled={saveVobizMutation.isPending}
                  className="text-xs gap-1 shadow-sm"
                >
                  {saveVobizMutation.isPending ? (
                    <>
                      <Activity className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Save VoBiz Credentials</span>
                    </>
                  )}
                </Button>
              </div>
            </form>

            {/* Direct Call from Agent Panel */}
            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-white/[0.08] bg-slate-50/80 dark:bg-white/[0.03] space-y-3 mt-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-zinc-200">
                  <span>Call from AI Agent</span>
                </div>
                <span className="text-[11px] text-slate-500 dark:text-zinc-400">
                  Dial direct using saved VoBiz trunk
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Select
                  label="Select AI Agent"
                  value={selectedAgentId}
                  onChange={(e) => setSelectedAgentId(e.target.value)}
                  className="text-xs"
                >
                  {agents.map((ag) => (
                    <option key={ag.agent_id} value={ag.agent_id}>
                      {ag.name} ({ag.default_language})
                    </option>
                  ))}
                  {agents.length === 0 && <option value="">No agents found</option>}
                </Select>

                <Input
                  label="Destination Phone Number"
                  placeholder="+919876543210"
                  value={destinationNumber}
                  onChange={(e) => setDestinationNumber(e.target.value)}
                  className="text-xs font-mono"
                  helperText="Include country code (e.g. +91)"
                />
              </div>

              <div className="flex justify-end pt-1">
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={handleTriggerAgentCall}
                  disabled={isCalling || !destinationNumber.trim() || !selectedAgentId}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1.5 shadow-sm"
                >
                  <PhoneCall className={clsx('w-3.5 h-3.5', isCalling && 'animate-spin')} />
                  <span>{isCalling ? 'Dialing...' : 'Place Agent Call'}</span>
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: Account Sign-in (JWT) */}
        {activeTab === 'api' && (
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="p-3.5 rounded-2xl border border-slate-200/80 dark:border-white/[0.08] bg-slate-50/50 dark:bg-white/[0.03] text-xs text-slate-600 dark:text-neutral-400 space-y-1.5 leading-relaxed">
              <div className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-white">
                <Shield className="w-4 h-4 text-orange-400" />
                <span>Account Sign-in</span>
              </div>
              <p>
                Sign in with the admin account created by setup (default admin@finalsaas.local — password was printed by the setup script).
              </p>
            </div>

            <Input
              label="Email"
              type="email"
              placeholder="admin@finalsaas.local"
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
              leftIcon={<KeyRound className="w-4 h-4 text-slate-400" />}
              required
            />

            <Input
              label="Password"
              type="password"
              placeholder="Enter your password..."
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              helperText="Your password is exchanged for a signed JWT session token"
              required
            />

            <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
              {token ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleSignOut}
                  leftIcon={<LogOut className="w-3.5 h-3.5" />}
                  className="text-rose-600 border-rose-300 dark:border-rose-900/60 hover:bg-rose-50"
                >
                  Sign Out
                </Button>
              ) : <div />}

              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={closeAuthModal} disabled={isVerifying}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  isLoading={isVerifying}
                  leftIcon={<CheckCircle2 className="w-4 h-4" />}
                >
                  Sign In
                </Button>
              </div>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
};
