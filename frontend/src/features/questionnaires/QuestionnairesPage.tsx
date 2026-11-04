import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { NavLink, useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/layout/PageHeader';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { StatusIndicator } from '../../components/ui/StatusIndicator';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { DocxImportModal } from './DocxImportModal';
import { ExcelImportModal } from './ExcelImportModal';
import { questionnairesApi } from '../../services/api/questionnaires';
import { useToast } from '../../app/providers/ToastProvider';
import { getErrorMessage } from '../../services/api/client';
import {
  FileQuestion,
  Plus,
  FileUp,
  FileSpreadsheet,
  Copy,
  Trash2,
  CheckSquare,
  Square,
  ArrowRight,
  HelpCircle,
  Clock,
  RefreshCw,
} from 'lucide-react';
import { QuestionnaireDocument } from '../../types/api';

export const QuestionnairesPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();

  const [isDocxModalOpen, setIsDocxModalOpen] = useState(false);
  const [isExcelModalOpen, setIsExcelModalOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deletingQst, setDeletingQst] = useState<QuestionnaireDocument | null>(null);
  const [isBatchDeleting, setIsBatchDeleting] = useState(false);

  const { data: questionnaires = [], isLoading, refetch } = useQuery({
    queryKey: ['questionnaires'],
    queryFn: () => questionnairesApi.getQuestionnaires(),
  });

  const duplicateMutation = useMutation({
    mutationFn: (id: string) => questionnairesApi.duplicateQuestionnaire(id),
    onSuccess: (newQst) => {
      queryClient.invalidateQueries({ queryKey: ['questionnaires'] });
      toast.success('Questionnaire Duplicated', `Created copy: ${newQst.title}`);
    },
    onError: (err) => {
      toast.error('Failed to duplicate', getErrorMessage(err));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => questionnairesApi.deleteQuestionnaire(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['questionnaires'] });
      toast.success('Script Deleted', 'Questionnaire was permanently deleted from the database.');
      if (deletingQst) {
        setSelectedIds((prev) => prev.filter((i) => i !== deletingQst.questionnaire_id));
      }
      setDeletingQst(null);
    },
    onError: (err) => {
      toast.error('Delete failed', getErrorMessage(err));
      setDeletingQst(null);
    },
  });

  const batchDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => questionnairesApi.batchDeleteQuestionnaires(ids),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['questionnaires'] });
      toast.success('Scripts Deleted', `Permanently deleted ${data.deleted_count} questionnaires from the database.`);
      setSelectedIds([]);
      setIsBatchDeleting(false);
    },
    onError: (err) => {
      toast.error('Batch delete failed', getErrorMessage(err));
      setIsBatchDeleting(false);
    },
  });

  const handleToggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedIds.length === questionnaires.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(questionnaires.map((q) => q.questionnaire_id));
    }
  };

  const handleCreateNew = async () => {
    try {
      const created = await questionnairesApi.createQuestionnaire({
        title: 'Customer Qualification Script',
        description: 'Standard multi-turn question flow',
        questions: [
          {
            question_id: 'q_1',
            text: 'Hello! Am I speaking with the primary contact person?',
            expected_answer: 'Yes / Confirmed',
            type: 'text',
            required: true,
            options: ['Yes', 'No'],
            conditional_rules: [],
          },
        ],
        status: 'draft',
      });
      toast.success('Questionnaire Created', 'Draft initialized.');
      navigate(`/questionnaires/${created.questionnaire_id}`);
    } catch (err: any) {
      toast.error('Creation failed', getErrorMessage(err));
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        category="CRM & Scripting"
        title="Questionnaires & Conversational Scripts"
        subtitle="Design structured telecalling scripts, survey question flows, and branch logic for AI voice agents."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              leftIcon={<RefreshCw className="w-3.5 h-3.5 text-slate-400" />}
            >
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsExcelModalOpen(true)}
              leftIcon={<FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" />}
            >
              Import Excel
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsDocxModalOpen(true)}
              leftIcon={<FileUp className="w-3.5 h-3.5 text-slate-400" />}
            >
              Import DOCX
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleCreateNew}
              leftIcon={<Plus className="w-4 h-4" />}
            >
              New Script
            </Button>
          </div>
        }
      />

      {/* Batch Actions Bar */}
      {selectedIds.length > 0 && (
        <div className="flex items-center justify-between p-3 rounded-xl border border-orange-500/20 bg-orange-500/10">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSelectAll}
              className="flex items-center gap-2 text-xs font-semibold text-orange-950 dark:text-orange-200"
            >
              {selectedIds.length === questionnaires.length ? (
                <CheckSquare className="w-4 h-4 text-orange-500 dark:text-orange-400" />
              ) : (
                <Square className="w-4 h-4 text-slate-400" />
              )}
              <span>{selectedIds.length} script(s) selected</span>
            </button>
            <span className="text-xs text-slate-400 dark:text-zinc-500">|</span>
            <button
              type="button"
              onClick={handleSelectAll}
              className="text-xs text-orange-500 dark:text-orange-400 hover:underline font-medium"
            >
              {selectedIds.length === questionnaires.length ? 'Deselect All' : 'Select All'}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="xs"
              onClick={() => setSelectedIds([])}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="xs"
              leftIcon={<Trash2 className="w-3.5 h-3.5" />}
              onClick={() => setIsBatchDeleting(true)}
            >
              Delete Selected ({selectedIds.length})
            </Button>
          </div>
        </div>
      )}

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} height={180} />)
        ) : questionnaires.length === 0 ? (
          <div className="col-span-full">
            <EmptyState
              icon={<FileQuestion className="w-8 h-8 text-slate-400" />}
              title="No questionnaires found"
              description="Create a custom conversational question script or import directly from a Word .docx document."
              actionLabel="Create Script"
              onAction={handleCreateNew}
            />
          </div>
        ) : (
          questionnaires.map((qst) => {
            const isSelected = selectedIds.includes(qst.questionnaire_id);
            return (
              <div
                key={qst.questionnaire_id}
                data-glow=""
                className={`p-5 rounded-2xl bg-white/75 dark:bg-[var(--card-glass-bg)] backdrop-blur-[18px] border transition-all flex flex-col justify-between glow-card shadow-sm dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_8px_32px_rgba(0,0,0,0.35)] ${
                  isSelected
                    ? 'border-orange-500 dark:border-orange-500 ring-1 ring-orange-500/30 bg-orange-500/10'
                    : 'border-slate-200/80 dark:border-white/[0.09] hover:border-slate-300 dark:hover:border-white/[0.15]'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <button
                        type="button"
                        onClick={(e) => handleToggleSelect(qst.questionnaire_id, e)}
                        className="text-slate-400 hover:text-orange-500 dark:hover:text-orange-400 transition-colors"
                        title={isSelected ? 'Deselect script' : 'Select script'}
                      >
                        {isSelected ? (
                          <CheckSquare className="w-4 h-4 text-orange-500 dark:text-orange-400" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-400 hover:text-slate-600" />
                        )}
                      </button>
                      <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 flex items-center justify-center font-bold text-xs shrink-0">
                        <FileQuestion className="w-4 h-4" />
                      </div>
                    </div>
                    <StatusIndicator
                      status={qst.status === 'published' ? 'success' : 'neutral'}
                      label={qst.status === 'published' ? `Published (${qst.version_id})` : 'Draft'}
                    />
                  </div>

                  <h3 className="font-semibold text-sm text-slate-900 dark:text-slate-100 mt-3 truncate">
                    {qst.title}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1 line-clamp-2 leading-relaxed min-h-[32px]">
                    {qst.description || 'No description provided.'}
                  </p>

                  <div className="flex items-center gap-4 mt-3.5 pt-3 border-t border-slate-100 dark:border-zinc-900 text-xs text-slate-500">
                    <div className="flex items-center gap-1.5">
                      <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
                      <span><strong>{qst.questions?.length || 0}</strong> Questions</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3.5 mt-3.5 border-t border-slate-100 dark:border-zinc-900">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => duplicateMutation.mutate(qst.questionnaire_id)}
                      className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-900 transition-colors"
                      title="Duplicate questionnaire"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeletingQst(qst);
                      }}
                      className="p-1.5 rounded-md text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                      title="Delete script permanently"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <NavLink to={`/questionnaires/${qst.questionnaire_id}`}>
                    <Button variant="secondary" size="xs" rightIcon={<ArrowRight className="w-3 h-3" />}>
                      Edit Script
                    </Button>
                  </NavLink>
                </div>
              </div>
            );
          })
        )}
      </div>

      <DocxImportModal
        isOpen={isDocxModalOpen}
        onClose={() => setIsDocxModalOpen(false)}
        onSuccess={() => refetch()}
      />

      <ExcelImportModal
        isOpen={isExcelModalOpen}
        onClose={() => setIsExcelModalOpen(false)}
        onSuccess={() => refetch()}
      />

      {/* Single Delete Confirm Dialog */}
      <ConfirmDialog
        isOpen={!!deletingQst}
        onClose={() => setDeletingQst(null)}
        onConfirm={() => {
          if (deletingQst) {
            deleteMutation.mutate(deletingQst.questionnaire_id);
          }
        }}
        title="Delete Questionnaire Script?"
        message={`Are you sure you want to permanently delete "${deletingQst?.title}" from the database? This action cannot be undone.`}
        confirmText="Delete Script"
        variant="danger"
        isLoading={deleteMutation.isPending}
      />

      {/* Batch Delete Confirm Dialog */}
      <ConfirmDialog
        isOpen={isBatchDeleting}
        onClose={() => setIsBatchDeleting(false)}
        onConfirm={() => {
          if (selectedIds.length > 0) {
            batchDeleteMutation.mutate(selectedIds);
          }
        }}
        title={`Delete ${selectedIds.length} Questionnaire Scripts?`}
        message={`Are you sure you want to permanently delete these ${selectedIds.length} questionnaires from the database? This action cannot be undone.`}
        confirmText={`Delete ${selectedIds.length} Scripts`}
        variant="danger"
        isLoading={batchDeleteMutation.isPending}
      />
    </div>
  );
};
