import React from 'react';
import { DosTheme } from '../types';
import { DOS_THEMES } from '../utils/dosThemes';

interface EmptyStateModalProps {
  isOpen: boolean;
  theme: DosTheme;
  onTryAgain: () => void;
  onClose: () => void;
}

export const EmptyStateModal: React.FC<EmptyStateModalProps> = ({
  isOpen,
  theme,
  onTryAgain,
  onClose,
}) => {
  if (!isOpen) return null;
  const themeConfig = DOS_THEMES[theme] || DOS_THEMES.vga;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 font-mono select-none">
      <div
        className={`max-w-md w-full border-4 border-double ${themeConfig.borderClass} ${themeConfig.panelClass} ${themeConfig.textClass} p-4 shadow-2xl relative`}
        style={{
          boxShadow: '6px 6px 0px #000000',
        }}
      >
        <div className={`p-1.5 text-center font-dos text-xl font-bold ${themeConfig.headerClass} mb-3`}>
          *** MODEM: NO CARRIER DETECTED ***
        </div>

        <div className="border border-current p-3 bg-black/40 text-xs space-y-2 mb-4 font-mono">
          <p className="text-red-400 font-bold">
            ERROR 404: PEER CONNECTION TIMED OUT ON COM1.
          </p>
          <p className="opacity-90">
            No active strangers were found on the current vibe channel. Other operators may currently be in another channel or offline.
          </p>
          <p className="opacity-70 text-[11px]">
            &gt; RECOMMENDATION: Retrying dial sequence or changing vibe protocol.
          </p>
        </div>

        <div className="flex flex-col gap-2 font-mono">
          <button
            onClick={onTryAgain}
            className={`w-full py-2.5 px-4 font-bold border-2 border-current ${themeConfig.buttonClass} hover:opacity-90 flex items-center justify-center gap-2 cursor-pointer`}
          >
            <span>[► ENTER: RETRY DIALING CARRIER]</span>
          </button>
          <button
            onClick={onClose}
            className="w-full py-2 px-4 border border-current hover:bg-white/10 text-xs opacity-80 cursor-pointer"
          >
            [ ESC: ABORT & RETURN TO C:\&gt; PROMPT ]
          </button>
        </div>
      </div>
    </div>
  );
};
