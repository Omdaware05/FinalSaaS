import React from 'react';
import { PageHeader } from '../../components/layout/PageHeader';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Skeleton } from '../../components/ui/Skeleton';
import { useRealTimeStats } from '../../hooks/useRealTimeStats';
import { ListOrdered, Play, Pause, Layers, CheckCircle, RefreshCw } from 'lucide-react';

export const QueuePage: React.FC = () => {
  const { queue, isLoading, refetch } = useRealTimeStats();

  return (
    <div className="space-y-6">
      <PageHeader
        category="Voice Operations"
        title="Call Concurrency Queue"
        subtitle="Manage telephony concurrency semaphores and pending outbound calls awaiting slots."
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => refetch()}
            leftIcon={<RefreshCw className="w-3.5 h-3.5 text-neutral-400" />}
          >
            Refresh Queue
          </Button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Queued Calls Card */}
        <Card className="flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-neutral-400">
            <span className="text-xs font-semibold">Queued Call Requests</span>
            <ListOrdered className="w-4 h-4 text-orange-400" />
          </div>
          <div className="my-4">
            {isLoading ? (
              <Skeleton height={36} width={60} />
            ) : (
              <span className="text-3xl font-extrabold text-slate-900 dark:text-white tabular-nums">
                {queue?.queued_count ?? 0}
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-neutral-400">Awaiting telephony semaphore release</p>
        </Card>

        {/* Dispatcher Engine State */}
        <Card className="flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-neutral-400">
            <span className="text-xs font-semibold">Queue Dispatcher</span>
            <Layers className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="my-4">
            {isLoading ? (
              <Skeleton height={36} width={100} />
            ) : queue?.is_running ? (
              <Badge variant="success" size="md" dot pulse>
                Active & Running
              </Badge>
            ) : (
              <Badge variant="warning" size="md">
                Idle / Paused
              </Badge>
            )}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-neutral-400">FastAPI async queue worker status</p>
        </Card>

        {/* Max Cap */}
        <Card className="flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-neutral-400">
            <span className="text-xs font-semibold">Concurrency Limit</span>
            <CheckCircle className="w-4 h-4 text-orange-400" />
          </div>
          <div className="my-4">
            <span className="text-3xl font-extrabold text-orange-400 tabular-nums">
              50
            </span>
            <span className="text-xs text-slate-400 dark:text-neutral-500 ml-1.5">Max Channels</span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-neutral-400">Configured hard semaphore cap</p>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Queue Telemetry Explanation</CardTitle>
          <CardDescription>How concurrency and semaphores work in ARB SoftTech</CardDescription>
        </CardHeader>
        <CardContent className="text-xs text-slate-600 dark:text-slate-400 space-y-2.5 leading-relaxed">
          <p>
            When an agent or campaign launches a batch of calls, each outbound dial is registered in an <code>asyncio.Queue</code>. A concurrency worker limits active simultaneous connections according to the agent's concurrency slider (or the campaign's concurrency setting).
          </p>
          <p>
            Once a full-duplex WebSocket session terminates and writes the final WAV recording and transcript to MongoDB, the semaphore slot is freed, immediately dispatching the next pending phone number in line.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};
