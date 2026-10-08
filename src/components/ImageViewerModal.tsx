import React from 'react';
import { DosTheme } from '../types';
import { DOS_THEMES } from '../utils/dosThemes';

interface ImageViewerModalProps {
  imageUrl: string | null;
  theme: DosTheme;
  onClose: () => void;
}

export const ImageViewerModal: React.FC<ImageViewerModalProps> = ({
  imageUrl,
  theme,
  onClose,
}) => {
  if (!imageUrl) return null;
  const themeConfig = DOS_THEMES[theme] || DOS_THEMES.vga;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 p-4 font-mono select-none"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`max-w-2xl w-full border-4 border-double ${themeConfig.borderClass} ${themeConfig.panelClass} ${themeConfig.textClass} p-3 shadow-2xl relative`}
      >
        <div className={`p-1.5 flex items-center justify-between font-dos text-lg ${themeConfig.headerClass} mb-3`}>
          <span>C:\SAPA\VIEWER.EXE - BITMAP BUFFER 640x480</span>
          <button
            onClick={onClose}
            className="px-2 border border-current hover:bg-black/40 font-mono text-xs cursor-pointer"
          >
            [ X ]
          </button>
        </div>

        <div className="border border-current p-2 bg-black flex justify-center items-center max-h-[70vh] overflow-hidden">
          <img
            src={imageUrl}
            alt="DOS graphic render"
            className="max-h-[65vh] object-contain border border-current"
            style={{ imageRendering: 'pixelated' }}
          />
        </div>

        <div className="mt-2 text-center text-xs opacity-80 flex items-center justify-between font-mono">
          <span>STATUS: EPHEMERAL BUFFER (DISINTEGRATES IN 5 MIN)</span>
          <button
            onClick={onClose}
            className="px-3 py-1 border border-current hover:bg-white/10"
          >
            [ ESC: CLOSE ]
          </button>
        </div>
      </div>
    </div>
  );
};
