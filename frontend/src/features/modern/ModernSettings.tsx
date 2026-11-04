import React from 'react';
import { useNavigate } from 'react-router-dom';
import { PhoneCall, BrainCircuit, HeartPulse, SlidersHorizontal, ArrowUpRight, Palette } from 'lucide-react';
import { MCard, MPageHeader } from './ui';
import { LookToggle } from '../../components/layout/LookToggle';

/**
 * Modern Settings hub: the detailed settings screens (telephony forms,
 * model config, health) keep their specialist layouts and open inside
 * the modern shell; this hub is the clean front door, plus appearance.
 */
export const ModernSettings: React.FC = () => {
  const navigate = useNavigate();

  const cards = [
    {
      title: 'Telephony & Voice',
      text: 'Carrier credentials, caller numbers and voice provider setup.',
      icon: PhoneCall,
      to: '/settings/telephony',
    },
    {
      title: 'AI Models',
      text: 'Speech-to-text, language model and text-to-speech configuration.',
      icon: BrainCircuit,
      to: '/settings/models',
    },
    {
      title: 'Transcript Analysis',
      text: 'How call transcripts are analyzed for interest and lead scoring.',
      icon: SlidersHorizontal,
      to: '/settings/transcript',
    },
    {
      title: 'System Health',
      text: 'Service status, queues and diagnostics for the whole platform.',
      icon: HeartPulse,
      to: '/settings/health',
    },
  ];

  return (
    <div>
      <MPageHeader title="Settings" subtitle="Everything that configures your workspace, in one place." />

      {/* Appearance */}
      <MCard className="p-6 mb-6">
        <div className="flex flex-wrap items-center gap-4">
          <span className="w-11 h-11 rounded-2xl bg-orange-50 border border-orange-100 flex items-center justify-center shrink-0">
            <Palette className="w-5 h-5 text-orange-600" strokeWidth={1.9} />
          </span>
          <div className="flex-1 min-w-[220px]">
            <p className="text-[15px] font-bold text-[#101828]">Appearance</p>
            <p className="text-[13px] text-[#667085] mt-0.5">
              You are using the <strong>Modern</strong> interface. Switch back to Classic any time — your data and settings stay the same.
            </p>
          </div>
          <LookToggle />
        </div>
      </MCard>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {cards.map((c, i) => (
          <button
            key={c.title}
            type="button"
            onClick={() => navigate(c.to)}
            className="text-left anim-enter"
            style={{ animationDelay: `${Math.min(i * 60, 240)}ms` }}
          >
            <MCard className="p-6 h-full hover:shadow-[0_2px_4px_rgba(16,24,40,0.06),0_24px_50px_-28px_rgba(16,24,40,0.3)] hover:-translate-y-0.5 transition-all">
              <div className="flex items-start gap-3.5">
                <span className="w-11 h-11 rounded-2xl bg-[#F7F8FA] border border-[#EEF0F2] flex items-center justify-center shrink-0">
                  <c.icon className="w-5 h-5 text-[#344054]" strokeWidth={1.9} />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-bold text-[#101828]">{c.title}</p>
                  <p className="text-[13px] text-[#667085] mt-1 leading-relaxed">{c.text}</p>
                </div>
                <ArrowUpRight className="w-4 h-4 text-[#C4CBD4] shrink-0" />
              </div>
            </MCard>
          </button>
        ))}
      </div>
    </div>
  );
};
