/**
 * CPU CHAT - BAD WORD SCRAMBLER & SENSOR
 * Mengacak kata-kata kotor secara otomatis ketika dikirim/diterima.
 * Contoh: "kontol" -> "lkonto", "anjing" -> "ganjin", dsb.
 */

// Daftar kata kotor dari instruksi pengguna (tanpa duplikat, huruf kecil)
export const BAD_WORDS_RAW = [
  'anjim',
  'anjing',
  'anjrit',
  'anjrot',
  'ass',
  'asshole',
  'asu',
  'babami',
  'babi',
  'bacok',
  'bagudung',
  'bajingan',
  'banci',
  'bangke',
  'bangor',
  'bangsat',
  'bego',
  'bejad',
  'bejat',
  'bencong',
  'bitch',
  'blowjob',
  'bodat',
  'borjong',
  'brengsek',
  'bugil',
  'bujanginam',
  'bundir',
  'bungul',
  'bunuh',
  'burik',
  'burit',
  'cawek',
  'cemen',
  'cipok',
  'cium',
  'colai',
  'coli',
  'colmek',
  'cukimai',
  'cukimay',
  'culun',
  'cumbu',
  'damn',
  'dancuk',
  'dewasa',
  'dick',
  'dildo',
  'encuk',
  'fuck',
  'fucking',
  'gei',
  'gembel',
  'gey',
  'gigolo',
  'gila',
  'goblog',
  'goblok',
  'haram',
  'heang',
  'hencet',
  'henceut',
  'hentai',
  'idiot',
  'itil',
  'jablai',
  'jablay',
  'jancok',
  'jancuk',
  'jangkik',
  'jembut',
  'jilat',
  'jingan',
  'kacuk',
  'kampang',
  'kampret',
  'kanciang',
  'kelentit',
  'keparat',
  'kimak',
  'kirik',
  'klentit',
  'klitoris',
  'kolop',
  'konthol',
  'kontol',
  'koplok',
  'kunyuk',
  'kutang',
  'kutis',
  'kwontol',
  'lonte',
  'maho',
  'masturbasi',
  'matane',
  'mati',
  'memek',
  'mesum',
  'modar',
  'modyar',
  'mokad',
  'najis',
  'nazi',
  'ndhasmu',
  'nenen',
  'ngentot',
  'ngolom',
  'ngulum',
  'nigga',
  'nigger',
  'onani',
  'orgasme',
  'paksa',
  'pantat',
  'pantek',
  'pecun',
  'peli',
  'penis',
  'pentil',
  'pepek',
  'perek',
  'perkosa',
  'piatu',
  'pilat',
  'porno',
  'pukimak',
  'pussy',
  'qontol',
  'sarap',
  'selangkang',
  'sempak',
  'senggama',
  'setan',
  'setubuh',
  'silet',
  'silit',
  'sinting',
  'sodomi',
  'stres',
  'taek',
  'tai',
  'taptei',
  'teho',
  'telanjang',
  'telaso',
  'tete',
  'tetek',
  'tewas',
  'titit',
  'togel',
  'toket',
  'tolol',
  'totong',
  'tusbol',
  'urin',
  'vagina',
  'xxx',
  'yateam',
  'yatim',
];

// Urutkan dari kata terpanjang ke terpendek agar kata majemuk dicocokkan lebih dulu
export const SORTED_BAD_WORDS = [...new Set(BAD_WORDS_RAW)].sort((a, b) => b.length - a.length);

/**
 * Logika scramble untuk 1 kata kotor:
 * Memindahkan huruf terakhir ke posisi paling depan (circular right shift 1),
 * contoh: "kontol" -> "lkonto", "anjing" -> "ganjin", "babi" -> "ibab".
 * Tetap mempertahankan format casing (HURUF BESAR, Kapital, atau kecil).
 */
export function scrambleSingleBadWord(word: string): string {
  if (!word || word.length <= 1) return word;

  const isAllUpper = word === word.toUpperCase() && word !== word.toLowerCase();
  const isCapitalized =
    !isAllUpper &&
    word[0] === word[0].toUpperCase() &&
    word.slice(1) === word.slice(1).toLowerCase();

  const lower = word.toLowerCase();

  // Geser huruf terakhir ke paling depan: "kontol" -> "l" + "konto" = "lkonto"
  let scrambled = lower.slice(-1) + lower.slice(0, -1);

  // Jika setelah digeser ternyata masih sama persis (misal "xxx" atau huruf kembar)
  if (scrambled === lower && lower.length > 1) {
    // Balik urutan atau ubah karakter
    scrambled = lower.split('').reverse().join('');
  }
  if (scrambled === lower && lower.length > 1) {
    // Jika masih sama (misal "xxx"), selipkan tanda bintang/acak
    scrambled = lower[0] + '*' + lower.slice(2);
  }

  // Terapkan kembali bentuk kapitalisasi aslinya
  if (isAllUpper) {
    return scrambled.toUpperCase();
  }
  if (isCapitalized) {
    return scrambled.charAt(0).toUpperCase() + scrambled.slice(1).toLowerCase();
  }
  return scrambled;
}

// Buat regex pattern yang menangani boundary, imbuhan kata bahasa Indonesia (nya, ku, mu, lah, an),
// serta huruf akhir yang berulang (misal "kontollll", "anjinggg")
const buildBadWordPattern = (): RegExp => {
  const parts = SORTED_BAD_WORDS.map((w) => {
    const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const lastChar = escaped.slice(-1);
    // Mengizinkan perulangan huruf terakhir (misal "anjinggggg") + sufiks umum Indonesia
    return `(?:${escaped}${lastChar}*)`;
  });
  return new RegExp(`\\b(${parts.join('|')})(nya|ku|mu|lah|an)?\\b`, 'gi');
};

const BAD_WORDS_REGEX = buildBadWordPattern();

/**
 * Sensor kalimat / teks dengan mengacak setiap kata kotor yang terdeteksi
 * menjadi anagram teracak (seperti "kontol" -> "lkonto").
 */
export function censorAndScrambleText(text: string): string {
  if (!text || typeof text !== 'string') return text;

  // Gantikan setiap kata kotor yang cocok dengan versi teracaknya
  return text.replace(BAD_WORDS_REGEX, (_match, root, suffix) => {
    const scrambledRoot = scrambleSingleBadWord(root);
    return scrambledRoot + (suffix || '');
  });
}

