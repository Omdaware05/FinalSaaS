import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { FileQuestion, ListOrdered, Globe, FileEdit, ArrowUpRight, Plus } from 'lucide-react';
import { questionnairesApi } from '../../services/api/questionnaires';
import { MCard, MStatCard, MPageHeader, Pill, primaryPill, timeAgo } from './ui';

export const ModernQuestionnaires: React.FC = () => {
  const navigate = useNavigate();
  const { data: questionnaires = [], isLoading } = useQuery({
    queryKey: ['questionnaires'],
    queryFn: () => questionnairesApi.getQuestionnaires(),
  });

  const published = questionnaires.filter((q) => q.is_published).length;
  const totalQuestions = questionnaires.reduce((a, q) => a + (q.questions?.length || 0), 0);

  const stats = [
    { label: 'Questionnaires', value: questionnaires.length.toLocaleString('en-IN'), icon: FileQuestion, iconClass: 'bg-[#FFF1E6] text-[#EA580C]', subtext: 'call scripts in total' },
    { label: 'Published', value: published.toLocaleString('en-IN'), icon: Globe, iconClass: 'bg-[#E7F8EE] text-[#16A34A]', subtext: 'live for agents to use' },
    { label: 'Drafts', value: (questionnaires.length - published).toLocaleString('en-IN'), icon: FileEdit, iconClass: 'bg-[#FFF7E0] text-[#B54708]', subtext: 'not yet published' },
    { label: 'Total Questions', value: totalQuestions.toLocaleString('en-IN'), icon: ListOrdered, iconClass: 'bg-[#E6F4FE] text-[#0284C7]', subtext: 'across all scripts' },
  ];

  return (
    <div>
      <MPageHeader
        title="Questionnaires"
        subtitle="The question scripts your AI agents follow during live calls to capture qualify leads."
        actions={
          <button
            type="button"
            className={primaryPill}
            onClick={() => navigate('/questionnaires/new')}
          >
            <Plus className="w-4 h-4" /> New Script
          </button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6 mb-6">
        {stats.map((st, i) => (
          <MStatCard key={st.label} {...st} delay={i * 60} />
        ))}
      </div>

      {isLoading && <MCard className="p-12 text-center text-sm text-[#667085]">Loading questionnaires…</MCard>}
      {!isLoading && questionnaires.length === 0 && (
        <MCard className="p-12 text-center max-w-lg mx-auto">
          <div className="w-14 h-14 rounded-2xl bg-orange-50 border border-orange-100 text-orange-600 flex items-center justify-center mx-auto mb-4">
            <FileQuestion className="w-7 h-7" />
          </div>
          <p className="text-base font-bold text-[#101828]">No questionnaires created yet</p>
          <p className="text-sm text-[#667085] mt-1.5 leading-relaxed">
            Create an automated call script with dynamic branched questions, answers, and data extraction fields.
          </p>
          <div className="mt-6">
            <button
              type="button"
              className={primaryPill}
              onClick={() => navigate('/questionnaires/new')}
            >
              <Plus className="w-4 h-4" /> Create First Script
            </button>
          </div>
        </MCard>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {questionnaires.map((q, i) => (
          <button
            key={q.questionnaire_id}
            type="button"
            onClick={() => navigate(`/questionnaires/${q.questionnaire_id}`)}
            className="text-left anim-enter cursor-pointer group"
            style={{ animationDelay: `${Math.min(i * 60, 300)}ms` }}
          >
            <MCard className="p-6 h-full flex flex-col justify-between hover:shadow-[0_8px_30px_rgba(16,24,40,0.12)] hover:-translate-y-0.5 transition-all">
              <div>
                <div className="flex items-start gap-3">
                  <span className="w-11 h-11 rounded-2xl bg-orange-50 border border-orange-100 flex items-center justify-center shrink-0 group-hover:bg-orange-100 transition-colors">
                    <FileQuestion className="w-5 h-5 text-orange-600" strokeWidth={1.9} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] font-bold text-[#101828] group-hover:text-orange-600 transition-colors truncate">
                      {q.title}
                    </p>
                    <p className="text-xs text-[#667085] mt-0.5">Updated {timeAgo(q.updated_at)}</p>
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-[#667085] group-hover:text-orange-600 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all shrink-0" />
                </div>
                <p className="text-[13px] text-[#475467] leading-relaxed mt-3.5 line-clamp-2 min-h-[38px]">
                  {q.description || 'Structured questionnaire script for customer discovery and intent scoring.'}
                </p>
              </div>
              <div className="flex items-center gap-2 mt-5 pt-4 border-t border-[#F1F2F4]">
                <Pill tone={q.is_published ? 'emerald' : 'amber'}>{q.is_published ? 'Published' : 'Draft'}</Pill>
                <Pill tone="slate">{q.questions?.length || 0} questions</Pill>
              </div>
            </MCard>
          </button>
        ))}
      </div>
    </div>
  );
};
