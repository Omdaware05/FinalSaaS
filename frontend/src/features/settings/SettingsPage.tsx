import React, { useState } from 'react';
import { PageHeader } from '../../components/layout/PageHeader';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { useTheme } from '../../app/providers/ThemeProvider';
import { useAuth } from '../../app/providers/AuthProvider';
import {
  Settings,
  Sun,
  Moon,
  Laptop,
  KeyRound,
  ShieldCheck,
  ExternalLink,
  Radio,
  Phone,
  FileText,
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { VoBizTelephonySettings } from './VoBizTelephonySettings';
import { TwilioTelephonySettings } from './TwilioTelephonySettings';
import { SarvamSettings } from './SarvamSettings';
import { TranscriptApiSettings } from './TranscriptApiSettings';
import { ModelModeSwitcher } from '../../components/ui/ModelModeSwitcher';

interface SettingsPageProps {
  initialTab?: 'sarvam' | 'telephony' | 'twilio' | 'transcript' | 'workspace';
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ initialTab }) => {
  const { theme, setTheme } = useTheme();
  const { isAuthenticated, openAuthModal, logout } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const validTabs: Array<'sarvam' | 'telephony' | 'twilio' | 'transcript' | 'workspace'> = [
    'sarvam',
    'telephony',
    'twilio',
    'transcript',
    'workspace',
  ];
  const paramTab = searchParams.get('tab') as any;
  const currentTab =
    initialTab ||
    (validTabs.includes(paramTab) ? paramTab : 'sarvam');

  const [activeTab, setActiveTab] = useState<'sarvam' | 'telephony' | 'twilio' | 'transcript' | 'workspace'>(currentTab);

  const handleTabChange = (tab: 'sarvam' | 'telephony' | 'twilio' | 'transcript' | 'workspace') => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        category="Management"
        title="Settings & AI Telephony Configuration"
        subtitle="Manage Sarvam AI voice engine, carrier credentials, and workspace preferences."
      />

      {/* Settings Navigation Tabs */}
      <div className="flex items-center gap-2 p-1.5 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-white/[0.08] shadow-[0_1px_3px_rgba(16,24,40,0.04)] overflow-x-auto">
        <button
          type="button"
          onClick={() => handleTabChange('sarvam')}
          className={`px-4 py-2 text-xs font-semibold rounded-xl transition-all flex items-center gap-2 shrink-0 ${
            activeTab === 'sarvam'
              ? 'bg-[#101828] text-white shadow-sm'
              : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-800'
          }`}
        >
          <span>Sarvam AI Voice</span>
        </button>
        <button
          type="button"
          onClick={() => handleTabChange('telephony')}
          className={`px-4 py-2 text-xs font-semibold rounded-xl transition-all flex items-center gap-2 shrink-0 ${
            activeTab === 'telephony'
              ? 'bg-[#101828] text-white shadow-sm'
              : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-800'
          }`}
        >
          <Phone className="w-3.5 h-3.5" />
          <span>VoBiz Telephony</span>
        </button>
        <button
          type="button"
          onClick={() => handleTabChange('twilio')}
          className={`px-4 py-2 text-xs font-semibold rounded-xl transition-all flex items-center gap-2 shrink-0 ${
            activeTab === 'twilio'
              ? 'bg-[#101828] text-white shadow-sm'
              : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-800'
          }`}
        >
          <Radio className="w-3.5 h-3.5" />
          <span>Twilio Telephony</span>
        </button>
        <button
          type="button"
          onClick={() => handleTabChange('transcript')}
          className={`px-4 py-2 text-xs font-semibold rounded-xl transition-all flex items-center gap-2 shrink-0 ${
            activeTab === 'transcript'
              ? 'bg-[#101828] text-white shadow-sm'
              : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-800'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Gemini Transcript API</span>
        </button>
        <button
          type="button"
          onClick={() => handleTabChange('workspace')}
          className={`px-4 py-2 text-xs font-semibold rounded-xl transition-all flex items-center gap-2 shrink-0 ${
            activeTab === 'workspace'
              ? 'bg-[#101828] text-white shadow-sm'
              : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-800'
          }`}
        >
          <span>Workspace Preferences</span>
        </button>

        {/* Cloud / Local Model Engine Switcher */}
        <div className="ml-auto inline-flex items-center shrink-0 pr-1">
          <ModelModeSwitcher />
        </div>
      </div>

      {activeTab === 'sarvam' && <SarvamSettings />}
      {activeTab === 'telephony' && <VoBizTelephonySettings />}
      {activeTab === 'twilio' && <TwilioTelephonySettings />}
      {activeTab === 'transcript' && <TranscriptApiSettings />}

      {activeTab === 'workspace' && (
        <div className="space-y-6">
          {/* Theme Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Sun className="w-4 h-4 text-amber-500" />
                <span>Appearance & Theme</span>
              </CardTitle>
              <CardDescription>
                Choose between high-contrast crisp light mode or modern obsidian dark mode.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-xl">
                {/* Light */}
                <button
                  type="button"
                  onClick={() => setTheme('light')}
                  className={`p-4 rounded-xl border text-left flex flex-col gap-2 transition-all ${
                    theme === 'light'
                      ? 'border-slate-900 dark:border-white bg-slate-50 dark:bg-zinc-900 text-slate-900 dark:text-white'
                      : 'border-slate-200 dark:border-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-900/40'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <Sun className="w-5 h-5 text-amber-500" />
                    {theme === 'light' && <Badge variant="warning" size="xs">Active</Badge>}
                  </div>
                  <span className="text-xs font-bold">Light Theme</span>
                  <span className="text-[11px] text-slate-500">High-contrast crisp enterprise dashboard</span>
                </button>

                {/* Dark */}
                <button
                  type="button"
                  onClick={() => setTheme('dark')}
                  className={`p-4 rounded-xl border text-left flex flex-col gap-2 transition-all ${
                    theme === 'dark'
                      ? 'border-orange-500 dark:border-orange-500 bg-orange-500/5 text-slate-900 dark:text-white'
                      : 'border-slate-200 dark:border-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-900/40'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <Moon className="w-5 h-5 text-orange-500" />
                    {theme === 'dark' && <Badge variant="warning" size="xs">Active</Badge>}
                  </div>
                  <span className="text-xs font-bold">Dark Theme</span>
                  <span className="text-[11px] text-slate-500">Obsidian neutral enterprise SaaS interface</span>
                </button>

                {/* System */}
                <button
                  type="button"
                  onClick={() => setTheme('system')}
                  className={`p-4 rounded-xl border text-left flex flex-col gap-2 transition-all ${
                    theme === 'system'
                      ? 'border-orange-500 dark:border-orange-500 bg-orange-500/5 text-slate-900 dark:text-white'
                      : 'border-slate-200 dark:border-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-900/40'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <Laptop className="w-5 h-5 text-slate-500" />
                    {theme === 'system' && <Badge variant="warning" size="xs">Active</Badge>}
                  </div>
                  <span className="text-xs font-bold">System Preference</span>
                  <span className="text-[11px] text-slate-500">Follows OS dark/light mode toggle</span>
                </button>
              </div>
            </CardContent>
          </Card>

          {/* Security & Authentication */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-slate-700 dark:text-zinc-300" />
                <span>API Security & Access Control</span>
              </CardTitle>
              <CardDescription>
                Configure authentication bearer tokens matching the backend <code>API_AUTH_TOKEN</code>.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-slate-50 dark:bg-zinc-900/50 border border-slate-200/60 dark:border-zinc-800">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold shrink-0 ${
                      isAuthenticated
                        ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600'
                        : 'bg-amber-100 dark:bg-amber-950/60 text-amber-600'
                    }`}
                  >
                    {isAuthenticated ? <ShieldCheck className="w-5 h-5" /> : <KeyRound className="w-5 h-5" />}
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                      {isAuthenticated ? 'Authentication Configured' : 'No Secret Token Set'}
                    </h4>
                    <p className="text-xs text-slate-500">
                      {isAuthenticated
                        ? 'Privileged operations will include Authorization: Bearer headers.'
                        : 'Backend running in public development mode or open access.'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button variant="primary" size="xs" onClick={openAuthModal}>
                    {isAuthenticated ? 'Change Token' : 'Set Token'}
                  </Button>
                  {isAuthenticated && (
                    <Button variant="outline" size="xs" onClick={logout} className="text-rose-600">
                      Clear
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};
