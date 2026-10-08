import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { ChatMessage, ChatSession } from '../types';
import {
  subscribeToChatSession,
  subscribeToMessages,
  sendTextMessage,
  sendImageMessage,
  deleteMessage,
  endChatSession,
  cleanupSessionMessages,
} from '../services/chatService';
import { DisintegratingMessage } from './DisintegratingMessage';
import { ImageViewerModal } from './ImageViewerModal';
import { compressImage } from '../utils/imageCompressor';
import { formatCountdown, getRemainingSeconds } from '../utils/timeSync';

interface ChatViewProps {
  sessionId: string;
  onEndChat: () => void;
}

export const ChatView: React.FC<ChatViewProps> = ({
  sessionId,
  onEndChat,
}) => {
  const { currentUser, profile } = useAuth();
  const [session, setSession] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [fullScreenImage, setFullScreenImage] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [sessionRemaining, setSessionRemaining] = useState<number>(300);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const myUid = currentUser?.uid || '';
  const isUserA = session?.userA === myUid;
  const partnerName = session
    ? isUserA
      ? session.userBName
      : session.userAName
    : 'ORANG_ASING';

  // 1. Subscribe to Session
  useEffect(() => {
    const unsub = subscribeToChatSession(
      sessionId,
      (updatedSession) => {
        setSession(updatedSession);
      },
      (err) => {
        console.error('Session listener error:', err);
        setErrorMessage('Koneksi terputus.');
      }
    );

    return () => unsub();
  }, [sessionId]);

  // 2. Subscribe to Ephemeral Messages
  useEffect(() => {
    const unsub = subscribeToMessages(
      sessionId,
      (newMessages) => {
        setMessages(newMessages);
      },
      (err) => {
        console.error('Messages listener error:', err);
      }
    );

    return () => unsub();
  }, [sessionId]);

  // 3. Track Overall 5-Minute Session Expiration
  useEffect(() => {
    if (!session?.expiresAt) return;

    const updateTimer = () => {
      const rem = getRemainingSeconds(session.expiresAt);
      setSessionRemaining(rem);

      if (rem <= 0 && session.status === 'active') {
        endChatSession(sessionId, myUid);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [session?.expiresAt, session?.status, sessionId, myUid]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSendText = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = inputText.trim();
    if (!trimmed || !session || session.status === 'ended') return;

    setInputText('');

    try {
      await sendTextMessage(
        sessionId,
        myUid,
        profile?.displayName || 'ANON',
        trimmed
      );
    } catch (err: any) {
      console.error('Send message error:', err);
      setErrorMessage('Gagal mengirim pesan.');
      setTimeout(() => setErrorMessage(null), 3000);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !session || session.status === 'ended') return;

    if (file.size > 5 * 1024 * 1024) {
      setErrorMessage('Ukuran file melebihi 5 MB.');
      setTimeout(() => setErrorMessage(null), 3000);
      return;
    }

    setIsUploadingImage(true);

    try {
      const compressed = await compressImage(file, 1280, 1280, 0.82);
      await sendImageMessage(
        sessionId,
        myUid,
        profile?.displayName || 'ANON',
        compressed
      );
    } catch (err: any) {
      console.error('Image upload error:', err);
      setErrorMessage('Gagal mengunggah foto bukti.');
      setTimeout(() => setErrorMessage(null), 3000);
    } finally {
      setIsUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDisintegrate = (messageId: string, storagePath?: string) => {
    deleteMessage(sessionId, messageId, storagePath);
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
  };

  const handleEndChat = async () => {
    if (session) {
      await endChatSession(sessionId, myUid);
    }
    cleanupSessionMessages(sessionId).catch(() => {});
    onEndChat();
  };

  const isSessionEnded = session?.status === 'ended';

  return (
    <div className="h-screen max-h-screen bg-[#020a03] text-[#39ff14] font-mono flex flex-col justify-between overflow-hidden select-none">
      {/* Top Header: Lawan Bicara, Countdown Timer, and END CHAT */}
      <header className="border-b-2 border-[#1b5e20] bg-[#051407] px-4 py-2.5 flex items-center justify-between gap-2 z-20 shadow-md">
        <div className="flex items-center gap-2 font-dos text-lg">
          <span className="font-bold text-[#72ff59]">LAWAN: [{partnerName}]</span>
          <span className="text-xs text-green-400 font-mono flex items-center gap-1">
            <span className="animate-pulse">●</span> TERHUBUNG
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs sm:text-sm font-mono">
          <span className="opacity-80">SISA WAKTU:</span>
          <span className={`font-bold font-dos text-lg ${sessionRemaining <= 30 ? 'animate-urgent' : 'text-[#b8ffaa]'}`}>
            [{formatCountdown(sessionRemaining)}]
          </span>
        </div>

        <div>
          <button
            onClick={handleEndChat}
            className="py-1.5 px-3.5 border-2 border-red-500 bg-red-950/70 text-red-300 font-mono font-bold text-xs hover:bg-red-900 active:translate-y-0.5 transition-all cursor-pointer shadow-sm"
          >
            [ END CHAT ]
          </button>
        </div>
      </header>

      {/* Floating alert */}
      {errorMessage && (
        <div className="bg-red-950 border-b border-red-500 text-red-300 text-xs px-4 py-1 text-center font-mono">
          *** {errorMessage} ***
        </div>
      )}

      {/* Message List */}
      <div className="flex-1 overflow-y-auto px-3 sm:px-6 py-4 space-y-2 relative bg-black/40">
        <div className="border border-[#1b5e20] p-2 text-center text-xs opacity-75 font-mono bg-[#030d04] mb-3">
          &gt; SESI RAHASIA AKTIF. SEMUA TULISAN AKAN BERTERBANGAN & MUSNAH DALAM 5 MENIT.
        </div>

        {messages.length === 0 ? (
          <div className="h-44 flex flex-col items-center justify-center text-center opacity-60 font-mono text-xs space-y-1">
            <p>&gt; BELUM ADA PESAN.</p>
            <p>&gt; KETIK DAN BOCORKAN RAHASIA DI BAWAH INI... 👇</p>
          </div>
        ) : (
          messages.map((msg) => (
            <DisintegratingMessage
              key={msg.id}
              message={msg}
              isMe={msg.senderId === myUid}
              onDisintegrate={handleDisintegrate}
              onOpenImage={(url) => setFullScreenImage(url)}
            />
          ))
        )}

        {isUploadingImage && (
          <div className="p-2 border border-[#1b5e20] text-xs font-mono text-center animate-pulse text-[#b8ffaa]">
            &gt; MENGIRIM BUKTI FOTO...
          </div>
        )}

        {isSessionEnded && (
          <div className="my-4 p-4 border-2 border-dashed border-red-500 bg-red-950/40 text-center font-mono space-y-2">
            <div className="text-red-400 font-bold text-xs sm:text-sm">
              *** SESI CHAT TELAH BERAKHIR & DIHAPUS DARI MEMORI ***
            </div>
            <button
              onClick={handleEndChat}
              className="py-2 px-5 border border-[#39ff14] bg-[#0d3b13] text-[#39ff14] font-bold text-xs cursor-pointer hover:bg-[#1b5e20]"
            >
              [ KEMBALI KE MENU UTAMA ]
            </button>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Hidden File Input for Image attachments */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Chat Command Input Line */}
      <div className="border-t-2 border-[#1b5e20] bg-[#051407] p-3 z-10">
        <form onSubmit={handleSendText} className="flex items-center gap-2 max-w-4xl mx-auto">
          {/* Upload image button */}
          <button
            type="button"
            disabled={isSessionEnded}
            onClick={() => fileInputRef.current?.click()}
            className="px-2.5 py-2 border border-[#1b5e20] hover:bg-[#0d3b13] text-xs font-mono text-[#72ff59] cursor-pointer disabled:opacity-40"
            title="Kirim Foto Bukti"
          >
            [+ FOTO]
          </button>

          {/* Text Input */}
          <div className="flex-1 flex items-center bg-black border border-[#1b5e20] px-3 py-1.5 focus-within:border-[#39ff14]">
            <span className="text-xs text-[#72ff59] font-mono mr-2 select-none">&gt;</span>
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value.slice(0, 500))}
              disabled={isSessionEnded}
              placeholder={isSessionEnded ? 'Sesi telah berakhir' : 'Ketik spill / rahasia Anda di sini...'}
              className="flex-1 bg-transparent text-[#39ff14] font-mono text-xs sm:text-sm placeholder:opacity-40 focus:outline-none"
            />
          </div>

          {/* Send Button */}
          <button
            type="submit"
            disabled={!inputText.trim() || isSessionEnded}
            className="px-4 py-2 border border-[#39ff14] bg-[#0d3b13] hover:bg-[#1b5e20] text-[#39ff14] font-bold font-mono text-xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            [ KIRIM ]
          </button>
        </form>
      </div>

      {/* Fullscreen Image Viewer Modal */}
      <ImageViewerModal
        imageUrl={fullScreenImage}
        theme="green"
        onClose={() => setFullScreenImage(null)}
      />
    </div>
  );
};
