import React from 'react';
import { PageHeader } from '../../components/layout/PageHeader';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { CallStateBadge, ProviderBadge } from '../../components/ui/Badge';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { useActiveCalls } from '../../hooks/useActiveCalls';
import { callsApi } from '../../services/api/calls';
import { useToast } from '../../app/providers/ToastProvider';
import { Activity, PhoneCall, PhoneOff, Radio, RefreshCw } from 'lucide-react';

export const ActiveCallsPage: React.FC = () => {
  const { activeCalls, activeCount, isLoading, refetch } = useActiveCalls();
  const toast = useToast();

  const handleHangup = async (callId: string) => {
    try {
      await callsApi.hangupCall(callId);
      toast.info('Hangup Dispatched', `Terminated session ${callId}`);
      refetch();
    } catch (err: any) {
      toast.error('Failed to hangup call', err.message);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        category="Voice Operations"
        title="Live Active Calls"
        subtitle="Real-time monitor of full-duplex audio stream connections. Polling interval: 1.5 seconds."
        actions={
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              <span>{activeCount} Active Channel{activeCount !== 1 ? 's' : ''}</span>
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => refetch()}
              leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
            >
              Refresh
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} height={160} />)
        ) : activeCalls.length === 0 ? (
          <div className="col-span-full">
            <EmptyState
              icon={<Radio className="w-6 h-6 text-orange-400" />}
              title="No active calls at this moment"
              description="Telephony channels are currently idle. Initiate calls via an Agent workspace, Campaign, or the Quick Call button."
            />
          </div>
        ) : (
          activeCalls.map((call) => (
            <Card key={call.call_id} className="relative overflow-hidden">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-lg bg-slate-900/[0.04] dark:bg-white/[0.06] text-orange-500 dark:text-orange-400 border border-slate-900/[0.07] dark:border-white/[0.09] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] flex items-center justify-center font-bold shrink-0 shadow-sm">
                    <PhoneCall className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">{call.phone_number}</h3>
                    <p className="text-[10px] text-slate-400 dark:text-neutral-500 font-mono">ID: {call.call_id}</p>
                  </div>
                </div>
                <ProviderBadge provider={call.provider} />
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-white/[0.06] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CallStateBadge state={call.state} size="xs" />
                  {call.state === 'SPEAKING' && (
                    <div className="flex items-center gap-0.5 h-4 px-1.5 bg-orange-500/10 rounded">
                      <div className="w-0.5 bg-orange-500 sound-bar" />
                      <div className="w-0.5 bg-orange-500 sound-bar" />
                      <div className="w-0.5 bg-orange-500 sound-bar" />
                    </div>
                  )}
                </div>

                <span className="text-xs font-mono font-bold text-slate-700 dark:text-neutral-300 tabular-nums">
                  {call.duration.toFixed(1)}s
                </span>
              </div>

              <div className="mt-4 flex justify-end">
                <Button
                  variant="danger"
                  size="xs"
                  onClick={() => handleHangup(call.call_id)}
                  leftIcon={<PhoneOff className="w-3 h-3" />}
                  className="w-full"
                >
                  Force Hangup
                </Button>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};
