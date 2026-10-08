export type VibeType = 'fun' | 'talk' | 'gaming' | 'music' | 'random';

export interface VibeOption {
  id: VibeType;
  label: string;
  emoji: string;
  description: string;
}

export interface UserProfile {
  uid: string;
  displayName: string;
  avatarColor: string;
  vibe: VibeType;
  status: 'idle' | 'searching' | 'chatting';
  createdAt: any;
  lastActiveAt: any;
}

export interface MatchQueueEntry {
  uid: string;
  displayName: string;
  avatarColor: string;
  vibe: VibeType;
  status: 'waiting' | 'matched' | 'cancelled';
  matchedSessionId?: string;
  createdAt: any;
  expiresAt?: any;
}

export interface ChatSession {
  sessionId: string;
  userA: string;
  userB: string;
  userAName: string;
  userBName: string;
  vibe: VibeType;
  status: 'active' | 'ended';
  createdAt: any;
  expiresAt: any;
  endedBy?: string;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  type: 'text' | 'image';
  text?: string;
  imageUrl?: string;
  storagePath?: string;
  createdAt: any;
  expiresAt: any;
}

export type ReportReason =
  | 'harassment'
  | 'sexual_content'
  | 'hate_speech'
  | 'spam'
  | 'scam'
  | 'violence'
  | 'other';

export type DosTheme = 'vga' | 'green' | 'amber' | 'blue';

