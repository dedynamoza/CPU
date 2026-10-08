const CODENAMES = [
  'CEPU', 'ANON', 'ORANG-DALAM', 'SPY', 'SAKSI-BISU', 'WHISTLEBLOWER',
  'KARYAWAN-X', 'WARGA-RUMPI', 'INCOGNITO', 'SHADOW', 'GHOST', 'SECRET-AGENT',
  'INFOMAN', 'DETEKTIF', 'AGAN-X', 'ORANG-BIASA', 'SAKSI-MATA', 'SPIL-LORD'
];

export function generateAnonymousName(): string {
  const code = CODENAMES[Math.floor(Math.random() * CODENAMES.length)];
  const num = Math.floor(10 + Math.random() * 89);
  return `${code}-${num}`;
}

export function getRandomAvatarColor(): string {
  return '#39ff14'; // Pure DOS Phosphor Green
}
