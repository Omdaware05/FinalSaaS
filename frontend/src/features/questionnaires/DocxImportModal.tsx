import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';
import { questionnairesApi } from '../../services/api/questionnaires';
import { agentsApi } from '../../services/api/agents';
import { useToast } from '../../app/providers/ToastProvider';
import { getErrorMessage } from '../../services/api/client';
import { FileUp, FileText, CheckCircle2 } from 'lucide-react';

export interface DocxImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const DocxImportModal: React.FC<DocxImportModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  const { data: agents = [] } = useQuery({
    queryKey: ['agents'],
    queryFn: () => agentsApi.getAgents(50),
    enabled: isOpen,
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      if (!selected.name.endsWith('.docx')) {
        toast.error('Invalid file format', 'Please select a valid Word document (.docx).');
        return;
      }
      setFile(selected);
    }
  };

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      toast.error('Please choose a .docx document');
      return;
    }

    setIsUploading(true);
    try {
      const doc = await questionnairesApi.importDocx(file, selectedAgentId || undefined);
      toast.success('Document Imported', `Imported "${doc.title}" with ${doc.questions?.length || 0} questions.`);
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error('Import Failed', getErrorMessage(err));
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Import Questionnaire from DOCX"
      description="Upload a structured Word (.docx) document to automatically parse into conversational questions and conditional rules."
      size="md"
    >
      <form onSubmit={handleImport} className="space-y-4">
        {/* Dropzone */}
        <div className="border-2 border-dashed border-slate-300 dark:border-white/10 hover:border-orange-500/60 rounded-2xl p-6 text-center cursor-pointer transition-colors bg-slate-50/50 dark:bg-white/[0.03]">
          <input
            type="file"
            accept=".docx"
            onChange={handleFileChange}
            id="docx-file-input"
            className="hidden"
          />
          <label htmlFor="docx-file-input" className="cursor-pointer flex flex-col items-center">
            <div className="w-12 h-12 rounded-2xl bg-orange-500/10 text-orange-500 dark:text-orange-400 flex items-center justify-center mb-3 shadow-xs">
              <FileUp className="w-6 h-6" />
            </div>
            {file ? (
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                <FileText className="w-4 h-4" />
                <span>{file.name} ({(file.size / 1024).toFixed(1)} KB)</span>
              </div>
            ) : (
              <div>
                <span className="text-xs font-semibold text-orange-500 dark:text-orange-400">
                  Click to select .docx file
                </span>
                <p className="text-[11px] text-slate-400 mt-1">Supports standard question tables and bullet points</p>
              </div>
            )}
          </label>
        </div>

        {/* Optional Agent attachment */}
        <Select
          label="Associate with Agent (Optional)"
          value={selectedAgentId}
          onChange={(e) => setSelectedAgentId(e.target.value)}
        >
          <option value="">Do not assign to agent now</option>
          {agents.map((ag) => (
            <option key={ag.agent_id} value={ag.agent_id}>
              {ag.name}
            </option>
          ))}
        </Select>

        <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100 dark:border-slate-800">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isUploading}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            isLoading={isUploading}
            disabled={!file}
            leftIcon={<CheckCircle2 className="w-4 h-4" />}
          >
            Import Document
          </Button>
        </div>
      </form>
    </Modal>
  );
};
