import React, { useState } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { questionnairesApi } from '../../services/api/questionnaires';
import { useToast } from '../../app/providers/ToastProvider';
import { getErrorMessage } from '../../services/api/client';
import { Question } from '../../types/api';
import {
  FileSpreadsheet,
  UploadCloud,
  Download,
  AlertTriangle,
  CheckCircle2,
  Trash2,
  FileText,
  RotateCcw,
} from 'lucide-react';

export interface ExcelImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  /**
   * Called when importing questions into an active editor.
   */
  onImportQuestions?: (questions: Question[], mode: 'append' | 'replace') => void;
  /**
   * Called if creating a full questionnaire directly from the directory.
   */
  onSuccess?: () => void;
  existingQuestionsCount?: number;
}

export const ExcelImportModal: React.FC<ExcelImportModalProps> = ({
  isOpen,
  onClose,
  onImportQuestions,
  onSuccess,
  existingQuestionsCount = 0,
}) => {
  const toast = useToast();

  const [file, setFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isDownloadingTemplate, setIsDownloadingTemplate] = useState(false);
  const [previewQuestions, setPreviewQuestions] = useState<Question[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [importMode, setImportMode] = useState<'append' | 'replace'>('append');
  const [scriptTitle, setScriptTitle] = useState('');

  const resetState = () => {
    setFile(null);
    setPreviewQuestions([]);
    setWarnings([]);
    setIsParsing(false);
    setImportMode('append');
    setScriptTitle('');
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleDownloadTemplate = async () => {
    setIsDownloadingTemplate(true);
    try {
      await questionnairesApi.downloadTemplate();
      toast.success('Template Downloaded', 'Questionnaire_Template.xlsx is ready.');
    } catch (err: any) {
      toast.error('Download failed', getErrorMessage(err));
    } finally {
      setIsDownloadingTemplate(false);
    }
  };

  const handleFileSelect = async (selectedFile: File) => {
    if (!selectedFile.name.toLowerCase().endsWith('.xlsx')) {
      toast.error('Invalid format', 'Please select a valid Excel (.xlsx) file.');
      return;
    }

    setFile(selectedFile);
    setIsParsing(true);
    try {
      const res = await questionnairesApi.importExcel(selectedFile, { saveToDb: false });
      if (!res.questions || res.questions.length === 0) {
        toast.error('No questions found', 'Could not detect any valid questions in this sheet.');
        setPreviewQuestions([]);
      } else {
        setPreviewQuestions(res.questions);
        setWarnings(res.warnings || []);
        toast.success(
          'Excel Parsed Successfully',
          `Detected ${res.questions.length} questions. You can review and edit them below.`
        );
      }
    } catch (err: any) {
      toast.error('Excel Import Failed', getErrorMessage(err));
      setFile(null);
      setPreviewQuestions([]);
    } finally {
      setIsParsing(false);
    }
  };

  const handleUpdatePreview = (index: number, field: 'text' | 'expected_answer', value: string) => {
    setPreviewQuestions((prev) =>
      prev.map((q, idx) => (idx === index ? { ...q, [field]: value } : q))
    );
  };

  const handleRemovePreviewQuestion = (index: number) => {
    setPreviewQuestions((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleConfirmImport = async () => {
    if (previewQuestions.length === 0) {
      toast.error('No questions to import');
      return;
    }

    // Validate that questions have prompt text
    const invalidIdx = previewQuestions.findIndex((q) => !q.text || !q.text.trim());
    if (invalidIdx !== -1) {
      toast.error('Missing Question Text', `Question #${invalidIdx + 1} has an empty prompt.`);
      return;
    }

    // 1. If called inside QuestionnaireEditorPage, provide questions directly
    if (onImportQuestions) {
      onImportQuestions(previewQuestions, importMode);
      toast.success(
        'Questions Added',
        `${importMode === 'replace' ? 'Replaced with' : 'Appended'} ${previewQuestions.length} questions.`
      );
      handleClose();
      return;
    }

    // 2. If called standalone in directory, create a new questionnaire
    try {
      const cleanTitle = scriptTitle.trim() || file?.name.replace(/\.[^/.]+$/, '') || 'Imported Script';
      await questionnairesApi.createQuestionnaire({
        title: cleanTitle,
        description: `Imported from Excel with ${previewQuestions.length} questions`,
        questions: previewQuestions,
        status: 'draft',
      });
      toast.success('Script Created', `Successfully imported "${cleanTitle}" with ${previewQuestions.length} questions.`);
      if (onSuccess) onSuccess();
      handleClose();
    } catch (err: any) {
      toast.error('Import Failed', getErrorMessage(err));
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Import Questionnaire from Excel"
      description="Upload a structured Excel (.xlsx) file with Question and Expected Answer columns for conversational AI."
      size="full"
    >
      <div className="space-y-4">
        {/* Step 1: Upload or Template Area */}
        {previewQuestions.length === 0 ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3.5 rounded-xl border border-orange-500/20 bg-orange-500/10 text-xs text-orange-950 dark:text-orange-200">
              <div className="flex items-center gap-2.5">
                <FileSpreadsheet className="w-5 h-5 text-orange-500 dark:text-orange-400 shrink-0" />
                <div>
                  <p className="font-semibold">Required Excel Columns</p>
                  <p className="text-slate-500 dark:text-orange-300/70 text-[11px] mt-0.5">
                    Your Excel sheet should have headers: <strong>Question</strong> and <strong>Expected Answer</strong>.
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="xs"
                onClick={handleDownloadTemplate}
                isLoading={isDownloadingTemplate}
                leftIcon={<Download className="w-3.5 h-3.5" />}
              >
                Download Sample Template
              </Button>
            </div>

            {/* Dropzone */}
            <div className="border-2 border-dashed border-slate-300 dark:border-white/10 hover:border-orange-500/60 rounded-2xl p-8 text-center cursor-pointer transition-colors bg-slate-50/50 dark:bg-white/[0.03]">
              <input
                type="file"
                accept=".xlsx"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileSelect(f);
                }}
                id="excel-file-input"
                className="hidden"
                disabled={isParsing}
              />
              <label htmlFor="excel-file-input" className="cursor-pointer flex flex-col items-center">
                <div className="w-14 h-14 rounded-2xl bg-orange-500/10 text-orange-500 dark:text-orange-400 flex items-center justify-center mb-3 shadow-xs">
                  {isParsing ? (
                    <RotateCcw className="w-7 h-7 animate-spin" />
                  ) : (
                    <UploadCloud className="w-7 h-7" />
                  )}
                </div>
                <span className="text-sm font-semibold text-slate-800 dark:text-zinc-200">
                  {isParsing ? 'Parsing Excel spreadsheet...' : 'Click to select or drop an Excel (.xlsx) file'}
                </span>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
                  Supports standard Excel workbooks (.xlsx) with bilingual or regional questions
                </p>
              </label>
            </div>
          </div>
        ) : (
          /* Step 2: Interactive Preview & Edit Area */
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl bg-slate-100/70 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08]">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold text-xs">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-800 dark:text-zinc-100">
                    Detected {previewQuestions.length} Questions from {file?.name}
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                    Review and edit the questions or reference answers below before confirming.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => {
                    setPreviewQuestions([]);
                    setFile(null);
                  }}
                  leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
                >
                  Choose Different File
                </Button>
              </div>
            </div>

            {/* Warnings Alert */}
            {warnings.length > 0 && (
              <div className="p-3 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/60 dark:bg-amber-950/20 text-xs text-amber-900 dark:text-amber-200 space-y-1">
                <div className="flex items-center gap-1.5 font-semibold">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Validation Notices ({warnings.length}):</span>
                </div>
                <ul className="list-disc list-inside space-y-0.5 text-[11px] text-amber-800 dark:text-amber-300">
                  {warnings.slice(0, 3).map((w, idx) => (
                    <li key={idx}>{w}</li>
                  ))}
                  {warnings.length > 3 && <li>...and {warnings.length - 3} more minor items adjusted.</li>}
                </ul>
              </div>
            )}

            {/* If Standalone mode: provide Script Title */}
            {!onImportQuestions && (
              <div>
                <Input
                  label="Script Title"
                  value={scriptTitle}
                  onChange={(e) => setScriptTitle(e.target.value)}
                  placeholder={file?.name.replace(/\.[^/.]+$/, '') || 'e.g. Samruddhi Agritech Script'}
                />
              </div>
            )}

            {/* Append vs Replace Choice (if in editor and has questions) */}
            {onImportQuestions && existingQuestionsCount > 0 && (
              <div className="flex items-center gap-4 p-3 rounded-lg border border-slate-200 dark:border-white/[0.08] bg-white/70 dark:bg-white/[0.03] text-xs">
                <span className="font-semibold text-slate-700 dark:text-zinc-300">Import Mode:</span>
                <label className="flex items-center gap-1.5 cursor-pointer text-slate-700 dark:text-zinc-300">
                  <input
                    type="radio"
                    name="importMode"
                    value="append"
                    checked={importMode === 'append'}
                    onChange={() => setImportMode('append')}
                    className="text-orange-500 focus:ring-orange-500"
                  />
                  <span>Append to existing ({existingQuestionsCount}) questions</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer text-rose-600 dark:text-rose-400">
                  <input
                    type="radio"
                    name="importMode"
                    value="replace"
                    checked={importMode === 'replace'}
                    onChange={() => setImportMode('replace')}
                    className="text-rose-600 focus:ring-rose-500"
                  />
                  <span>Replace existing questions</span>
                </label>
              </div>
            )}

            {/* Questions Preview List */}
            <div className="max-h-[380px] overflow-y-auto space-y-3 pr-1">
              {previewQuestions.map((q, idx) => (
                <div
                  key={q.question_id || idx}
                  className="p-3.5 rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white/70 dark:bg-white/[0.03] space-y-2.5 shadow-xs"
                >
                  <div className="flex items-center justify-between pb-1.5 border-b border-slate-100 dark:border-white/[0.06]">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-md bg-slate-900 dark:bg-white text-white dark:text-zinc-950 font-bold text-[11px] flex items-center justify-center">
                        {idx + 1}
                      </span>
                      <span className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                        Question {idx + 1}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemovePreviewQuestion(idx)}
                      className="p-1 rounded text-slate-400 hover:text-rose-600 transition-colors"
                      title="Discard this question"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-zinc-400 mb-1">
                        Question / Prompt Spoken by Agent *
                      </label>
                      <textarea
                        value={q.text}
                        onChange={(e) => handleUpdatePreview(idx, 'text', e.target.value)}
                        rows={2}
                        className="w-full text-xs p-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.04] text-slate-900 dark:text-zinc-100 focus:ring-1 focus:ring-orange-500 focus:outline-hidden resize-none"
                        placeholder="Enter the question prompt..."
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-zinc-400 mb-1">
                        Expected Answer / Reference Answer *
                      </label>
                      <textarea
                        value={q.expected_answer || ''}
                        onChange={(e) => handleUpdatePreview(idx, 'expected_answer', e.target.value)}
                        rows={2}
                        className="w-full text-xs p-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.04] text-slate-900 dark:text-zinc-100 focus:ring-1 focus:ring-orange-500 focus:outline-hidden resize-none"
                        placeholder="e.g. Any Answer / Number of acres, or Yes/No..."
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Bottom Actions */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-zinc-900">
              <Button variant="ghost" size="sm" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleConfirmImport}
                leftIcon={<FileSpreadsheet className="w-4 h-4" />}
              >
                Confirm & Import {previewQuestions.length} Questions
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
