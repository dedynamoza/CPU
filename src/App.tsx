import React, { useEffect, useRef, useState } from 'react';
import {
  checkCpuRoomExists,
  createCpuRoom,
  getRoomCreator,
  updateCpuRoomActivity,
  sendCpuMessage,
  sendCpuSignal,
  sendPeerHeartbeat,
  removePeerPresence,
  deleteExpiredMessage,
  cleanOldMessagesInRoom,
  subscribeToCpuRoom,
  sanitizeRoomCode,
} from './services/cpuRoomService';

const ALIASES = [
  'GHIBAH', 'BOCOR', 'SPILLER', 'KUPING', 'TUKANG_GOSIP',
  'SI_PENDIAM', 'ANON', 'BISIK', 'INTEL', 'SAKSI'
];

const BANG_DIRECTIONS = [
  { x: '0vw', y: '-95vh', r: '-12deg' }, // Dari atas
  { x: '0vw', y: '95vh', r: '12deg' }, // Dari bawah
  { x: '-95vw', y: '0vh', r: '-20deg' }, // Dari kiri
  { x: '95vw', y: '0vh', r: '20deg' }, // Dari kanan
  { x: '-90vw', y: '-85vh', r: '-28deg' }, // Dari serong kiri atas
  { x: '90vw', y: '-85vh', r: '28deg' }, // Dari serong kanan atas
  { x: '-90vw', y: '85vh', r: '25deg' }, // Dari serong kiri bawah
  { x: '90vw', y: '85vh', r: '-25deg' }, // Dari serong kanan bawah
  { x: '-50vw', y: '-95vh', r: '-15deg' }, // Serong atas kiri
  { x: '50vw', y: '95vh', r: '15deg' }, // Serong bawah kanan
  { x: '95vw', y: '-40vh', r: '18deg' }, // Dari kanan atas
  { x: '-95vw', y: '40vh', r: '-18deg' }, // Dari kiri bawah
];

interface MsgItem {
  id: string;
  alias: string;
  text: string;
  c: number;
  e: number;
  effect?: 'normal' | 'snake' | 'bang';
}

/**
 * Mengacak posisi susunan kata dalam kalimat saja (bukan huruf).
 * Huruf di dalam setiap kata tetap 100% utuh tidak diubah sama sekali.
 * Contoh: "saya mau makan mie ayam yang murah" -> "makan murah ayam yang saya mau mie"
 */
function enigmaScramble(text: string): string {
  let cleaned = text.trim();
  let hasQuotes = false;
  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"') && cleaned.length > 1) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'") && cleaned.length > 1)
  ) {
    cleaned = cleaned.slice(1, -1).trim();
    hasQuotes = true;
  }

  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length <= 1) return text;

  // Acak posisi urutan kata saja (hanya urutan kata, huruf tidak disentuh sama sekali)
  const shuffled = [...words];
  let tries = 0;
  do {
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    tries++;
  } while (shuffled.join(' ') === words.join(' ') && tries < 20);

  // Pastikan posisi urutan kata berubah dari kalimat asli jika jumlah kata >= 2
  if (shuffled.join(' ') === words.join(' ')) {
    const first = shuffled.shift()!;
    shuffled.push(first);
  }

  const result = shuffled.join(' ');
  return hasQuotes ? `"${result}"` : result;
}

