// ทดสอบเครื่องคำนวณสูตร / รูปแบบตัวเลข / การแบ่งหน้า: node tests/xl-engine.test.mjs
import assert from 'node:assert/strict';
// โมดูลใน js/ import กันด้วย ?v=VERSION → เทสต์ต้องใช้ URL แบบเดียวกัน ไม่งั้นได้โมดูลคนละชุด (TEXT_FORMAT.fn ไม่ถูกผูก)
import { VERSION } from '../js/brand.js';
const m = (f) => import(`../js/${f}.js?v=${VERSION}`);
const { Workbook } = await m('xl-model');
const { Engine, XErr, ymdToSerial, parseFormula } = await m('xl-formula');
const { formatValue } = await m('xl-numfmt');
const { Renderer } = await m('xl-render');

// ---- สร้างสมุดงานในหน่วยความจำ (แบบที่ Excel บันทึก: สูตรร่วม สูตรอาร์เรย์ ชื่อ ข้อความร่วม) ----
const sheet = (rows, extra = '') => `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${extra.split('|')[0] || ''}<sheetData>${rows}</sheetData>${extra.split('|')[1] || ''}</worksheet>`;
const c = (r, v, t = '') => `<c r="${r}"${t ? ` t="${t}"` : ''}><v>${v}</v></c>`;
const f = (r, fx, attrs = '') => `<c r="${r}"><f${attrs}>${fx.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</f><v>0</v></c>`;
const files = new Map(Object.entries({
  'xl/workbook.xml': `<workbook xmlns:r="r"><sheets><sheet name="ข้อมูล" sheetId="1" r:id="rId1"/><sheet name="สรุป รวม" sheetId="2" r:id="rId2"/></sheets>
    <definedNames><definedName name="No" localSheetId="1">'สรุป รวม'!$B$1</definedName><definedName name="_xlnm.Print_Area" localSheetId="1">'สรุป รวม'!$A$1:$C$40</definedName><definedName name="_xlnm.Print_Titles" localSheetId="1">'สรุป รวม'!$1:$2</definedName></definedNames></workbook>`,
  'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Target="sharedStrings.xml"/></Relationships>',
  'xl/sharedStrings.xml': '<sst><si><t>ชาย</t></si><si><t>หญิง</t></si><si><r><t>ตัว</t></r><r><rPr><b/></rPr><t>หนา</t></r></si><si><t>16/05/2556</t></si></sst>',
  'xl/styles.xml': '<styleSheet><numFmts><numFmt numFmtId="164" formatCode="0.00"/></numFmts><fonts><font><sz val="10"/><name val="Arial"/></font></fonts><fills><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders><border/></borders><cellStyleXfs><xf fontId="0"/></cellStyleXfs><cellXfs><xf fontId="0"/><xf numFmtId="164" fontId="0"/></cellXfs></styleSheet>',
  'xl/worksheets/sheet1.xml': sheet(
    `<row r="1">${c('A1', 1)}${c('B1', 0, 's')}${c('C1', 80)}${c('D1', 3, 's')}</row>
     <row r="2">${c('A2', 2)}${c('B2', 1, 's')}${c('C2', 65)}</row>
     <row r="3">${c('A3', 3)}${c('B3', 0, 's')}${c('C3', 90)}</row>
     <row r="4">${c('A4', 4)}${c('B4', 1, 's')}${c('C4', 65)}</row>
     <row r="5">${f('E1', 'C1*2', ' t="shared" ref="E1:E4" si="0"')}</row>
     <row r="6"><c r="E2"><f t="shared" si="0"/><v>0</v></c><c r="E3"><f t="shared" si="0"/><v>0</v></c><c r="E4"><f t="shared" si="0"/><v>0</v></c></row>`),
  'xl/worksheets/sheet2.xml': sheet(
    `<row r="1">${c('B1', 2)}</row>
     <row r="3">${f('A3', 'VLOOKUP(No,ข้อมูล!$A$1:$C$4,3,FALSE)')}${f('B3', 'SUM(ข้อมูล!E1:E4)')}${f('C3', 'COUNTIF(ข้อมูล!B1:B4,"ช*")')}</row>
     <row r="4">${f('A4', 'IFERROR(INDEX(ข้อมูล!$A$1:$A$4,SMALL(IF(ข้อมูล!$B$1:$B$4="หญิง",ROW(ข้อมูล!$A$1:$A$4)),ROWS($A$4:A4))),"")', ' t="array" ref="A4"')}${f('B4', 'IFERROR(INDEX(ข้อมูล!$A$1:$A$4,SMALL(IF(ข้อมูล!$B$1:$B$4="หญิง",ROW(ข้อมูล!$A$1:$A$4)),ROWS($A$4:A5))),"")', ' t="array" ref="B4"')}</row>
     <row r="5">${f('A5', 'ข้อมูล!C1:C4*2', ' t="array" ref="A5:A8"')}${f('B5', 'ข้อมูล!C1:C4')}${f('C5', 'MODE(ข้อมูล!C1:C4)')}</row>
     <row r="6">${f('B6', 'A5:A8')}${f('C6', 'RANK(ข้อมูล!C2,ข้อมูล!C1:C4)')}</row>
     <row r="9">${f('A9', 'DATEDIF(ข้อมูล!D1,DATE(2569,5,16),"Y")&" ปี "&DATEDIF(ข้อมูล!D1,DATE(2569,5,16),"YM")&" เดือน"')}${f('B9', 'TEXT(1234.5,"#,##0.00")')}${f('C9', 'ROUNDDOWN(2.675*100,0)/100+ROUND(-2.5,0)')}</row>
     <row r="10">${f('A10', 'IF(C10="","ว่าง",C10)')}${f('B10', 'Z99')}${f('C10', 'SUMPRODUCT((ข้อมูล!B1:B4="ชาย")*ข้อมูล!C1:C4)')}</row>
     <row r="11">${f('A11', 'MODE(LARGE(ข้อมูล!C1:C4,ROW(INDIRECT("1:"&amp;COUNT(ข้อมูล!C1:C4)))))'.replace('&amp;', '&'))}${f('B11', '-2^2')}${f('C11', '"a"&amp;TRUE&amp;1.50'.replace(/&amp;/g, '&'))}</row>
     ${Array.from({ length: 28 }, (_, i) => `<row r="${12 + i}" ht="30" customHeight="1">${c(`A${12 + i}`, i)}</row>`).join('')}`,
    '<sheetPr><pageSetUpPr fitToPage="0"/></sheetPr><cols><col min="1" max="3" width="20" customWidth="1"/></cols>|<pageMargins left="0.5" right="0.5" top="0.5" bottom="0.5" header="0" footer="0"/><pageSetup paperSize="9" orientation="portrait" scale="100"/><rowBreaks count="1"><brk id="20" man="1"/></rowBreaks>'),
}));

