import React from 'react';
import { useAuth } from '../context/AuthContext';
import { generateAnonymousName } from '../utils/nameGenerator';

interface HomeViewProps {
  onStartMatching: () => void;
}

export const HomeView: React.FC<HomeViewProps> = ({ onStartMatching }) => {
  const {
    currentUser,
    profile,
    onlineCount,
    isAnonymousDisabled,
    loginWithGoogle,
    updateDisplayName,
  } = useAuth();

  const rerollHandle = async () => {
    const fresh = generateAnonymousName();
    await updateDisplayName(fresh);
  };

  return (
    <div className="min-h-screen bg-[#020a03] text-[#39ff14] font-mono flex flex-col justify-between p-4 sm:p-6 select-none relative">
      {/* Top minimal status bar */}
      <header className="border-b border-[#1b5e20] pb-2 text-xs flex justify-between items-center opacity-85">
        <div>C:\SAPA\CEPU.EXE</div>
        <div className="flex items-center gap-2">
          <span className="animate-pulse">●</span>
          <span>{onlineCount.toLocaleString()} ORANG ONLINE</span>
        </div>
      </header>

      {/* Main Center Terminal Box */}
      <main className="w-full max-w-lg mx-auto my-auto py-8">
        <div
          className="border-2 border-[#1b5e20] bg-[#051407] p-6 sm:p-8 shadow-2xl relative"
          style={{
            boxShadow: '0 0 20px rgba(57, 255, 20, 0.15)',
          }}
        >
          {/* Header Title */}
          <div className="text-center font-dos text-3xl sm:text-4xl font-bold tracking-widest text-[#72ff59] mb-2 text-glow">
            CEPU / SPILL TERMINAL
          </div>

          <div className="text-center text-xs text-[#72ff59] opacity-80 mb-6">
            Bocorkan rahasia di tempat kerja atau komunitas tanpa jejak.
            <br />
            Semua pesan musnah & berterbangan dalam 5 menit.
          </div>

          <div className="border-t border-b border-[#1b5e20] py-3 my-4 text-xs space-y-1.5 opacity-90">
            <div className="flex justify-between items-center">
              <span>IDENTITAS ANOMALIS:</span>
              <span className="font-bold text-[#b8ffaa] flex items-center gap-1">
                [{profile?.displayName || 'CEPU-ANON'}]
                <button
                  onClick={rerollHandle}
                  className="text-[10px] opacity-70 hover:opacity-100 hover:underline cursor-pointer ml-1"
                  title="Ganti kode anonim"
                >
                  [GANTI]
                </button>
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span>PENYIMPANAN DATA:</span>
              <span className="text-[#b8ffaa]">0% (EPHEMERAL PURGE)</span>
            </div>
            <div className="flex justify-between items-center">
              <span>STATUS KONEKSI:</span>
              <span className={currentUser ? 'text-[#39ff14]' : 'text-[#ffff33]'}>
                {currentUser ? 'TERHUBUNG (SIAP CHAT)' : 'STANDBY'}
              </span>
            </div>
          </div>

          {/* Action Button: START CHAT */}
          <div className="mt-8 space-y-3">
            {!currentUser && isAnonymousDisabled ? (
              <button
                onClick={loginWithGoogle}
                className="w-full py-4 px-6 text-lg sm:text-xl font-dos font-bold tracking-widest border-2 border-[#39ff14] bg-[#0d3b13] text-[#39ff14] hover:bg-[#1b5e20] hover:text-[#b8ffaa] active:translate-y-0.5 transition-all cursor-pointer flex items-center justify-center gap-2 shadow-lg"
                style={{
                  boxShadow: '0 0 15px rgba(57, 255, 20, 0.3)',
                }}
              >
                <span>►</span>
                <span>[ START CHAT / CONNECT ]</span>
                <span>◄</span>
              </button>
            ) : (
              <button
                onClick={onStartMatching}
                className="w-full py-4 px-6 text-xl sm:text-2xl font-dos font-bold tracking-widest border-2 border-[#39ff14] bg-[#0d3b13] text-[#39ff14] hover:bg-[#1b5e20] hover:text-[#b8ffaa] active:translate-y-0.5 transition-all cursor-pointer flex items-center justify-center gap-2 shadow-lg"
                style={{
                  boxShadow: '0 0 15px rgba(57, 255, 20, 0.3)',
                }}
              >
                <span>►</span>
                <span>[ START CHAT ]</span>
                <span>◄</span>
              </button>
            )}
          </div>

          {/* Prompt line */}
          <div className="mt-6 text-xs text-center opacity-70">
            &gt; Klik tombol untuk terhubung dengan orang asing secara acak
            <span className="inline-block w-2 h-3.5 bg-[#39ff14] animate-cursor ml-1 align-middle" />
          </div>

          {isAnonymousDisabled && !currentUser && (
            <div className="mt-4 pt-3 border-t border-[#1b5e20] text-[10px] text-left opacity-60 leading-relaxed font-mono">
              * Info: Anonymous provider dinonaktifkan di console, masuk menggunakan autentikasi instan (identitas Anda tetap 100% anonim sebagai kode CEPU).
            </div>
          )}
        </div>
      </main>

      {/* Footer minimal */}
      <footer className="text-center text-[11px] opacity-50 border-t border-[#1b5e20] pt-2">
        SAPA EPHEMERAL NETWORK &bull; ZERO LOGS &bull; DIJAMIN ANONIM
      </footer>
    </div>
  );
};
