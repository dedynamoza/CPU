import { DosTheme } from '../types';

export interface DosThemeConfig {
  id: DosTheme;
  name: string;
  bgClass: string;
  textClass: string;
  accentClass: string;
  borderClass: string;
  panelClass: string;
  headerClass: string;
  highlightClass: string;
  buttonClass: string;
  dangerClass: string;
  scanlineOpacity: string;
}

export const DOS_THEMES: Record<DosTheme, DosThemeConfig> = {
  vga: {
    id: 'vga',
    name: 'IBM VGA (Mono/Color)',
    bgClass: 'bg-[#0b0c10]',
    textClass: 'text-[#d0d4dc]',
    accentClass: 'text-[#55ffff]',
    borderClass: 'border-[#555b6e]',
    panelClass: 'bg-[#15171e]',
    headerClass: 'bg-[#000088] text-white',
    highlightClass: 'text-[#ffff55]',
    buttonClass: 'bg-[#1e222d] text-[#ffffff] border-[#555b6e] hover:bg-[#2b3040]',
    dangerClass: 'text-[#ff5555]',
    scanlineOpacity: 'opacity-30',
  },
  green: {
    id: 'green',
    name: 'Matrix / Green Phosphor',
    bgClass: 'bg-[#020b04]',
    textClass: 'text-[#39ff14]',
    accentClass: 'text-[#72ff59]',
    borderClass: 'border-[#1b5e20]',
    panelClass: 'bg-[#051808]',
    headerClass: 'bg-[#0d3b13] text-[#39ff14]',
    highlightClass: 'text-[#b8ffaa]',
    buttonClass: 'bg-[#08260e] text-[#39ff14] border-[#1b5e20] hover:bg-[#0e4018]',
    dangerClass: 'text-[#ff4444]',
    scanlineOpacity: 'opacity-40',
  },
  amber: {
    id: 'amber',
    name: 'Amber CRT Phosphor',
    bgClass: 'bg-[#0d0700]',
    textClass: 'text-[#ffb300]',
    accentClass: 'text-[#ffca28]',
    borderClass: 'border-[#663c00]',
    panelClass: 'bg-[#1a0f00]',
    headerClass: 'bg-[#4d2c00] text-[#ffe082]',
    highlightClass: 'text-[#ffe082]',
    buttonClass: 'bg-[#2b1900] text-[#ffb300] border-[#663c00] hover:bg-[#472a00]',
    dangerClass: 'text-[#ff5252]',
    scanlineOpacity: 'opacity-35',
  },
  blue: {
    id: 'blue',
    name: 'Norton Commander Blue',
    bgClass: 'bg-[#000055]',
    textClass: 'text-[#ffffff]',
    accentClass: 'text-[#00ffff]',
    borderClass: 'border-[#00aaaa]',
    panelClass: 'bg-[#000088]',
    headerClass: 'bg-[#00aaaa] text-[#000055] font-bold',
    highlightClass: 'text-[#ffff55]',
    buttonClass: 'bg-[#0000aa] text-[#ffff55] border-[#00aaaa] hover:bg-[#0000cc]',
    dangerClass: 'text-[#ff7777]',
    scanlineOpacity: 'opacity-25',
  },
};