export default function App() {
  const [screen, setScreen] = useState<'home' | 'chat'>('home');
  const [room, setRoom] = useState<string>('');
  const [alias, setAlias] = useState<string>('');
  const [isHost, setIsHost] = useState<boolean>(false);
  const [peerCount, setPeerCount] = useState<number>(1);
  const [codeInputValue, setCodeInputValue] = useState<string>('');
  const [inputMsg, setInputMsg] = useState<string>('');
  const [toastText, setToastText] = useState<string>('');
  const [showToast, setShowToast] = useState<boolean>(false);
  const [isShaking, setIsShaking] = useState<boolean>(false);
  const [isGlitching, setIsGlitching] = useState<boolean>(false);
  const [showBlackHole, setShowBlackHole] = useState<boolean>(false);
  const [showGhostFog, setShowGhostFog] = useState<boolean>(false);
  const [homeError, setHomeError] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const toastTimerRef = useRef<any>(null);
  const shakeTimerRef = useRef<any>(null);
  const ghostFogTimerRef = useRef<any>(null);

  // Core state refs for timer/broadcast callbacks
  const stateRef = useRef<{
    me: string;
    room: string | null;
    alias: string;
    isHost: boolean;
    joinedAt: number;
    blackholeUses: number;
    ghostUsed: boolean;
    msgs: Map<string, { m: MsgItem; el: HTMLDivElement; cd: HTMLSpanElement; dead: boolean }>;
    peers: Map<string, { lastSeen: number; alias: string; joinedAt: number; isHost: boolean }>;
    timers: any[];
    tickInterval: any;
    lastSendTime: number;
    bc: BroadcastChannel | null;
    ttl: number;
    unsubFs: (() => void) | null;
    fsHbInterval: any;
  }>({
    me: Math.random().toString(36).slice(2, 10),
    room: null,
    alias: '',
    isHost: false,
    joinedAt: 0,
    blackholeUses: 0,
    ghostUsed: false,
    msgs: new Map(),
    peers: new Map(),
    timers: [],
    tickInterval: null,
    lastSendTime: 0,
    bc: null,
    // Pesan musnah tepat dalam 30 detik (atau 10s jika #fast)
    ttl: window.location.hash.includes('fast') ? 10000 : 30 * 1000,
    unsubFs: null,
    fsHbInterval: null,
  });

  const triggerShake = () => {
    setIsShaking(true);
    if (shakeTimerRef.current) clearTimeout(shakeTimerRef.current);
    shakeTimerRef.current = setTimeout(() => {
      setIsShaking(false);
    }, 1000);
  };

  const triggerGhostFog = () => {
    setShowGhostFog(true);
    if (ghostFogTimerRef.current) clearTimeout(ghostFogTimerRef.current);
    ghostFogTimerRef.current = setTimeout(() => {
      setShowGhostFog(false);
    }, 5000);
  };

  const triggerBlackHoleSuction = () => {
    setShowBlackHole(true);
    const listEl = listRef.current;
    if (listEl) {
      const rect = listEl.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      // Berikan posisi tarikan gravitasi ke setiap pesan
      const chatItems = listEl.querySelectorAll<HTMLDivElement>('.m, .sys');
      chatItems.forEach((m) => {
        const mRect = m.getBoundingClientRect();
        const mCenterX = mRect.left + mRect.width / 2;
        const mCenterY = mRect.top + mRect.height / 2;
        const dx = centerX - mCenterX;
        const dy = centerY - mCenterY;
        m.style.setProperty('--bh-x', dx + 'px');
        m.style.setProperty('--bh-y', dy + 'px');
        m.classList.add('sucking-hole');
      });
    }

    // Setelah 1.9 detik tersedot, bersihkan layar sepenuhnya
    setTimeout(() => {
      if (listRef.current) listRef.current.replaceChildren();
      stateRef.current.msgs.clear();
      setShowBlackHole(false);
      addSysMsg('*** RUANG DISAPU BERSIH: SEMUA PESAN LENYAP KE NERAKA JAHANAM! ***');
    }, 1900);
  };

  const showToastMsg = (text: string) => {
    setToastText('► ' + text);
    setShowToast(true);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      setShowToast(false);
    }, 2500);
  };

  const cleanCode = (s: string) => sanitizeRoomCode(s);
  const pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
  const fmt = (ms: number) => {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return '[' + Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') + ']';
  };

  const scrollList = () => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  };

  const addSysMsg = (text: string) => {
    if (!listRef.current) return;
    const d = document.createElement('div');
    d.className = 'sys';
    d.textContent = text;
    listRef.current.append(d);
    scrollList();
  };

  const expireMsg = (id: string, o: { m: MsgItem; el: HTMLDivElement; cd: HTMLSpanElement; dead: boolean }) => {
    o.dead = true;
    const chars = o.el.querySelectorAll<HTMLSpanElement>('.ch');
    const n = chars.length || 1;

    // Saat waktu 30 detik habis, semua pesan (normal, /snake, /bang) tertiup angin melayang naik & memudar
    chars.forEach((c, i) => {
      c.style.setProperty('--dx', (60 + Math.random() * 140) + 'px');
      c.style.setProperty('--dy', (-50 - Math.random() * 110) + 'px');
      c.style.setProperty('--r', (Math.random() * 160 - 80) + 'deg');
      c.style.setProperty('--s', (0.4 + Math.random() * 0.5).toFixed(2));
      c.style.setProperty('--d', (1.1 + Math.random() * 0.6).toFixed(2) + 's');
      c.style.setProperty('--w', Math.round((i / n) * 450 + Math.random() * 120) + 'ms');
    });

    o.el.classList.add('dis');
    if (stateRef.current.room) {
      deleteExpiredMessage(stateRef.current.room, id).catch(() => {});
    }
    setTimeout(() => {
      o.el.classList.add('gone');
    }, 1900);
    setTimeout(() => {
      o.el.remove();
      stateRef.current.msgs.delete(id);
    }, 2300);
  };

  const tick = () => {
    const now = Date.now();
    const { msgs } = stateRef.current;
    for (const [id, o] of msgs) {
      if (o.dead) continue;
      const r = o.m.e - now;
      if (r <= 0) {
        expireMsg(id, o);
        continue;
      }
      o.cd.textContent = fmt(r);
      // Peringatan merah berkedip saat sisa waktu <= 10 detik
      o.cd.classList.toggle('low', r <= 10000);
    }
  };

  const addMsgToDOM = (m: MsgItem, mine: boolean) => {
    const S = stateRef.current;
    if (S.msgs.has(m.id)) return;
    const now = Date.now();
    m.e = Math.min(m.e, m.c + S.ttl, now + S.ttl);
    if (m.e <= now) return;

    if (!listRef.current) return;
    const w = document.createElement('div');
    w.className = 'm ' + (mine ? 'me' : 'them') + (m.effect ? ' ' + m.effect : '');

    const who = document.createElement('span');
    who.className = 'who';
    who.textContent = '<' + m.alias + '>';

    const bub = document.createElement('div');
    bub.className = 'bub';

    const isSnake = m.effect === 'snake';
    const isBang = m.effect === 'bang';

    if (isBang) {
      // Efek /bang: kata-kata bermunculan dari berbagai macam arah (atas, bawah, kiri, kanan, sudut-sudut)
      const tokens = m.text.match(/\S+|\s+/g) || [m.text];
      const wordTokens = tokens.filter((t) => !/^\s+$/.test(t));

      if (wordTokens.length > 1) {
        // Banyak kata: setiap kata meluncur masuk dari arah sudut yang berbeda-beda
        let wordIdx = 0;
        tokens.forEach((token) => {
          if (/^\s+$/.test(token)) {
            const sp = document.createElement('span');
            sp.className = 'ch bang-space';
            sp.textContent = token;
            bub.append(sp);
          } else {
            const dir = BANG_DIRECTIONS[wordIdx % BANG_DIRECTIONS.length];
            const wSpan = document.createElement('span');
            wSpan.className = 'bang-word';
            wSpan.style.setProperty('--bang-x', dir.x);
            wSpan.style.setProperty('--bang-y', dir.y);
            wSpan.style.setProperty('--bang-r', dir.r);
            wSpan.style.setProperty('--bang-delay', (wordIdx * 0.05).toFixed(3) + 's');

            for (const ch of [...token]) {
              const s = document.createElement('span');
              s.className = 'ch';
              s.textContent = ch;
              wSpan.append(s);
            }
            bub.append(wSpan);
            wordIdx++;
          }
        });
      } else {
        // Jika 1 kata atau pendek: setiap huruf meluncur dari arah berbeda-beda
        let charIdx = 0;
        for (const c of [...m.text]) {
          const s = document.createElement('span');
          s.className = 'ch bang-char';
          s.textContent = c;
          const dir = BANG_DIRECTIONS[charIdx % BANG_DIRECTIONS.length];
          s.style.setProperty('--bang-x', dir.x);
          s.style.setProperty('--bang-y', dir.y);
          s.style.setProperty('--bang-r', dir.r);
          s.style.setProperty('--bang-delay', (charIdx * 0.04).toFixed(3) + 's');
          bub.append(s);
          charIdx++;
        }
      }
    } else {
      let charIndex = 0;
      for (const c of [...m.text]) {
        const s = document.createElement('span');
        s.className = 'ch' + (isSnake ? ' snake-char' : '');
        s.textContent = c;
        if (isSnake) {
          s.style.setProperty('--snake-d', (charIndex * 0.08).toFixed(2) + 's');
        }
        bub.append(s);
        charIndex++;
      }
    }

    const cd = document.createElement('span');
    cd.className = 'cd';

    w.append(who, bub, cd);

    const l = listRef.current;
    const stick = l.scrollHeight - l.scrollTop - l.clientHeight < 80 || mine;
    l.append(w);
    if (stick) scrollList();

    S.msgs.set(m.id, { m, el: w, cd, dead: false });
  };

  const prunePeers = (hostDropped = false) => {
    const n = Date.now();
    const S = stateRef.current;
    let anyHostDropped = hostDropped;
    for (const [k, v] of S.peers) {
      if (n - v.lastSeen > 8000) {
        if (v.isHost) anyHostDropped = true;
        S.peers.delete(k);
      }
    }
    setPeerCount(S.peers.size + 1);

    // Host succession lokal jika host terputus
    if (anyHostDropped && !S.isHost && S.room) {
      const localPeers = [
        { peerId: S.me, alias: S.alias, joinedAt: S.joinedAt },
        ...Array.from(S.peers.entries()).map(([k, v]) => ({
          peerId: k,
          alias: v.alias,
          joinedAt: v.joinedAt,
        })),
      ];
      localPeers.sort((a, b) => a.joinedAt - b.joinedAt);
      if (localPeers.length > 0 && localPeers[0].peerId === S.me) {
        setIsHost(true);
        S.isHost = true;
        addSysMsg('*** HOST TERPUTUS! Kamu sekarang adalah HOST ruangan ini. ***');
        showToastMsg('👑 Kamu sekarang adalah HOST!');
      }
    }
  };

  const sendBroadcast = (o: any) => {
    const S = stateRef.current;
    if (S.bc && S.room) {
      S.bc.postMessage(Object.assign({ from: S.me, room: S.room, alias: S.alias }, o));
    }
  };

  const joinRoom = (code: string, creator = false) => {
    const cleaned = cleanCode(code);
    if (!cleaned) {
      showToastMsg('Isi kode ruang dulu');
      return;
    }
    leaveRoom(true);

    const generatedAlias = pick(ALIASES) + '_' + (100 + Math.floor(Math.random() * 900));
    const nowJoin = Date.now();
    const S = stateRef.current;
    S.room = cleaned;
    S.alias = generatedAlias;
    S.isHost = creator;
    S.joinedAt = nowJoin;
    S.blackholeUses = 0;
    S.ghostUsed = false;

    setRoom(cleaned);
    setAlias(generatedAlias);
    setIsHost(creator);
    setScreen('chat');

    setTimeout(() => {
      if (listRef.current) listRef.current.replaceChildren();
      addSysMsg(
        '*** Kamu masuk ruang ' +
          cleaned +
          (creator ? ' [PEMBUAT RUANG / HOST]' : '') +
          '. Tidak ada riwayat: kamu hanya melihat pesan yang masuk sekarang. ***'
      );
      addSysMsg('!' + (creator ? '' : ''));
      if (inputRef.current) inputRef.current.focus();

      sendBroadcast({ t: 'hi', joinedAt: S.joinedAt, isHost: creator });
      const hb = setInterval(() => {
        sendBroadcast({ t: 'hb', joinedAt: S.joinedAt, isHost: stateRef.current.isHost });
        prunePeers();
      }, 2500);
      S.timers.push(hb);
      S.tickInterval = setInterval(tick, 200);

      // --- KONEKSI FIREBASE REALTIME ---
      updateCpuRoomActivity(cleaned).catch(() => {});
      cleanOldMessagesInRoom(cleaned).catch(() => {});

      // Heartbeat presence ke Firebase tiap 3.5 detik dengan joinedAt
      sendPeerHeartbeat(cleaned, S.me, S.alias, S.joinedAt).catch(() => {});
      const fsHb = setInterval(() => {
        if (stateRef.current.room === cleaned) {
          sendPeerHeartbeat(cleaned, S.me, S.alias, stateRef.current.joinedAt).catch(() => {});
        }
      }, 3500);
      S.fsHbInterval = fsHb;

      // Berlangganan real-time Firestore untuk pesan, sinyal, jumlah pengguna, dan suksesi Host
      S.unsubFs = subscribeToCpuRoom(
        cleaned,
        S.me,
        (incomingMsg, isMine) => {
          if (!isMine) {
            addMsgToDOM(
              {
                id: incomingMsg.id,
                alias: incomingMsg.alias,
                text: incomingMsg.text,
                c: incomingMsg.c,
                e: incomingMsg.e,
                effect: incomingMsg.effect,
              },
              false
            );
          }
        },
        (sig) => {
          if (sig.type === 'shake') {
            triggerShake();
            showToastMsg('⚡ Seseorang mengguncang layar! (/SHAKE)');
          } else if (sig.type === 'blackhole') {
            triggerBlackHoleSuction();
            showToastMsg('🕳️ LUBANG HITAM AKTIF: Semua pesan tersedot!');
          } else if (sig.type === 'ghost') {
            triggerGhostFog();
            showToastMsg('🌫️ Kabut halus menyelimuti monitor (/GHOST)');
          }
        },
        (onlineCount) => {
          setPeerCount(onlineCount);
        },
        (isMeHost, _hostPeerId, hostAlias, wasPromoted) => {
          if (wasPromoted) {
            if (isMeHost) {
              setIsHost(true);
              stateRef.current.isHost = true;
              addSysMsg('*** HOST TERPUTUS! Kamu sekarang adalah HOST ruangan ini. (/blackhole & /ghost terbuka!) ***');
              showToastMsg('👑 Kamu sekarang adalah HOST!');
            } else {
              setIsHost(false);
              stateRef.current.isHost = false;
              addSysMsg(`*** HOST TERPUTUS! <${hostAlias}> sekarang adalah HOST ruangan ini. ***`);
              showToastMsg(`👑 <${hostAlias}> sekarang menjadi HOST`);
            }
          } else {
            if (isMeHost !== stateRef.current.isHost) {
              setIsHost(isMeHost);
              stateRef.current.isHost = isMeHost;
            }
          }
        }
      );

      addSysMsg('● Terhubung.');
    }, 50);
  };

  const leaveRoom = (silent = false) => {
    const S = stateRef.current;
    if (S.unsubFs) {
      S.unsubFs();
      S.unsubFs = null;
    }
    if (S.fsHbInterval) {
      clearInterval(S.fsHbInterval);
      S.fsHbInterval = null;
    }
    if (S.room) {
      removePeerPresence(S.room, S.me).catch(() => {});
      sendBroadcast({ t: 'bye', isHost: S.isHost });
    }
    S.timers.forEach((t) => {
      clearInterval(t);
      clearTimeout(t);
    });
    S.timers = [];
    if (S.tickInterval) {
      clearInterval(S.tickInterval);
      S.tickInterval = null;
    }
    S.room = null;
    S.isHost = false;
    S.joinedAt = 0;
    S.blackholeUses = 0;
    S.ghostUsed = false;
    S.msgs.clear();
    S.peers.clear();
    setShowBlackHole(false);
    setShowGhostFog(false);
    setHomeError('');
    setIsLoading(false);
    if (listRef.current) listRef.current.replaceChildren();
    if (!silent) setScreen('home');
  };

  useEffect(() => {
    // Efek glitch layar selama 2 detik setiap 30 menit (300.000 ms)
    const GLITCH_INTERVAL = 5 * 30 * 1000;
    const GLITCH_DURATION = 2000;

    const glitchTimer = setInterval(() => {
      setIsGlitching(true);
      setTimeout(() => {
        setIsGlitching(false);
      }, GLITCH_DURATION);
    }, GLITCH_INTERVAL);

    return () => clearInterval(glitchTimer);
  }, []);

  useEffect(() => {
    if ('BroadcastChannel' in window) {
      const bc = new BroadcastChannel('ghibah-rooms-v1');
      stateRef.current.bc = bc;

      bc.onmessage = (ev) => {
        const d = ev.data;
        const S = stateRef.current;
        if (!d || d.from === S.me || !S.room || d.room !== S.room) return;
        if (d.t === 'hi') {
          S.peers.set(d.from, {
            lastSeen: Date.now(),
            alias: d.alias || 'GHIBAH',
            joinedAt: d.joinedAt || Date.now(),
            isHost: !!d.isHost,
          });
          sendBroadcast({ t: 'hb', joinedAt: S.joinedAt, isHost: S.isHost });
          prunePeers();
        } else if (d.t === 'hb') {
          S.peers.set(d.from, {
            lastSeen: Date.now(),
            alias: d.alias || 'GHIBAH',
            joinedAt: d.joinedAt || Date.now(),
            isHost: !!d.isHost,
          });
          prunePeers();
        } else if (d.t === 'bye') {
          const wasHost = !!d.isHost || (S.peers.get(d.from)?.isHost ?? false);
          S.peers.delete(d.from);
          prunePeers(wasHost);
        } else if (d.t === 'shake') {
          triggerShake();
          showToastMsg('⚡ Seseorang mengguncang layar! (/SHAKE)');
        } else if (d.t === 'blackhole') {
          triggerBlackHoleSuction();
          showToastMsg('🕳️ LUBANG HITAM AKTIF: Semua pesan tersedot!');
        } else if (d.t === 'ghost') {
          triggerGhostFog();
          showToastMsg('🌫️ Kabut halus menyelimuti monitor (/GHOST)');
        } else if (d.t === 'msg' && d.m && typeof d.m.text === 'string') {
          S.peers.set(d.from, {
            lastSeen: Date.now(),
            alias: d.alias || d.m.alias || 'GHIBAH',
            joinedAt: d.joinedAt || Date.now(),
            isHost: !!d.isHost,
          });
          addMsgToDOM(
            {
              id: String(d.m.id),
              alias: String(d.m.alias).slice(0, 20),
              text: d.m.text.slice(0, 280),
              c: +d.m.c,
              e: +d.m.e,
              effect: d.m.effect || 'normal',
            },
            false
          );
        }
      };
    }

    const onVisChange = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener('visibilitychange', onVisChange);

    const onPageHide = () => {
      if (stateRef.current.room) sendBroadcast({ t: 'bye', isHost: stateRef.current.isHost });
    };
    window.addEventListener('pagehide', onPageHide);

    return () => {
      document.removeEventListener('visibilitychange', onVisChange);
      window.removeEventListener('pagehide', onPageHide);
      if (stateRef.current.bc) stateRef.current.bc.close();
    };
  }, []);

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const S = stateRef.current;
    const rawInput = inputMsg.trim();
    const now = Date.now();
    if (!rawInput || !S.room || now - S.lastSendTime < 400) return;
    S.lastSendTime = now;
    setInputMsg('');

    // Helper untuk dispatch pesan ke layar, broadcast lokal, dan Firebase Firestore
    const dispatchMessage = (m: MsgItem) => {
      addMsgToDOM(m, true);
      sendBroadcast({ t: 'msg', m });
      if (S.room) {
        sendCpuMessage(S.room, {
          id: m.id,
          senderId: S.me,
          alias: m.alias,
          text: m.text,
          effect: m.effect || 'normal',
          c: m.c,
          e: m.e,
        }).catch(() => {});
      }
    };

    // 1. CEK COMMAND /blackhole (Hanya pembuat ruangan yang bisa, maks 3x)
    if (rawInput === '/blackhole' || rawInput.startsWith('/blackhole ')) {
      if (!S.isHost) {
        showToastMsg('Akses ditolak: Hanya pembuat ruang yang bisa /blackhole!');
        return;
      }
      if (S.blackholeUses >= 3) {
        showToastMsg('Batas /blackhole tercapai (maksimal 3x per sesi)!');
        return;
      }
      S.blackholeUses++;
      triggerBlackHoleSuction();
      sendBroadcast({ t: 'blackhole' });
      if (S.room) sendCpuSignal(S.room, 'blackhole', S.me).catch(() => {});
      showToastMsg(`🕳️ LUBANG HITAM AKTIF! (Sisa: ${3 - S.blackholeUses}x)`);
      return;
    }

    // 2. CEK COMMAND /ghost <pesan> (Kabut hijau halus, 1x per sesi kecuali host)
    if (/^\/ghost(\s+.*)?$/i.test(rawInput)) {
      const msgAfterGhost = rawInput.replace(/^\/ghost\s*/i, '').trim();
      if (!msgAfterGhost) {
        // Jika tidak diikuti pesan, tidak terjadi apa-apa
        return;
      }
      if (!S.isHost && S.ghostUsed) {
        showToastMsg('Kuota /ghost habis (hanya 1x per sesi)!');
        return;
      }
      if (!S.isHost) {
        S.ghostUsed = true;
      }
      triggerGhostFog();
      sendBroadcast({ t: 'ghost' });
      if (S.room) sendCpuSignal(S.room, 'ghost', S.me).catch(() => {});

      // Kirim pesan yang menyertai /ghost
      const m: MsgItem = {
        id: S.me + now + Math.random().toString(36).slice(2, 5),
        alias: S.alias,
        text: msgAfterGhost.slice(0, 280),
        c: now,
        e: now + S.ttl,
        effect: 'normal',
      };
      dispatchMessage(m);
      return;
    }

    // 3. CEK COMMAND /shake <pesan> (Efek hanya aktif jika DIIKUTI PESAN)
    if (/^\/shake(\s+.*)?$/i.test(rawInput)) {
      const msgAfterShake = rawInput.replace(/^\/shake\s*/i, '').trim();
      if (!msgAfterShake) {
        // Jika tidak diikuti pesan, tidak terjadi apa-apa
        return;
      }
      triggerShake();
      sendBroadcast({ t: 'shake' });
      if (S.room) sendCpuSignal(S.room, 'shake', S.me).catch(() => {});

      const m: MsgItem = {
        id: S.me + now + Math.random().toString(36).slice(2, 5),
        alias: S.alias,
        text: msgAfterShake.slice(0, 280),
        c: now,
        e: now + S.ttl,
        effect: 'normal',
      };
      dispatchMessage(m);
      return;
    }

    // 4. CEK COMMAND /snake <pesan> (Efek hanya aktif jika DIIKUTI PESAN)
    if (/^\/snake(\s+.*)?$/i.test(rawInput)) {
      const msgAfterSnake = rawInput.replace(/^\/snake\s*/i, '').trim();
      if (!msgAfterSnake) {
        // Jika tidak diikuti pesan, tidak terjadi apa-apa
        return;
      }
      const m: MsgItem = {
        id: S.me + now + Math.random().toString(36).slice(2, 5),
        alias: S.alias,
        text: msgAfterSnake.slice(0, 280),
        c: now,
        e: now + S.ttl,
        effect: 'snake',
      };
      dispatchMessage(m);
      return;
    }

    // 5. CEK COMMAND /bang <pesan> (Efek hanya aktif jika DIIKUTI PESAN)
    if (/^\/bang(\s+.*)?$/i.test(rawInput)) {
      const msgAfterBang = rawInput.replace(/^\/bang\s*/i, '').trim();
      if (!msgAfterBang) {
        // Jika tidak diikuti pesan, tidak terjadi apa-apa
        return;
      }
      const m: MsgItem = {
        id: S.me + now + Math.random().toString(36).slice(2, 5),
        alias: S.alias,
        text: msgAfterBang.slice(0, 280),
        c: now,
        e: now + S.ttl,
        effect: 'bang',
      };
      dispatchMessage(m);
      return;
    }

    // 6. CEK COMMAND /enigma <pesan> (Acak posisi kata saja, huruf tetap utuh)
    if (/^\/enigma(\s+.*)?$/i.test(rawInput)) {
      const msgAfterEnigma = rawInput.replace(/^\/enigma\s*/i, '').trim();
      if (!msgAfterEnigma) {
        // Jika tidak diikuti pesan, tidak terjadi apa-apa
        return;
      }
      const scrambled = enigmaScramble(msgAfterEnigma);
      const m: MsgItem = {
        id: S.me + now + Math.random().toString(36).slice(2, 5),
        alias: S.alias,
        text: scrambled.slice(0, 280),
        c: now,
        e: now + S.ttl,
        effect: 'normal',
      };
      dispatchMessage(m);
      return;
    }

    // 7. PESAN REGULER BIASA
    const m: MsgItem = {
      id: S.me + now + Math.random().toString(36).slice(2, 5),
      alias: S.alias,
      text: rawInput.slice(0, 280),
      c: now,
      e: now + S.ttl,
      effect: 'normal',
    };
    dispatchMessage(m);
  };

  const handleCopyRoom = () => {
    const S = stateRef.current;
    if (!S.room) return;
    try {
      navigator.clipboard.writeText(S.room).then(
        () => showToastMsg('Kode disalin: ' + S.room),
        () => showToastMsg('Kode: ' + S.room)
      );
    } catch {
      showToastMsg('Kode: ' + S.room);
    }
  };

  const handleTogglePhosphor = () => {
    const r = document.documentElement;
    r.dataset.ph = r.dataset.ph === 'amber' ? '' : 'amber';
  };

  const handleJoinExistingRoom = async () => {
    const raw = codeInputValue.trim();
    const cleaned = cleanCode(raw);
    if (!cleaned) {
      setHomeError('[!] ERROR: Masukkan kode ruang terlebih dahulu!');
      showToastMsg('Isi kode ruang dulu');
      return;
    }
    setHomeError('');
    setIsLoading(true);

    try {
      const exists = await checkCpuRoomExists(cleaned);
      if (!exists) {
        setHomeError(
          `[!] ERROR: Ruangan "${cleaned}" tidak ditemukan atau belum dibuat! Pastikan kode ruangan persis sama (huruf besar/kecil berpengaruh) atau buat ruangan baru terlebih dahulu.`
        );
        showToastMsg(`Ruang "${cleaned}" tidak ditemukan!`);
        setIsLoading(false);
        return;
      }

      // Ruang ditemukan! Periksa apakah pengguna saat ini adalah pembuat ruangan
      const creatorId = await getRoomCreator(cleaned);
      const isCreator = creatorId === stateRef.current.me;
      setIsLoading(false);
      joinRoom(cleaned, isCreator);
    } catch (err: any) {
      console.error('Join room error:', err);
      setHomeError(`[!] KESALAHAN SERVER: ${err?.message || 'Gagal memeriksa ruangan'}`);
      showToastMsg('Gagal memeriksa status ruangan');
      setIsLoading(false);
    }
  };

  const handleCreateNewRoom = async () => {
    setHomeError('');
    setIsLoading(true);

    try {
      let codeToUse = cleanCode(codeInputValue.trim());
      // Jika kolom input kosong, buat kode acak 6 karakter unik
      if (!codeToUse) {
        codeToUse = Math.random().toString(36).slice(2, 8);
        setCodeInputValue(codeToUse);
      }

      const res = await createCpuRoom(codeToUse, stateRef.current.me);
      if (res.alreadyExists) {
        setHomeError(
          `[!] PERINGATAN: Ruangan "${codeToUse}" sedang aktif digunakan. Klik [ MASUK ] untuk bergabung atau gunakan kode lain.`
        );
        showToastMsg(`Ruang "${codeToUse}" sudah ada!`);
        setIsLoading(false);
        return;
      }

      if (!res.success) {
        setHomeError(`[!] ERROR: ${res.error || 'Gagal membuat ruangan di server.'}`);
        showToastMsg('Gagal membuat ruangan');
        setIsLoading(false);
        return;
      }

      setIsLoading(false);
      // Masuk sebagai Host/Pembuat Ruang (bisa /blackhole 3x & /ghost tanpa batas)
      joinRoom(codeToUse, true);
    } catch (err: any) {
      console.error('Create room error:', err);
      setHomeError(`[!] KESALAHAN: ${err?.message || 'Gagal membuat ruangan'}`);
      showToastMsg('Gagal membuat ruangan');
      setIsLoading(false);
    }
  };

  return (
    <div id="crt" className={`${isShaking ? 'shaking' : ''} ${isGlitching ? 'glitching' : ''}`.trim()}>
      <div id="toast" className={showToast ? 'on' : ''}>
        {toastText}
      </div>

      {/* Screen Glitch Overlay (Setiap 5 Menit selama 2 detik) */}
      {isGlitching && <div className="glitch-bar-overlay" />}

      {/* Ghost Green Fog Overlay */}
      {showGhostFog && <div className="ghost-fog" />}

      {/* Screen: Home (GHIBAH logo & prompt) */}
      <section className={`screen ${screen === 'home' ? 'on' : ''}`} id="home">
        <pre
          className="logo"
          id="logo"
          onClick={handleTogglePhosphor}
          title="klik: ganti warna fosfor"
        >
{` ██████╗ ██╗  ██╗██╗██████╗  █████╗ ██╗  ██╗
██╔════╝ ██║  ██║██║██╔══██╗██╔══██╗██║  ██║
██║  ███╗███████║██║██████╔╝███████║███████║
██║   ██║██╔══██║██║██╔══██╗██╔══██║██╔══██║
╚██████╔╝██║  ██║██║██████╔╝██║  ██║██║  ██║
 ╚═════╝ ╚═╝  ╚═╝╚═╝╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝`}
        </pre>

        <div className="row">
          <div className="field">
            KODE RUANG:{' '}
            <input
              id="code"
              maxLength={16}
              placeholder=""
              spellCheck={false}
              autoCapitalize="off"
              autoComplete="off"
              value={codeInputValue}
              onChange={(e) => {
                setCodeInputValue(e.target.value);
                if (homeError) setHomeError('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleJoinExistingRoom();
              }}
              disabled={isLoading}
            />
          </div>
          <button
            className="btn big"
            id="join"
            onClick={handleJoinExistingRoom}
            disabled={isLoading}
          >
            {isLoading ? '[ MEMERIKSA... ]' : '[ MASUK ]'}
          </button>
          <button
            className="btn"
            id="rnd"
            onClick={handleCreateNewRoom}
            disabled={isLoading}
          >
            [ BUAT RUANG BARU ]
          </button>
        </div>

        {homeError && (
          <div className="msg-error" role="alert">
            {homeError}
          </div>
        )}

        <div className="foot dim">
          C:\GHIBAH&gt; <span className="cur"></span>
        </div>
      </section>

      {/* Screen: Chat (30-second flying text disintegration) */}
      <section className={`screen ${screen === 'chat' ? 'on' : ''}`} id="chat">
        <div className="win" style={{ position: 'relative' }}>
          {/* Black Hole Singularity Portal Visual */}
          {showBlackHole && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                zIndex: 35,
                pointerEvents: 'none',
                overflow: 'hidden',
              }}
            >
              <div className="bh-ring" />
              <div className="bh-core" />
            </div>
          )}

          <div className="title">
            <b>
              RUANG: <span id="rm">{room}</span> | <span id="pn">{peerCount}</span> ONLINE | KAMU:{' '}
              <span id="al">{alias}</span> {isHost && <span style={{ color: '#fff' }}>[HOST]</span>}
            </b>
            <button className="btn" id="cp" onClick={handleCopyRoom} title="Salin kode ruang">
              [SALIN]
            </button>
            <button className="btn" id="out" onClick={() => leaveRoom(false)}>
              [KELUAR]
            </button>
          </div>
          <div className="ban dim">
            ! Tulis tanpa menyebut nama &amp; data pribadi orang. Pesan musnah 30 detik setelah dikirim. Tetap Beretika, Jangan Fitnah Dosa!! Masuk Neraka
          </div>
          <div id="list" ref={listRef} aria-live="polite"></div>
          <form id="f" autoComplete="off" onSubmit={handleFormSubmit}>
            <span>SPILL&gt;</span>
            <input
              id="in"
              ref={inputRef}
              maxLength={280}
              placeholder="Gibahin sesuatu..."
              enterKeyHint="send"
              spellCheck={false}
              value={inputMsg}
              onChange={(e) => setInputMsg(e.target.value)}
            />
            <button className="btn" id="sb" type="submit">
              [KIRIM]
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
