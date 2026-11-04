import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '../../components/layout/PageHeader';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Skeleton } from '../../components/ui/Skeleton';
import { healthApi } from '../../services/api/health';
import { SystemHealthResponse } from '../../types/api';
import {
  HeartPulse,
  Server,
  Database,
  Radio,
  Cpu,
  RefreshCw,
  Activity,
  HardDrive,
  Phone,
} from 'lucide-react';

export const HealthPage: React.FC = () => {
  const { data: health, isLoading, refetch, isRefetching } = useQuery<SystemHealthResponse>({
    queryKey: ['health-details'],
    queryFn: () => healthApi.getHealth(),
    refetchInterval: 10000,
  });

  const getStatusBadge = (status?: string) => {
    if (!status) return <Badge variant="default" size="xs">Unknown</Badge>;
    if (status === 'ok' || status === 'configured' || status === 'ready' || status === 'healthy') {
      return <Badge variant="success" size="xs" dot>Healthy / OK</Badge>;
    }
    if (status === 'degraded') {
      return <Badge variant="warning" size="xs" dot pulse>Degraded</Badge>;
    }
    return <Badge variant="danger" size="xs" dot>Unhealthy</Badge>;
  };

  const services = [
    {
      name: 'FastAPI Voice Backend',
      category: 'Core Orchestrator & API',
      icon: Server,
      status: (health?.controller as string) || (health?.status === 'ok' ? 'ok' : 'degraded'),
      details: 'Async WebSocket gateway, telephony dispatcher, and REST API controller',
      url: 'This server — API base /api/v1',
    },
    {
      name: health?.database?.type === 'sqlite' ? 'SQLite Database' : 'PostgreSQL Database',
      category: 'Relational & Session Store',
      icon: Database,
      status: health?.database?.status === 'healthy' ? 'ok' : 'degraded',
      details: health?.database?.type === 'sqlite' ? 'Local calling_agent.db with WAL mode' : 'PostgreSQL relational store on port 5432',
      url: health?.database?.type === 'sqlite' ? 'calling_agent.db' : 'PostgreSQL (server-side)',
    },
    {
      name: 'Redis Cache & Event Broker',
      category: 'Real-time State Sync',
      icon: Radio,
      status: health?.redis?.status === 'healthy' ? 'ok' : 'degraded',
      details: 'Realtime in-flight call state caching and Dograh audio pipeline queue',
      url: 'Redis (server-side)',
    },
    {
      name: 'MinIO S3 Audio Storage',
      category: 'Call Recording Vault',
      icon: HardDrive,
      status: health?.storage?.status === 'healthy' ? 'ok' : 'degraded',
      details: `S3 Object storage for call audio recordings (Bucket: ${health?.storage?.bucket || 'voxora-recordings'})`,
      url: 'MinIO / S3 (server-side)',
    },
    {
      name: 'Dograh Voice AI Core',
      category: 'Voice Telephony Engine',
      icon: Activity,
      status: health?.dograh?.healthy?.reachable ? 'ok' : 'degraded',
      details: `v${health?.dograh?.healthy?.detail?.version || '1.48.0'} - WebRTC, SIP gateway, and audio stream mixer`,
      url: 'Voice engine (server-side)',
    },
    {
      name: 'Local Voice AI Engine (CUDA)',
      category: 'Speech & LLM Server',
      icon: Cpu,
      status: health?.voice_ai?.status === 'healthy' ? 'ok' : 'degraded',
      details: 'Whisper Large-v3-Turbo (CUDA STT) | Kokoro ONNX TTS | Gemini Flash Lite LLM',
      url: 'Local AI server (server-side)',
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        category="System Diagnostics"
        title="Service Health & Connectivity"
        subtitle="Real-time telemetry and microservice status pings across speech, language, and database infrastructure."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            isLoading={isRefetching}
            leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
          >
            Ping All Services
          </Button>
        }
      />

      {/* Services Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} height={180} />)
        ) : (
          services.map((svc) => (
            <Card key={svc.name} className="flex flex-col justify-between">
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-orange-500/10 text-orange-500 dark:text-orange-400 flex items-center justify-center font-bold shrink-0 shadow-xs">
                    <svc.icon className="w-5 h-5" />
                  </div>
                  {getStatusBadge(svc.status)}
                </div>

                <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 mt-3">
                  {svc.name}
                </h3>
                <span className="text-[10px] font-semibold text-orange-500 dark:text-orange-400 uppercase tracking-wider">
                  {svc.category}
                </span>

                <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                  {svc.details}
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-white/5">
                <span className="text-[10px] font-mono text-slate-400 truncate block">
                  {svc.url}
                </span>
              </div>
            </Card>
          ))
        )}
      </div>

      {/* Telephony Providers Health Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Phone className="w-4 h-4 text-orange-500" />
            <span>Telephony Carrier Trunks</span>
          </CardTitle>
          <CardDescription>Status and caller ID routing of active carrier drivers</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/60 dark:border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block">VoBiz Carrier Trunk</span>
                <span className="text-[11px] text-slate-500 font-mono">
                  From: {health?.telephony?.vobiz?.from_number || '+918065354620'}
                </span>
              </div>
              {getStatusBadge(health?.telephony?.vobiz?.status || (health?.telephony?.configured ? 'ready' : 'unconfigured'))}
            </div>
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/60 dark:border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block">Twilio Carrier Trunk</span>
                <span className="text-[11px] text-slate-500 font-mono">
                  From: {health?.telephony?.twilio?.from_number || '+13344895368'}
                </span>
              </div>
              {getStatusBadge(health?.telephony?.twilio?.status || 'ready')}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

