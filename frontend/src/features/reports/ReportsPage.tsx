import React, { useState, useEffect } from 'react';
import { PageHeader } from '../../components/layout/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { MetricCard } from '../../components/ui/MetricCard';
import { useBusiness } from '../../app/providers/BusinessProvider';
import { reportsApi, BusinessReport } from '../../services/api/reports';
import {
  BarChart3,
  Download,
  Calendar,
  PhoneCall,
  Clock,
  TrendingUp,
  Award,
  Users,
  Target,
  FileSpreadsheet,
} from 'lucide-react';

export const ReportsPage: React.FC = () => {
  const { selectedBusiness } = useBusiness();
  const [periodDays, setPeriodDays] = useState<number>(30);
  const [loading, setLoading] = useState<boolean>(true);
  const [report, setReport] = useState<BusinessReport | null>(null);

  const businessId = selectedBusiness?.id;

  const loadReport = async () => {
    setLoading(true);
    try {
      if (businessId) {
        const data = await reportsApi.getBusinessReport(businessId, periodDays);
        setReport(data);
      } else {
        const data = await reportsApi.getAgencyOverview(periodDays);
        setReport(data);
      }
    } catch (err) {
      console.error('Failed to load reports data:', err);
      // Fallback display if endpoint returns empty / not initialized yet
      setReport({
        report_id: 'default',
        business_id: businessId || 'all',
        period_days: periodDays,
        generated_at: new Date().toISOString(),
        summary: {
          total_calls: 0,
          completed_calls: 0,
          answer_rate: 0,
          average_duration_seconds: 0,
          total_leads: 0,
          qualified_leads: 0,
          hot_leads: 0,
          converted_leads: 0,
          qualification_rate: 0,
          conversion_rate: 0,
        },
        lead_status_distribution: {
          New: 0,
          Contacted: 0,
          Qualified: 0,
          Converted: 0,
        },
        agent_performance: {},
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReport();
  }, [businessId, periodDays]);

  const summary = report?.summary || {
    total_calls: 0,
    completed_calls: 0,
    answer_rate: 0,
    average_duration_seconds: 0,
    total_leads: 0,
    qualified_leads: 0,
    hot_leads: 0,
    converted_leads: 0,
    qualification_rate: 0,
    conversion_rate: 0,
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    if (mins === 0) return `${secs}s`;
    return `${mins}m ${secs}s`;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports & Analytics"
        category="Analytics"
        subtitle="Performance analytics, call conversion metrics, and AI agent intelligence"
        actions={
          <div className="flex items-center gap-3">
            <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-xl p-1 text-xs">
              {[7, 14, 30, 90].map((days) => (
                <button
                  key={days}
                  onClick={() => setPeriodDays(days)}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                    periodDays === days
                      ? 'bg-orange-500 text-white shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {days}d
                </button>
              ))}
            </div>

            {businessId && (
              <Button
                variant="outline"
                size="sm"
                leftIcon={<FileSpreadsheet className="w-4 h-4 text-emerald-400" />}
                onClick={() => {
                  window.open(reportsApi.getExportUrl(businessId, 'leads'), '_blank');
                }}
              >
                Export CSV
              </Button>
            )}
          </div>
        }
      />

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Total Telephony Calls"
          value={summary.total_calls}
          subtext={`${summary.completed_calls} completed calls`}
          icon={<PhoneCall className="w-5 h-5 text-orange-400" />}
          isLoading={loading}
        />
        <MetricCard
          label="Call Answer Rate"
          value={`${Math.round(summary.answer_rate)}%`}
          subtext="Connected customer pickups"
          icon={<TrendingUp className="w-5 h-5 text-emerald-400" />}
          isLoading={loading}
        />
        <MetricCard
          label="Avg Call Duration"
          value={formatDuration(summary.average_duration_seconds)}
          subtext="Interactive AI dialogue"
          icon={<Clock className="w-5 h-5 text-blue-400" />}
          isLoading={loading}
        />
        <MetricCard
          label="Qualified Conversion"
          value={`${Math.round(summary.qualification_rate)}%`}
          subtext={`${summary.qualified_leads} of ${summary.total_leads} leads`}
          icon={<Award className="w-5 h-5 text-amber-400" />}
          isLoading={loading}
        />
      </div>

      {/* Second Row: Lead Distribution & Agent Performance */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Lead Status Breakdown */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <Target className="w-4 h-4 text-orange-400" />
              Lead Pipeline Distribution
            </h3>
            <span className="text-xs text-zinc-500">Last {periodDays} Days</span>
          </div>

          <div className="space-y-3">
            {Object.entries(report?.lead_status_distribution || {}).length === 0 ? (
              <div className="text-center py-8 text-zinc-500 text-sm">
                No lead status records available for this period.
              </div>
            ) : (
              Object.entries(report?.lead_status_distribution || {}).map(([status, count]) => {
                const total = summary.total_leads || 1;
                const pct = Math.round((count / total) * 100);
                return (
                  <div key={status} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-zinc-300 font-medium">{status}</span>
                      <span className="text-zinc-400">
                        {count} ({pct}%)
                      </span>
                    </div>
                    <div className="w-full bg-zinc-800/80 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-orange-500 h-2 rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Card>

        {/* AI Agent Performance Leaderboard */}
        <Card className="p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <Users className="w-4 h-4 text-orange-400" />
              AI Agent Telephony Performance
            </h3>
            <span className="text-xs text-zinc-500">Efficiency by Agent</span>
          </div>

          {Object.entries(report?.agent_performance || {}).length === 0 ? (
            <div className="text-center py-12 text-zinc-500 text-sm">
              <PhoneCall className="w-8 h-8 mx-auto mb-2 text-zinc-600 opacity-60" />
              No agent calls logged yet. Start an outbound campaign to view live performance.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-400">
                    <th className="pb-3 font-medium">Agent</th>
                    <th className="pb-3 font-medium">Total Calls</th>
                    <th className="pb-3 font-medium">Completed</th>
                    <th className="pb-3 font-medium">Leads Generated</th>
                    <th className="pb-3 font-medium">Qualified</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {Object.entries(report?.agent_performance || {}).map(([agentId, data]) => (
                    <tr key={agentId} className="hover:bg-zinc-800/20 transition-colors">
                      <td className="py-3 font-medium text-zinc-200">{agentId}</td>
                      <td className="py-3 text-zinc-300">{data.calls}</td>
                      <td className="py-3 text-emerald-400">{data.completed}</td>
                      <td className="py-3 text-zinc-300">{data.leads}</td>
                      <td className="py-3 text-orange-400 font-semibold">{data.qualified}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};
