import React, { useEffect, useRef, useState } from 'react';

const ALIASES = [
  'CEPU', 'BOCOR', 'SPILLER', 'KUPING', 'TUKANG_GOSIP',
  'SI_PENDIAM', 'ANON', 'BISIK', 'INTEL', 'SAKSI'
];

const DEMO_MSGS = [
  '(contoh) katanya ada reorg bulan depan, tim kita aman gak ya',
  '(contoh) yang rapat sampai jam 9 malam itu sebenarnya bisa jadi email',
  '(contoh) ada yang tau kenapa lift lantai 3 rusak lagi',
  '(contoh) jujur aku capek jadi yang selalu disuruh ambil notulen',
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
  const [showBlackHole, setShowBlackHole] = useState<boolean>(false);
  const [showGhostFog, setShowGhostFog] = useState<boolean>(false);

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
    blackholeUses: number;
    ghostUsed: boolean;
    msgs: Map<string, { m: MsgItem; el: HTMLDivElement; cd: HTMLSpanElement; dead: boolean }>;
    peers: Map<string, number>;
    timers: any[];
    tickInterval: any;
    lastSendTime: number;
    bc: BroadcastChannel | null;
    ttl: number;
  }>({
    me: Math.random().toString(36).slice(2, 10),
    room: null,
    alias: '',
    isHost: false,
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
      addSysMsg('*** RUANG DISAPU BERSIH: SEMUA PESAN LENYAP KE LUBANG HITAM ***');
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

  const cleanCode = (s: string) => s.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 16);
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
      w.style.setProperty('--fall-dist', '90vh');
    }

    let charIndex = 0;
    for (const c of [...m.text]) {
      const s = document.createElement('span');
      s.className = 'ch' + (isSnake ? ' snake-char' : '');
      s.textContent = c;
      if (isSnake) {
        s.style.setProperty('--snake-d', (charIndex * 0.08).toFixed(2) + 's');
      } else if (isBang) {
        // Efek /bang: huruf jatuh dari atas layar saat di-enter dengan gravitasi & pantulan
        s.style.setProperty('--bang-delay', (charIndex * 0.022).toFixed(3) + 's');
        s.style.setProperty('--bang-x', ((Math.random() - 0.5) * 32).toFixed(1) + 'px');
        s.style.setProperty('--bang-r', ((Math.random() - 0.5) * 22).toFixed(1) + 'deg');
      }
      bub.append(s);
      charIndex++;
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

  const prunePeers = () => {
    const n = Date.now();
    const S = stateRef.current;
    for (const [k, t] of S.peers) {
      if (n - t > 7000) S.peers.delete(k);
    }
    setPeerCount(S.peers.size + 1);
  };

  const sendBroadcast = (o: any) => {
    const S = stateRef.current;
    if (S.bc && S.room) {
      S.bc.postMessage(Object.assign({ from: S.me, room: S.room, alias: S.alias }, o));
    }
  };

  const demoBots = (currentRoom: string) => {
    const S = stateRef.current;
    [1500, 7000, 15000].forEach((ms, i) => {
      const timer = setTimeout(() => {
        if (S.room !== currentRoom) return;
        const n = Date.now();
        addMsgToDOM(
          {
            id: 'd' + n + i,
            alias: 'BOT_' + (10 + i),
            text: DEMO_MSGS[(Math.random() * DEMO_MSGS.length) | 0],
            c: n,
            e: n + S.ttl,
            effect: 'normal',
          },
          false
        );
      }, ms);
      S.timers.push(timer);
    });
  };

  const joinRoom = (code: string, creator = false) => {
    const cleaned = cleanCode(code);
    if (!cleaned) {
      showToastMsg('Isi kode ruang dulu');
      return;
    }
    leaveRoom(true);

    const generatedAlias = pick(ALIASES) + '_' + (100 + Math.floor(Math.random() * 900));
    const S = stateRef.current;
    S.room = cleaned;
    S.alias = generatedAlias;
    S.isHost = creator;
    S.blackholeUses = 0;
    S.ghostUsed = false;

    setRoom(cleaned.toUpperCase());
    setAlias(generatedAlias);
    setIsHost(creator);
    setScreen('chat');

    setTimeout(() => {
      if (listRef.current) listRef.current.replaceChildren();
      addSysMsg(
        '*** Kamu masuk ruang ' +
          cleaned.toUpperCase() +
          (creator ? ' [PEMBUAT RUANG / HOST]' : '') +
          '. Tidak ada riwayat: kamu hanya melihat pesan yang masuk sekarang. ***'
      );
      addSysMsg('! Perintah: /shake <pesan>, /snake <pesan>, /bang <pesan>, /enigma <pesan>, /ghost <pesan>' + (creator ? ', /blackhole' : ''));
      if (inputRef.current) inputRef.current.focus();

      sendBroadcast({ t: 'hi' });
      const hb = setInterval(() => {
        sendBroadcast({ t: 'hb' });
        prunePeers();
      }, 2500);
      S.timers.push(hb);
      S.tickInterval = setInterval(tick, 200);

      if (!S.bc) {
        addSysMsg('Browser ini tidak mendukung sinkron antar-tab.');
      } else {
        addSysMsg('Demo: ruang ini hanya terhubung dengan tab lain di browser yang sama.');
      }
      demoBots(cleaned);
    }, 50);
  };

  const leaveRoom = (silent = false) => {
    const S = stateRef.current;
    if (S.room) sendBroadcast({ t: 'bye' });
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
    S.blackholeUses = 0;
    S.ghostUsed = false;
    S.msgs.clear();
    S.peers.clear();
    setShowBlackHole(false);
    setShowGhostFog(false);
    if (listRef.current) listRef.current.replaceChildren();
    if (!silent) setScreen('home');
  };

  useEffect(() => {
    if ('BroadcastChannel' in window) {
      const bc = new BroadcastChannel('cpu-rooms-v1');
      stateRef.current.bc = bc;

      bc.onmessage = (ev) => {
        const d = ev.data;
        const S = stateRef.current;
        if (!d || d.from === S.me || !S.room || d.room !== S.room) return;
        if (d.t === 'hi') {
          S.peers.set(d.from, Date.now());
          sendBroadcast({ t: 'hb' });
          prunePeers();
        } else if (d.t === 'hb') {
          S.peers.set(d.from, Date.now());
          prunePeers();
        } else if (d.t === 'bye') {
          S.peers.delete(d.from);
          prunePeers();
        } else if (d.t === 'shake') {
          // Monitor bergetar 1 detik jika pesan /shake diterima
          triggerShake();
          showToastMsg('⚡ Seseorang mengguncang layar! (/SHAKE)');
        } else if (d.t === 'blackhole') {
          // Semua pesan tersedot ke lubang hitam
          triggerBlackHoleSuction();
          showToastMsg('🕳️ LUBANG HITAM AKTIF: Semua pesan tersedot!');
        } else if (d.t === 'ghost') {
          // Kabut hijau halus menyelimuti monitor
          triggerGhostFog();
          showToastMsg('🌫️ Kabut halus menyelimuti monitor (/GHOST)');
        } else if (d.t === 'msg' && d.m && typeof d.m.text === 'string') {
          S.peers.set(d.from, Date.now());
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
      if (stateRef.current.room) sendBroadcast({ t: 'bye' });
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

      // Kirim pesan yang menyertai /ghost
      const m: MsgItem = {
        id: S.me + now + Math.random().toString(36).slice(2, 5),
        alias: S.alias,
        text: msgAfterGhost.slice(0, 280),
        c: now,
        e: now + S.ttl,
        effect: 'normal',
      };
      addMsgToDOM(m, true);
      sendBroadcast({ t: 'msg', m });
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

      const m: MsgItem = {
        id: S.me + now + Math.random().toString(36).slice(2, 5),
        alias: S.alias,
        text: msgAfterShake.slice(0, 280),
        c: now,
        e: now + S.ttl,
        effect: 'normal',
      };
      addMsgToDOM(m, true);
      sendBroadcast({ t: 'msg', m });
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
      addMsgToDOM(m, true);
      sendBroadcast({ t: 'msg', m });
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
      addMsgToDOM(m, true);
      sendBroadcast({ t: 'msg', m });
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
      addMsgToDOM(m, true);
      sendBroadcast({ t: 'msg', m });
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
    addMsgToDOM(m, true);
    sendBroadcast({ t: 'msg', m });
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

  const handleCreateRandomRoom = () => {
    const c = Math.random().toString(36).slice(2, 8);
    setCodeInputValue(c);
    // Masuk sebagai pembuat ruangan (Host)
    joinRoom(c, true);
  };

  return (
    <div id="crt" className={isShaking ? 'shaking' : ''}>
      <div id="toast" className={showToast ? 'on' : ''}>
        {toastText}
      </div>

      {/* Ghost Green Fog Overlay */}
      {showGhostFog && <div className="ghost-fog" />}

      {/* Screen: Home (Clean, no text explanation, CPU logo) */}
      <section className={`screen ${screen === 'home' ? 'on' : ''}`} id="home">
        <pre
          className="logo"
          id="logo"
          onClick={handleTogglePhosphor}
          title="klik: ganti warna fosfor"
        >
{` ██████╗ ██████╗ ██╗   ██╗
██╔════╝ ██╔══██╗██║   ██║
██║      ██████╔╝██║   ██║
██║      ██╔═══╝ ██║   ██║
╚██████╗ ██║     ╚██████╔╝
 ╚═════╝ ╚═╝      ╚═════╝ `}
        </pre>

        <div className="row">
          <div className="field">
            KODE RUANG:{' '}
            <input
              id="code"
              maxLength={16}
              placeholder="kantor"
              spellCheck={false}
              autoCapitalize="off"
              autoComplete="off"
              value={codeInputValue}
              onChange={(e) => setCodeInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') joinRoom(codeInputValue, false);
              }}
            />
          </div>
          <button className="btn big" id="join" onClick={() => joinRoom(codeInputValue, false)}>
            [ MASUK ]
          </button>
          <button className="btn" id="rnd" onClick={handleCreateRandomRoom}>
            [ BUAT RUANG BARU ]
          </button>
        </div>

        <div className="foot dim">
          C:\CPU&gt; <span className="cur"></span>
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
            ! Tulis tanpa menyebut nama &amp; data pribadi orang. Pesan musnah 30 detik setelah dikirim.
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
