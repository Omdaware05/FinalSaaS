import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';
import { contactsApi } from '../../services/api/contacts';
import { agentsApi } from '../../services/api/agents';
import { useToast } from '../../app/providers/ToastProvider';
import { getErrorMessage } from '../../services/api/client';
import { CsvImportResponse } from '../../types/api';
import { UploadCloud, FileSpreadsheet, CheckCircle2, AlertTriangle } from 'lucide-react';

export interface CsvImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const CsvImportModal: React.FC<CsvImportModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [importResult, setImportResult] = useState<CsvImportResponse | null>(null);

  const { data: agents = [] } = useQuery({
    queryKey: ['agents'],
    queryFn: () => agentsApi.getAgents(50),
    enabled: isOpen,
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      if (!selected.name.endsWith('.csv')) {
        toast.error('Invalid file format', 'Please choose a .csv spreadsheet.');
        return;
      }
      setFile(selected);
      setImportResult(null);
    }
  };

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setIsUploading(true);
    try {
      const res = await contactsApi.importCsv(file, selectedAgentId || undefined);
      setImportResult(res);
      toast.success(
        'CSV Processed',
        `Imported ${res.imported_rows} of ${res.total_rows} contacts (${res.invalid_rows} invalid).`
      );
      onSuccess();
    } catch (err: any) {
      toast.error('Import failed', getErrorMessage(err));
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Import Contacts from CSV"
      description="Upload contacts for CRM profile memory, campaigns, and batch dialing."
      size="md"
    >
      <form onSubmit={handleImport} className="space-y-4">
        <div className="border-2 border-dashed border-slate-300 dark:border-white/10 hover:border-orange-500/60 rounded-2xl p-6 text-center cursor-pointer transition-colors bg-slate-50/50 dark:bg-white/[0.03]">
          <input
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            id="csv-contact-input"
            className="hidden"
          />
          <label htmlFor="csv-contact-input" className="cursor-pointer flex flex-col items-center">
            <div className="w-12 h-12 rounded-2xl bg-orange-500/10 text-orange-500 dark:text-orange-400 flex items-center justify-center mb-3 shadow-xs">
              <UploadCloud className="w-6 h-6" />
            </div>
            {file ? (
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                <FileSpreadsheet className="w-4 h-4" />
                <span>{file.name} ({(file.size / 1024).toFixed(1)} KB)</span>
              </div>
            ) : (
              <div>
                <span className="text-xs font-semibold text-orange-500 dark:text-orange-400">
                  Click to select CSV spreadsheet
                </span>
                <p className="text-[11px] text-slate-400 mt-1">Expected column headers: phone_number, name, email</p>
              </div>
            )}
          </label>
        </div>

        <Select
          label="Assign to Default Agent (Optional)"
          value={selectedAgentId}
          onChange={(e) => setSelectedAgentId(e.target.value)}
        >
          <option value="">Do not assign to specific agent</option>
          {agents.map((ag) => (
            <option key={ag.agent_id} value={ag.agent_id}>
              {ag.name}
            </option>
          ))}
        </Select>

        {/* Results reporting summary */}
        {importResult && (
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
            <h4 className="font-bold text-slate-800 dark:text-slate-200">Import Report Summary:</h4>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div>Total Rows: <strong className="text-slate-900 dark:text-slate-100">{importResult.total_rows}</strong></div>
              <div>Imported: <strong className="text-emerald-600">{importResult.imported_rows}</strong></div>
              <div>Invalid: <strong className="text-rose-600">{importResult.invalid_rows}</strong></div>
              <div>Duplicates: <strong className="text-amber-600">{importResult.duplicate_rows}</strong></div>
            </div>

            {importResult.errors && importResult.errors.length > 0 && (
              <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <span className="font-semibold text-rose-500 text-[11px]">Errors detected ({importResult.errors.length}):</span>
                <div className="max-h-24 overflow-y-auto space-y-1 mt-1 font-mono text-[10px] text-slate-500">
                  {importResult.errors.slice(0, 5).map((err, i) => (
                    <div key={i}>Row {err.row_number}: {err.error}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100 dark:border-slate-800">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isUploading}>
            {importResult ? 'Close' : 'Cancel'}
          </Button>
          {!importResult && (
            <Button
              type="submit"
              variant="primary"
              size="sm"
              isLoading={isUploading}
              disabled={!file}
              leftIcon={<CheckCircle2 className="w-4 h-4" />}
            >
              Upload & Process
            </Button>
          )}
        </div>
      </form>
    </Modal>
  );
};
