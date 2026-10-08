import React, { useEffect, useState } from 'react';

interface MatchingViewProps {
  statusText: string;
  onCancel: () => void;
}

const SPINNER_CHARS = ['|', '/', '-', '\\'];

export const MatchingView: React.FC<MatchingViewProps> = ({
  statusText,
  onCancel,
}) => {
  const [spinnerIdx, setSpinnerIdx] = useState(0);
  const [progress, setProgress] = useState(20);

  useEffect(() => {
    const spinnerTimer = setInterval(() => {
      setSpinnerIdx((prev) => (prev + 1) % SPINNER_CHARS.length);
    }, 150);

    const progressTimer = setInterval(() => {
      setProgress((prev) => (prev < 90 ? prev + Math.floor(Math.random() * 10) : prev));
    }, 600);

    return () => {
      clearInterval(spinnerTimer);
      clearInterval(progressTimer);
    };
  }, []);

  const totalBars = 20;
  const filledBars = Math.floor((progress / 100) * totalBars);
  const emptyBars = Math.max(0, totalBars - filledBars);
  const progressBarAscii = `[${'█'.repeat(filledBars)}${'░'.repeat(emptyBars)}] ${progress}%`;

  return (
    <div className="min-h-screen bg-[#020a03] text-[#39ff14] font-mono flex flex-col justify-between p-4 sm:p-6 select-none">
      {/* Top minimal header */}
      <div className="border-b border-[#1b5e20] pb-2 text-xs flex justify-between items-center opacity-85">
        <div>C:\SAPA\MATCH.EXE</div>
        <div>MENCARI LAWAN BICARA...</div>
      </div>

      {/* Main Terminal Box */}
      <div className="w-full max-w-md mx-auto my-auto">
        <div
          className="border-2 border-[#1b5e20] bg-[#051407] p-6 sm:p-8 shadow-2xl text-center space-y-4"
          style={{
            boxShadow: '0 0 20px rgba(57, 255, 20, 0.15)',
          }}
        >
          <div className="font-dos text-3xl font-bold tracking-widest text-[#72ff59] flex items-center justify-center gap-3">
            <span>[ {SPINNER_CHARS[spinnerIdx]} ]</span>
            <span>MENCARI ORANG ASING...</span>
          </div>

          <div className="text-xs text-[#72ff59] opacity-80 font-mono">
            Menyambungkan koneksi acak untuk spill rahasia...
          </div>

          <div className="py-2">
            <div className="text-lg font-mono tracking-widest text-[#b8ffaa]">
              {progressBarAscii}
            </div>
            <div className="text-xs opacity-75 mt-1 font-mono">
              {statusText || 'Menunggu sambungan...'}
            </div>
          </div>

          <div className="pt-2">
            <button
              onClick={onCancel}
              className="py-2.5 px-6 border border-[#39ff14] bg-[#08260e] hover:bg-[#1b5e20] text-[#39ff14] font-mono text-xs font-bold transition-all cursor-pointer"
            >
              [ BATALKAN ]
            </button>
          </div>
        </div>
      </div>

      <footer className="text-center text-[11px] opacity-50 border-t border-[#1b5e20] pt-2">
        KONEKSI ENKRIPSI &bull; RAHASIA AKAN HILANG SETELAH 5 MENIT
      </footer>
    </div>
  );
};
