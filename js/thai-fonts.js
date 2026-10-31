// =====================================================================
//  ฟอนต์ราชการที่ฝังในแอป (fonts/*.woff · สัญญาอนุญาต DIP & SIPA: ใช้และแจกจ่ายได้ฟรี)
//  ใช้กับแบบพิมพ์ ปพ. ทุกหน้า → พิมพ์จากเครื่องไหนก็ได้ตัวอักษรเหมือนกัน ไม่ต้องติดตั้งฟอนต์
// =====================================================================
import { setThaiFace } from './xl-render.js?v=2569.10.31-4';

export const THAI_FONTS = {
  psk: { label: 'TH SarabunPSK', family: 'WL TH SarabunPSK', file: 'sarabun-psk' },
  new: { label: 'TH Sarabun New', family: 'WL TH Sarabun New', file: 'sarabun-new' },
  it9: { label: 'TH SarabunIT๙', family: 'WL TH SarabunIT9', file: 'sarabun-it9' },
};
const KEY = 'pp-print-font';
const BASE = new URL('../fonts/', import.meta.url).href;
const STYLES = [['regular', 400, 'normal'], ['bold', 700, 'normal'], ['italic', 400, 'italic'], ['bolditalic', 700, 'italic']];

export function fontFaceCss() {
  return Object.values(THAI_FONTS).map((f) => STYLES.map(([s, w, st]) =>
    `@font-face{font-family:'${f.family}';src:url('${BASE}${f.file}-${s}.woff') format('woff');font-weight:${w};font-style:${st};font-display:block}`).join('\n')).join('\n');
}

export function getThaiFont() { try { const k = localStorage.getItem(KEY); return THAI_FONTS[k] ? k : 'psk'; } catch { return 'psk'; } }
export function setThaiFont(k) { try { localStorage.setItem(KEY, THAI_FONTS[k] ? k : 'psk'); } catch { /* */ } }

// ใส่ @font-face ในเอกสาร แล้วรอให้ฟอนต์ที่เลือกโหลดครบก่อนวัด/วาด
export async function useThaiFont(k = getThaiFont(), doc = document) {
  const f = THAI_FONTS[k] || THAI_FONTS.psk;
  if (!doc.getElementById('wl-thai-fonts')) {
    const st = doc.createElement('style'); st.id = 'wl-thai-fonts'; st.textContent = fontFaceCss(); doc.head.appendChild(st);
  }
  try {
    await Promise.race([
      Promise.all(STYLES.map(([, w, st]) => doc.fonts.load(`${st} ${w} 16px '${f.family}'`, 'กขค 123'))),
      new Promise((r) => setTimeout(r, 8000)),
    ]);
  } catch { /* ใช้ฟอนต์สำรอง */ }
  setThaiFace(f.family);
  return f;
}

export const fontSelectHtml = (id = 'pp-font', k = getThaiFont()) => `<label class="field">ฟอนต์<select id="${id}">${Object.entries(THAI_FONTS)
  .map(([v, f]) => `<option value="${v}" ${v === k ? 'selected' : ''}>${f.label}</option>`).join('')}</select></label>`;
