import React, { useState, useEffect } from 'react';
import { useParams, NavLink, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '../../components/layout/PageHeader';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { StatusIndicator } from '../../components/ui/StatusIndicator';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { questionnairesApi } from '../../services/api/questionnaires';
import { agentsApi } from '../../services/api/agents';
import { useToast } from '../../app/providers/ToastProvider';
import { getErrorMessage } from '../../services/api/client';
import { Question, QuestionnaireDocument, AgentDocument } from '../../types/api';
import { ExcelImportModal } from './ExcelImportModal';
import {
  ArrowLeft,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Save,
  CheckCircle,
  FileSpreadsheet,
  Download,
  Bot,
} from 'lucide-react';

export const QuestionnaireEditorPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [agentId, setAgentId] = useState('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isExcelModalOpen, setIsExcelModalOpen] = useState(false);

  const { data: questionnaire, isLoading } = useQuery({
    queryKey: ['questionnaire', id],
    queryFn: () => questionnairesApi.getQuestionnaire(id!),
    enabled: !!id,
  });

  const { data: agents = [] } = useQuery({
    queryKey: ['agents'],
    queryFn: () => agentsApi.getAgents(50),
  });

  useEffect(() => {
    if (questionnaire) {
      setTitle(questionnaire.title || '');
      setDescription(questionnaire.description || '');
      setQuestions(questionnaire.questions || []);
      setAgentId(questionnaire.agent_id || '');
    }
  }, [questionnaire]);

  const handleAddQuestion = () => {
    const newQ: Question = {
      question_id: `q_${Math.random().toString(36).substring(2, 8)}`,
      text: '',
      expected_answer: '',
      type: 'text',
      required: true,
      options: [],
      conditional_rules: [],
    };
    setQuestions([...questions, newQ]);
  };

  const handleDownloadTemplate = async () => {
    try {
      await questionnairesApi.downloadTemplate();
      toast.success('Template Downloaded', 'Questionnaire_Template.xlsx is ready.');
    } catch (err: any) {
      toast.error('Download Failed', getErrorMessage(err));
    }
  };

  const handleRemoveQuestion = (index: number) => {
    const next = [...questions];
    next.splice(index, 1);
    setQuestions(next);
  };

  const handleMoveQuestion = (index: number, direction: 'up' | 'down') => {
    if ((direction === 'up' && index === 0) || (direction === 'down' && index === questions.length - 1)) return;
    const target = direction === 'up' ? index - 1 : index + 1;
    const next = [...questions];
    const temp = next[index];
    next[index] = next[target];
    next[target] = temp;
    setQuestions(next);
  };

  const handleUpdateQuestion = (index: number, updates: Partial<Question>) => {
    const next = [...questions];
    next[index] = { ...next[index], ...updates };
    setQuestions(next);
  };

  // Save Draft
  const handleSaveDraft = async () => {
    if (!id) return;
    setIsSaving(true);
    try {
      await questionnairesApi.updateQuestionnaire(id, {
        title,
        description,
        questions,
        agent_id: agentId || undefined,
      });
      toast.success('Draft Saved', 'Script updates and agent assignment saved.');
      queryClient.invalidateQueries({ queryKey: ['questionnaire', id] });
    } catch (err: any) {
      toast.error('Failed to save draft', getErrorMessage(err));
    } finally {
      setIsSaving(false);
    }
  };

  // Publish Version
  const handlePublish = async () => {
    if (!id) return;
    setIsPublishing(true);
    try {
      await questionnairesApi.updateQuestionnaire(id, {
        title,
        description,
        questions,
        agent_id: agentId || undefined,
      });
      const published = await questionnairesApi.publishQuestionnaire(id, 'Published version');
      toast.success('Script Published', `Version updated to ${published.version_id}`);
      queryClient.invalidateQueries({ queryKey: ['questionnaire', id] });
    } catch (err: any) {
      toast.error('Failed to publish', getErrorMessage(err));
    } finally {
      setIsPublishing(false);
    }
  };

  const deleteMutation = useMutation({
    mutationFn: () => questionnairesApi.deleteQuestionnaire(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['questionnaires'] });
      toast.success('Script Deleted', 'Questionnaire was permanently deleted from the database.');
      navigate('/questionnaires');
    },
    onError: (err) => {
      toast.error('Failed to delete script', getErrorMessage(err));
      setIsDeleteDialogOpen(false);
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton height={80} />
        <Skeleton height={300} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <NavLink
          to="/questionnaires"
          className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 mb-2 font-medium"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Scripts Directory
        </NavLink>
        <PageHeader
          category="Script Builder"
          title={title || 'Untitled Questionnaire'}
          subtitle="Configure conversational question prompts, expected customer responses, and branching logic."
          actions={
            <div className="flex items-center gap-2">
              {agentId && (
                <span className="text-[11px] font-semibold text-orange-400 bg-orange-500/10 px-2.5 py-1 rounded-full flex items-center gap-1 border border-orange-500/20">
                  <Bot className="w-3.5 h-3.5" />
                  {agents.find((a: any) => (a.id || a.agent_id) === agentId)?.name || 'Agent Assigned'}
                </span>
              )}
              <StatusIndicator
                status={questionnaire?.status === 'published' ? 'success' : 'neutral'}
                label={questionnaire?.status === 'published' ? `Published (${questionnaire.version_id})` : 'Draft'}
              />
              <Button
                variant="danger"
                size="sm"
                onClick={() => setIsDeleteDialogOpen(true)}
                leftIcon={<Trash2 className="w-4 h-4" />}
              >
                Delete
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSaveDraft}
                isLoading={isSaving}
                leftIcon={<Save className="w-4 h-4" />}
              >
                Save Draft
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handlePublish}
                isLoading={isPublishing}
                leftIcon={<CheckCircle className="w-4 h-4" />}
              >
                Publish Script
              </Button>
            </div>
          }
        />
      </div>

      {/* Meta Editor Card */}
      <Card>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Input
            label="Script Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Property Buyer Qualification"
            required
          />
          <Input
            label="Script Purpose & Context"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief notes about the goals of this conversation..."
          />
          <Select
            label="Assign to Voice Agent"
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
          >
            <option value="">-- No Agent (Template Script) --</option>
            {agents.map((ag: AgentDocument) => {
              const aId = ag.id || (ag as any).agent_id;
              return (
                <option key={aId} value={aId}>
                  {ag.name} ({ag.purpose || 'Voice Agent'})
                </option>
              );
            })}
          </Select>
        </div>
      </Card>

      {/* Questions Flow */}
      <div className="space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-bold text-slate-700 dark:text-zinc-300 uppercase tracking-wider">
            Questions Sequence ({questions.length})
          </h3>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="xs"
              onClick={handleDownloadTemplate}
              leftIcon={<Download className="w-3.5 h-3.5 text-slate-400" />}
              title="Download sample Excel questionnaire template"
            >
              Template
            </Button>
            <Button
              variant="outline"
              size="xs"
              onClick={() => setIsExcelModalOpen(true)}
              leftIcon={<FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" />}
            >
              Import Excel
            </Button>
            <Button
              variant="secondary"
              size="xs"
              onClick={handleAddQuestion}
              leftIcon={<Plus className="w-3.5 h-3.5" />}
            >
              Add Question
            </Button>
          </div>
        </div>

        {questions.length === 0 ? (
          <EmptyState
            title="No questions in this script"
            description="Add your first question manually or import a structured questionnaire directly from Excel."
            actionLabel="Add First Question"
            onAction={handleAddQuestion}
          />
        ) : (
          questions.map((q, idx) => (
            <Card key={q.question_id || idx} className="space-y-3 border-slate-200 dark:border-zinc-800">
              {/* Question Item Header */}
              <div className="flex items-center justify-between gap-3 pb-2.5 border-b border-slate-100 dark:border-zinc-900">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-md bg-slate-900 dark:bg-white text-white dark:text-zinc-950 font-bold text-xs flex items-center justify-center">
                    {idx + 1}
                  </span>
                  <span className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                    Question {idx + 1}
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleMoveQuestion(idx, 'up')}
                    disabled={idx === 0}
                    className="p-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 disabled:opacity-30 transition-colors"
                    title="Move up"
                  >
                    <ChevronUp className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMoveQuestion(idx, 'down')}
                    disabled={idx === questions.length - 1}
                    className="p-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 disabled:opacity-30 transition-colors"
                    title="Move down"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemoveQuestion(idx)}
                    className="p-1 rounded-md text-slate-400 hover:text-rose-600 transition-colors"
                    title="Remove question"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Question Form */}
              <div className="space-y-3">
                <Input
                  label="Question / Prompt Spoken by Agent *"
                  value={q.text}
                  onChange={(e) => handleUpdateQuestion(idx, { text: e.target.value })}
                  placeholder="e.g. साहेब, आपण कोणकोणत्या पिकांचे नियोजन केले आहे का?"
                  required
                />

                <Input
                  label="Expected Answer / Reference Answer *"
                  value={q.expected_answer ?? (q.options && q.options.length > 0 ? q.options.join(' / ') : '')}
                  onChange={(e) => handleUpdateQuestion(idx, { expected_answer: e.target.value })}
                  placeholder="e.g. गहू / हरभरा / चणा / मका (Internal semantic reference for AI interpretation)"
                  required
                />
              </div>
            </Card>
          ))
        )}
      </div>

      <ConfirmDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        onConfirm={() => deleteMutation.mutate()}
        title="Delete Questionnaire Script?"
        message={`Are you sure you want to permanently delete "${title || 'this script'}" from the database? This action cannot be undone.`}
        confirmText="Delete Script"
        variant="danger"
        isLoading={deleteMutation.isPending}
      />

      <ExcelImportModal
        isOpen={isExcelModalOpen}
        onClose={() => setIsExcelModalOpen(false)}
        onImportQuestions={(newQuestions, mode) => {
          if (mode === 'replace') {
            setQuestions(newQuestions);
          } else {
            setQuestions((prev) => [...prev, ...newQuestions]);
          }
        }}
        existingQuestionsCount={questions.length}
      />
    </div>
  );
};
