import React, { useState } from 'react';
import { ReportReason, DosTheme } from '../types';
import { DOS_THEMES } from '../utils/dosThemes';

interface ReportModalProps {
  isOpen: boolean;
  theme: DosTheme;
  onClose: () => void;
  onSubmit: (reason: ReportReason, details: string, alsoBlock: boolean) => Promise<void>;
  reportedUserName: string;
}

const REPORT_REASONS: { id: ReportReason; code: string; label: string }[] = [
  { id: 'harassment', code: '0x01', label: 'HARASSMENT / BULLYING' },
  { id: 'sexual_content', code: '0x02', label: 'EXPLICIT / SEXUAL CONTENT' },
  { id: 'hate_speech', code: '0x03', label: 'HATE SPEECH / DISCRIMINATION' },
  { id: 'spam', code: '0x04', label: 'SPAM / AUTOMATED BOT FLOOD' },
  { id: 'scam', code: '0x05', label: 'SCAM / PHISHING ATTEMPT' },
  { id: 'violence', code: '0x06', label: 'VIOLENCE / THREATS' },
  { id: 'other', code: '0x07', label: 'OTHER VIOLATION OF PROTOCOL' },
];

export const ReportModal: React.FC<ReportModalProps> = ({
  isOpen,
  theme,
  onClose,
  onSubmit,
  reportedUserName,
}) => {
  const [selectedReason, setSelectedReason] = useState<ReportReason>('harassment');
  const [details, setDetails] = useState('');
  const [alsoBlock, setAlsoBlock] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const themeConfig = DOS_THEMES[theme] || DOS_THEMES.vga;

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onSubmit(selectedReason, details, alsoBlock);
      setSubmitted(true);
      setTimeout(() => {
        setSubmitted(false);
        onClose();
      }, 1500);
    } catch (err) {
      console.error('Failed to submit report', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 font-mono select-none">
      <div
        className={`max-w-md w-full border-4 border-double ${themeConfig.borderClass} ${themeConfig.panelClass} ${themeConfig.textClass} p-4 shadow-2xl relative`}
        style={{
          boxShadow: '6px 6px 0px #000000',
        }}
      >
        {/* DOS Header */}
        <div className={`p-1 text-center font-dos text-xl font-bold tracking-widest ${themeConfig.headerClass} mb-3`}>
          *** DOS SECURITY ALERT: FLAG PEER ***
        </div>

        {submitted ? (
          <div className="text-center py-6 space-y-2">
            <div className="font-dos text-2xl text-green-400">
              [REPORT DISPATCHED TO FIREBASE SEC-LOG]
            </div>
            <p className="text-xs opacity-80">
              PEER HAS BEEN DROPPED FROM PACKET QUEUE. RETURNING TO TERMINAL...
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3 text-xs">
            <div className="font-mono border-b border-current pb-2">
              TARGET_HOST: <span className={themeConfig.highlightClass}>[{reportedUserName}]</span>
            </div>

            <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
              <div className="opacity-70 text-[11px] mb-1">SELECT INFRACTION CODE:</div>
              {REPORT_REASONS.map((r) => (
                <label
                  key={r.id}
                  className={`flex items-center gap-2 p-1 border cursor-pointer ${
                    selectedReason === r.id
                      ? 'border-current bg-white/10 font-bold'
                      : 'border-transparent hover:bg-white/5 opacity-80'
                  }`}
                >
                  <input
                    type="radio"
                    name="reportReason"
                    value={r.id}
                    checked={selectedReason === r.id}
                    onChange={() => setSelectedReason(r.id)}
                    className="accent-current"
                  />
                  <span>[{r.code}] {r.label}</span>
                </label>
              ))}
            </div>

            <div>
              <div className="opacity-70 text-[11px] mb-0.5">ADDITIONAL NOTES (MAX 300 CHARS):</div>
              <textarea
                value={details}
                onChange={(e) => setDetails(e.target.value.slice(0, 300))}
                rows={2}
                placeholder="INPUT ERROR LOG DETAILS..."
                className="w-full p-1.5 bg-black/60 border border-current text-current font-mono text-xs focus:outline-none"
              />
            </div>

            <label className="flex items-center gap-2 cursor-pointer p-1 border border-dashed border-current/40">
              <input
                type="checkbox"
                checked={alsoBlock}
                onChange={(e) => setAlsoBlock(e.target.checked)}
                className="accent-current"
              />
              <span className="text-[11px]">
                [X] PERMANENTLY BAN HOST FROM MATCHMAKING TABLE
              </span>
            </label>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-2 border-t border-current/40">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-1.5 border border-current hover:bg-white/10 font-mono"
              >
                [ ESC: CANCEL ]
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-1.5 bg-red-800 text-white border border-red-500 hover:bg-red-700 font-mono font-bold"
              >
                {submitting ? 'DISPATCHING...' : '[ TRANSMIT REPORT ]'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