const wb = new Workbook(files);
const eng = new Engine(wb.engineBook);
const v = (ref) => { const m = /^([A-Z]+)(\d+)$/.exec(ref); return eng.value('สรุป รวม', +m[2], m[1].charCodeAt(0) - 64); };

assert.equal(eng.value('ข้อมูล', 4, 5), 130, 'สูตรร่วม (shared) เลื่อนตำแหน่ง');
assert.equal(v('A3'), 65, 'ชื่อประจำแผ่น No + VLOOKUP แบบตรง');
assert.equal(v('B3'), 600);
assert.equal(v('C3'), 2, 'COUNTIF ตัวแทน *');
assert.equal(v('A4'), 2, 'INDEX/SMALL/IF แบบอาร์เรย์');
assert.equal(v('B4'), 4);
assert.deepEqual([5, 6, 7, 8].map((r) => v(`A${r}`)), [160, 130, 180, 130], 'สูตรอาร์เรย์หลายเซลล์');
assert.ok(v('B5') instanceof XErr, 'implicit intersection นอกแนว → #VALUE!');
assert.equal(v('B6'), 130, 'implicit intersection ตามแถว');
assert.equal(v('C5'), 65, 'MODE');
assert.equal(v('C6'), 3, 'RANK เท่ากันได้อันดับเดียวกัน');
assert.equal(v('A9'), '13 ปี 0 เดือน', 'DATEDIF กับวันที่ข้อความ วว/ดด/ปปปป');
assert.equal(v('B9'), '1,234.50', 'TEXT');
assert.equal(v('C9'), -0.33, 'ROUNDDOWN/ROUND แบบ Excel');
assert.equal(v('B10'), 0, 'เซลล์อ้างช่องว่าง = 0'); assert.equal(v('A10'), 170);
assert.equal(v('C10'), 170, 'SUMPRODUCT');
assert.equal(v('A11'), 65, 'MODE(LARGE(...,ROW(INDIRECT()))) คิดแบบอาร์เรย์');
assert.equal(v('B11'), 4, 'นิเสธก่อนยกกำลัง');
assert.equal(v('C11'), 'aTRUE1.5', 'ต่อข้อความ');
assert.ok(parseFormula("'[1]แผ่น 1'!A1+#REF!"), 'อ่านสูตรลิงก์ภายนอก/#REF!');

// เปลี่ยน No แล้วคำนวณใหม่
eng.setValue('สรุป รวม', 1, 2, 3);
assert.equal(v('A3'), 90, 'setValue ล้างผลเก่า');

// รูปแบบตัวเลข
assert.equal(formatValue(ymdToSerial(2568, 5, 16), '[$-41E]d mmmm yyyy').text, '16 พฤษภาคม 2568');
assert.equal(formatValue(0.255, '0%').text, '26%');
assert.equal(formatValue(-1234, '#,##0_ ;\\-#,##0\\ ').text, '-1,234 ');
assert.equal(formatValue(1648900157771, '0\\ 0000\\ 00000\\ 00\\ 0').text, '1 6489 00157 77 1');

// การแบ่งหน้า: หัวตารางซ้ำ + ตัวแบ่งหน้าเอง
const R = new Renderer(wb, eng, { dpi: 96 });
const pg = R.paginate('สรุป รวม');
assert.equal(pg.scale, 1);
assert.equal(pg.pages[0].rs.a, 1); assert.equal(pg.pages[0].rs.b, 20, 'ตัดหน้าที่ตัวแบ่งหน้า');
assert.deepEqual(pg.pages[1].rs.title, [1, 2], 'หน้าถัดไปมีหัวตารางซ้ำ');
const fit = R.paginate('สรุป รวม', { fit: 'page' });
assert.equal(fit.pages.length, 1); assert.ok(fit.scale < 1, 'พอดี 1 หน้า');
const land = R.paginate('สรุป รวม', { orientation: 'landscape' });
assert.equal(land.orient, 'landscape'); assert.ok(land.paper.w > land.paper.h);
const html = R.renderSheet('สรุป รวม')[0].html;
assert.ok(html.includes('xl-page') && html.includes('130'), 'วาดหน้าได้');

console.log('xl-engine: ผ่านทั้งหมด');
