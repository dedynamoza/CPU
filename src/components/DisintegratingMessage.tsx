import React, { useEffect, useState, useRef, useMemo } from 'react';
import { ChatMessage } from '../types';
import { formatCountdown, getRemainingSeconds } from '../utils/timeSync';

interface DisintegratingMessageProps {
  message: ChatMessage;
  isMe: boolean;
  onDisintegrate: (messageId: string, storagePath?: string) => void;
  onOpenImage?: (url: string) => void;
}

interface AshParticle {
  id: number;
  x: number;
  y: number;
  size: number;
  tx: string;
  ty: string;
  duration: number;
  delay: number;
}

interface FlyingChar {
  char: string;
  tx: string;
  ty: string;
  rot: string;
  delay: number;
}

export const DisintegratingMessage: React.FC<DisintegratingMessageProps> = ({
  message,
  isMe,
  onDisintegrate,
  onOpenImage,
}) => {
  const [remaining, setRemaining] = useState<number>(() =>
    getRemainingSeconds(message.expiresAt)
  );
  const [isDisintegrating, setIsDisintegrating] = useState(false);
  const [hasDisappeared, setHasDisappeared] = useState(false);
  const timerRef = useRef<any>(null);

  // Pre-calculate trajectories for each character so they fly away in scattered directions
  const flyingLetters = useMemo<FlyingChar[]>(() => {
    if (!message.text) return [];
    return message.text.split('').map((char, index) => {
      // Scatter in varied upward directions
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.6; // mostly upwards (-60 to -120 deg)
      const distance = 50 + Math.random() * 120;
      const tx = `${Math.cos(angle) * distance}px`;
      const ty = `${Math.sin(angle) * distance}px`;
      const rot = `${(Math.random() - 0.5) * 140}deg`;
      const delay = Math.min(0.25, (index % 15) * 0.015 + Math.random() * 0.05);

      return {
        char,
        tx,
        ty,
        rot,
        delay,
      };
    });
  }, [message.text]);

  // Pixel embers/sparks rising like smoke/burning secret paper
  const embers = useMemo<AshParticle[]>(() => {
    if (!isDisintegrating) return [];
    const count = 20;
    const result: AshParticle[] = [];
    for (let i = 0; i < count; i++) {
      const tx = `${(Math.random() - 0.5) * 100}px`;
      const ty = `${-(40 + Math.random() * 90)}px`;
      result.push({
        id: i,
        x: 10 + Math.random() * 80,
        y: 10 + Math.random() * 80,
        size: 2 + Math.floor(Math.random() * 4),
        tx,
        ty,
        duration: 0.6 + Math.random() * 0.35,
        delay: Math.random() * 0.15,
      });
    }
    return result;
  }, [isDisintegrating]);

  useEffect(() => {
    const checkExpiry = () => {
      const rem = getRemainingSeconds(message.expiresAt);
      setRemaining(rem);

      if (rem <= 0 && !isDisintegrating) {
        setIsDisintegrating(true);
        if (timerRef.current) clearInterval(timerRef.current);

        // Allow 900ms for letters to fly away and fade out completely
        setTimeout(() => {
          setHasDisappeared(true);
          onDisintegrate(message.id, message.storagePath);
        }, 900);
      }
    };

    checkExpiry();
    timerRef.current = setInterval(checkExpiry, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [message.expiresAt, message.id, message.storagePath, isDisintegrating, onDisintegrate]);

  if (hasDisappeared) {
    return null;
  }

  const isUrgent = remaining <= 10 && remaining > 0;

  return (
    <div
      className={`relative my-2.5 font-terminal transition-all ${
        isMe ? 'ml-auto' : 'mr-auto'
      } max-w-[95%] sm:max-w-[85%]`}
    >
      {/* DOS Green Box */}
      <div
        className={`border-2 border-[#1b5e20] bg-[#051407] p-2.5 relative text-xs sm:text-sm text-[#39ff14] shadow-md transition-all ${
          isMe ? 'border-dashed' : ''
        } ${isDisintegrating ? 'border-red-600/70 bg-[#080303]' : ''}`}
        style={{
          boxShadow: isDisintegrating
            ? '0 0 15px rgba(255, 0, 0, 0.4)'
            : '2px 2px 0px #010501, inset 0 0 8px rgba(57, 255, 20, 0.08)',
        }}
      >
        {/* Header line */}
        <div className="flex items-center justify-between pb-1 mb-1.5 border-b border-[#1b5e20] text-[11px] font-mono">
          <div className="flex items-center gap-2 truncate">
            <span className="font-bold text-[#72ff59]">
              {isMe ? '► [ANDA]' : `◄ [${message.senderName}]`}
            </span>
            <span className="text-[10px] opacity-60">
              {message.type === 'image' ? 'BUKTI_FOTO' : 'RAHASIA'}
            </span>
          </div>

          <div
            className={`font-mono text-[11px] flex items-center gap-1 shrink-0 ${
              isUrgent ? 'animate-urgent font-bold' : 'text-[#72ff59] opacity-80'
            }`}
          >
            <span>HAPUS:</span>
            <span className="font-bold">
              {isDisintegrating ? 'MUSNAH...' : formatCountdown(remaining)}
            </span>
          </div>
        </div>

        {/* Message Content: Flying Letters Effect */}
        {message.type === 'text' ? (
          <div className="whitespace-pre-wrap leading-relaxed break-words font-dos text-base sm:text-lg select-text min-h-[1.5rem]">
            {isDisintegrating ? (
              // When disintegrating: every character literally flies away into the air!
              <span className="inline-block relative overflow-visible">
                {flyingLetters.map((item, idx) => (
                  <span
                    key={idx}
                    className="animate-letter-fly text-[#72ff59]"
                    style={
                      {
                        '--fly-x': item.tx,
                        '--fly-y': item.ty,
                        '--fly-rot': item.rot,
                        animationDelay: `${item.delay}s`,
                      } as React.CSSProperties
                    }
                  >
                    {item.char === ' ' ? '\u00A0' : item.char}
                  </span>
                ))}
              </span>
            ) : (
              message.text
            )}
          </div>
        ) : (
          <div className={`space-y-1 ${isDisintegrating ? 'opacity-30 blur-xs transition-all duration-700' : ''}`}>
            <div
              onClick={() => message.imageUrl && onOpenImage?.(message.imageUrl)}
              className="cursor-pointer border border-dashed border-[#1b5e20] p-1 bg-black/50 hover:bg-black/80 transition-colors"
            >
              <div className="text-[10px] text-center mb-1 font-mono text-[#72ff59]">
                [FOTO BUKTI TERLAMPIR - KLIK UNTUK MELIHAT]
              </div>
              <img
                src={message.imageUrl}
                alt="Bukti rahasia"
                className="w-full max-h-60 object-contain border border-[#1b5e20]"
                style={{ imageRendering: 'pixelated' }}
              />
            </div>
          </div>
        )}

        {/* Ash / ember sparks drifting upward */}
        {isDisintegrating && (
          <div className="absolute inset-0 pointer-events-none overflow-visible">
            {embers.map((p) => (
              <span
                key={p.id}
                className="absolute bg-[#39ff14] animate-ash pointer-events-none"
                style={
                  {
                    left: `${p.x}%`,
                    top: `${p.y}%`,
                    width: `${p.size}px`,
                    height: `${p.size}px`,
                    '--ash-x': p.tx,
                    '--ash-y': p.ty,
                    animationDuration: `${p.duration}s`,
                    animationDelay: `${p.delay}s`,
                  } as React.CSSProperties
                }
              />
            ))}
          </div>
        )}
      </div>

      {isDisintegrating && (
        <div className="text-[10px] text-red-400 font-mono tracking-widest mt-1 animate-pulse">
          *** RAHASIA BERTERBANGAN & MUSNAH TANPA JEJAK ***
        </div>
      )}
    </div>
  );
};
