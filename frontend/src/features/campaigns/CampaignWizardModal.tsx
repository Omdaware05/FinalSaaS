import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Papa from 'papaparse';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { campaignsApi } from '../../services/api/campaigns';
import { agentsApi } from '../../services/api/agents';
import { questionnairesApi } from '../../services/api/questionnaires';
import { useToast } from '../../app/providers/ToastProvider';
import { getErrorMessage } from '../../services/api/client';
import { ProviderType } from '../../types/api';
import {
  Megaphone,
  Bot,
  Users,
  Sliders,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  UploadCloud,
} from 'lucide-react';

export interface CampaignWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const CampaignWizardModal: React.FC<CampaignWizardModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const toast = useToast();
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form State
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [agentId, setAgentId] = useState('');
  const [questionnaireId, setQuestionnaireId] = useState('');
  const [phoneText, setPhoneText] = useState('');
  const [provider, setProvider] = useState<ProviderType>('vobiz');
  const [concurrency, setConcurrency] = useState(3);

  // Queries
  const { data: agents = [] } = useQuery({
    queryKey: ['agents'],
    queryFn: () => agentsApi.getAgents(50),
    enabled: isOpen,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const { data: questionnaires = [] } = useQuery({
    queryKey: ['questionnaires'],
    queryFn: () => questionnairesApi.getQuestionnaires(),
    enabled: isOpen,
  });

  // Set default agent
  React.useEffect(() => {
    if (agents.length > 0) {
      const exists = agents.some((a) => (a.agent_id || (a as any).id) === agentId);
      if (!agentId || !exists) {
        setAgentId(agents[0].agent_id || (agents[0] as any).id);
      }
    }
  }, [agents, agentId]);

  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      complete: (result) => {
        const numbers = (result.data as string[][])
          .flat()
          .map((n) => String(n).trim())
          .filter((n) => n.length > 5 && (n.startsWith('+') || /^\d+$/.test(n)));

        if (numbers.length > 0) {
          setPhoneText(numbers.join('\n'));
          toast.success('CSV Loaded', `Imported ${numbers.length} numbers.`);
        } else {
          toast.warning('No valid phone numbers found in CSV');
        }
      },
      error: () => toast.error('Failed to parse CSV'),
    });
  };

  const parsedNumbers = phoneText
    .split('\n')
    .map((n) => n.trim())
    .filter(Boolean);

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error('Campaign name is required');
      setStep(1);
      return;
    }
    if (!agentId) {
      toast.error('Please choose an agent');
      setStep(2);
      return;
    }
    if (parsedNumbers.length === 0) {
      toast.error('Please enter at least one phone number');
      setStep(3);
      return;
    }

    setIsSubmitting(true);
    try {
      await campaignsApi.createCampaign({
        name: name.trim(),
        description: description.trim() || undefined,
        agent_id: agentId,
        questionnaire_id: questionnaireId || undefined,
        phone_numbers: parsedNumbers,
        concurrency,
        provider,
      });

      toast.success('Campaign Created', `Initialized "${name}" with ${parsedNumbers.length} targets.`);
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error('Failed to create campaign', getErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const steps = [
    { num: 1, title: 'Details', icon: Megaphone },
    { num: 2, title: 'AI Agent', icon: Bot },
    { num: 3, title: 'Audience', icon: Users },
    { num: 4, title: 'Execution', icon: Sliders },
    { num: 5, title: 'Review', icon: CheckCircle2 },
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create Outbound Voice Campaign"
      description="Launch structured high-throughput calling batches with automated semaphores."
      size="lg"
    >
      <div className="space-y-6">
        {/* Stepper Progress Indicator */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
          {steps.map((s) => {
            const isActive = s.num === step;
            const isDone = s.num < step;
            return (
              <div
                key={s.num}
                onClick={() => isDone && setStep(s.num)}
                className={`flex items-center gap-1.5 text-xs font-semibold select-none ${
                  isActive
                    ? 'text-orange-500 dark:text-orange-400'
                    : isDone
                    ? 'text-slate-700 dark:text-slate-300 cursor-pointer'
                    : 'text-slate-400 opacity-60'
                }`}
              >
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    isActive
                      ? 'bg-orange-500 text-white shadow-sm shadow-orange-500/20'
                      : isDone
                      ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400'
                      : 'bg-slate-100 dark:bg-white/5 text-slate-500'
                  }`}
                >
                  {s.num}
                </div>
                <span className="hidden sm:inline">{s.title}</span>
              </div>
            );
          })}
        </div>

        {/* Step 1: Details */}
        {step === 1 && (
          <div className="space-y-4">
            <Input
              label="Campaign Name"
              placeholder="e.g. Q4 Auto Insurance Follow-up"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <Input
              label="Campaign Purpose & Goal"
              placeholder="Brief description of outreach target..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        )}

        {/* Step 2: Agent & Script */}
        {step === 2 && (
          <div className="space-y-4">
            <Select
              label="Select AI Voice Agent"
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              required
            >
              {agents.map((ag) => {
                const id = ag.agent_id || (ag as any).id;
                const voice = ag.voice_name ? ` • ${ag.voice_name}` : '';
                const engine = ag.tts_provider ? ` [${ag.tts_provider.toUpperCase()}]` : '';
                return (
                  <option key={id} value={id}>
                    {ag.name} ({ag.default_language || 'English'}{voice}{engine})
                  </option>
                );
              })}
            </Select>

            <Select
              label="Attach Script Questionnaire (Optional)"
              value={questionnaireId}
              onChange={(e) => setQuestionnaireId(e.target.value)}
            >
              <option value="">No Questionnaire Attached</option>
              {questionnaires.map((q) => (
                <option key={q.questionnaire_id} value={q.questionnaire_id}>
                  {q.title} ({q.version_id}) — {q.questions?.length || 0} Questions
                </option>
              ))}
            </Select>
          </div>
        )}

        {/* Step 3: Audience Numbers */}
        {step === 3 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Target Phone Numbers ({parsedNumbers.length} targets detected)
              </label>
              <label className="cursor-pointer text-xs font-semibold text-orange-500 dark:text-orange-400 hover:underline flex items-center gap-1">
                <UploadCloud className="w-3.5 h-3.5" />
                <span>Upload CSV</span>
                <input type="file" accept=".csv" onChange={handleCsvUpload} className="hidden" />
              </label>
            </div>
            <textarea
              rows={5}
              value={phoneText}
              onChange={(e) => setPhoneText(e.target.value)}
              placeholder="+919876543210&#10;+919876543211&#10;+919876543212"
              className="w-full p-3 text-xs font-mono rounded-xl bg-white/70 dark:bg-white/[0.04] border border-slate-300/80 dark:border-white/10 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-orange-500/40"
            />
          </div>
        )}

        {/* Step 4: Telephony & Concurrency */}
        {step === 4 && (
          <div className="space-y-4">
            <Select
              label="Telephony Provider"
              value={provider}
              onChange={(e) => setProvider(e.target.value as ProviderType)}
            >
              <option value="vobiz">VoBiz (Direct Carrier - +918065354620)</option>
              <option value="twilio">Twilio (US/Global - +13344895368)</option>
              <option value="plivo">Plivo</option>
            </Select>

            <div>
              <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                <span>Concurrency Slots:</span>
                <span className="font-mono text-orange-500 dark:text-orange-400 font-bold">{concurrency} Channels</span>
              </div>
              <input
                type="range"
                min="1"
                max="20"
                value={concurrency}
                onChange={(e) => setConcurrency(parseInt(e.target.value))}
                className="w-full h-1.5 bg-slate-200 dark:bg-white/10 rounded-lg appearance-none cursor-pointer accent-orange-500 focus:outline-none mt-2"
              />
              <p className="text-[11px] text-slate-400 mt-1">Limits simultaneous outbound calls for this campaign.</p>
            </div>
          </div>
        )}

        {/* Step 5: Review */}
        {step === 5 && (
          <div className="p-4 rounded-2xl bg-slate-50/70 dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/10 space-y-2.5 text-xs">
            <div className="flex justify-between py-1 border-b border-slate-100 dark:border-white/5">
              <span className="text-slate-500">Campaign Name:</span>
              <strong className="text-slate-900 dark:text-slate-100">{name}</strong>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-100 dark:border-white/5">
              <span className="text-slate-500">Assigned Agent:</span>
              <strong className="text-slate-900 dark:text-slate-100">
                {agents.find((a) => a.agent_id === agentId)?.name || 'Agent'}
              </strong>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-100 dark:border-white/5">
              <span className="text-slate-500">Audience Size:</span>
              <strong className="text-orange-500 dark:text-orange-400 font-mono">{parsedNumbers.length} Phone Numbers</strong>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
              <span className="text-slate-500">Telephony Provider:</span>
              <strong className="text-slate-900 dark:text-slate-100 uppercase">{provider}</strong>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-slate-500">Concurrency:</span>
              <strong className="text-slate-900 dark:text-slate-100">{concurrency} Parallel Channels</strong>
            </div>
          </div>
        )}

        {/* Wizard Footer Controls */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
          {step > 1 ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setStep((s) => s - 1)}
              leftIcon={<ChevronLeft className="w-4 h-4" />}
            >
              Previous
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
          )}

          {step < 5 ? (
            <Button
              variant="primary"
              size="sm"
              onClick={() => setStep((s) => s + 1)}
              rightIcon={<ChevronRight className="w-4 h-4" />}
            >
              Next Step
            </Button>
          ) : (
            <Button
              variant="primary"
              size="sm"
              onClick={handleSubmit}
              isLoading={isSubmitting}
              leftIcon={<CheckCircle2 className="w-4 h-4" />}
            >
              Launch Campaign
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
};
