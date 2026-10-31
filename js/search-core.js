// ตรรกะค้นหาด่วน (ล้วน ทดสอบได้): จัดอันดับรายการตามคำที่พิมพ์
export const norm = (s) => String(s ?? '').normalize('NFC').toLowerCase().replace(/[\s​]+/g, '');

// items: [{ label, hay?, ... }] → ที่ตรงกับ q เรียงตามความใกล้เคียง (ขึ้นต้นตรง > มีในชื่อ > มีในคำค้นเสริม)
export function rank(items, q, limit = 8) {
  const n = norm(q);
  if (!n) return items.slice(0, limit);
  const out = [];
  for (const it of items) {
    const l = norm(it.label); const h = norm(it.hay);
    const score = l.startsWith(n) ? 0 : l.includes(n) ? 1 : h.includes(n) ? 2 : null;
    if (score !== null) out.push({ it, score, len: l.length });
  }
  return out.sort((a, b) => a.score - b.score || a.len - b.len).slice(0, limit).map((x) => x.it);
}
