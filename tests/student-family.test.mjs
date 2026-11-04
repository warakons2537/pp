// ทดสอบข้อมูลครอบครัว/ที่อยู่ของนักเรียน (js/student-family.js): node tests/student-family.test.mjs
import assert from 'node:assert/strict';
import { familyHtml, familyPatch, occupationOf, rawOccupation, personName, addressShort } from '../js/student-family.js';

// อาชีพ: ที่กรอกในระบบก่อน · ไม่มีก็ใช้จากข้อมูลดิบ DMC
const priv = { father: { first_name: 'สมพงษ์', income: 9000, citizen_id: '1111111111111', occupation: 'รับจ้าง' }, dmc_raw: { 'อาชีพมารดา': 'ค้าขาย', 'อาชีพบิดา': 'เกษตร', 'ชื่อ': 'ก' } };
assert.equal(occupationOf(priv, 'father'), 'รับจ้าง'); assert.equal(occupationOf(priv, 'mother'), 'ค้าขาย'); assert.equal(occupationOf(priv, 'guardian'), null);
assert.equal(rawOccupation(priv, 'father'), 'เกษตร');
assert.equal(personName({ prefix: 'นาย', first_name: 'สมพงษ์', last_name: 'ก' }), 'นายสมพงษ์ ก'); assert.equal(personName(null), null); assert.equal(personName({}), null);
assert.equal(addressShort({ house_no: '175/2', moo: '3', subdistrict: 'วังลึก', district: 'ศรีสำโรง', province: 'สุโขทัย', postcode: '64120' }), '175/2 หมู่ 3 ต.วังลึก อ.ศรีสำโรง จ.สุโขทัย 64120');
assert.equal(addressShort({}), null); assert.equal(addressShort(null), null);

// ฟอร์ม: แสดงค่าเดิม และ escape
const html = familyHtml({ father: { prefix: 'นาย', first_name: 'A"B<', last_name: 'ค' }, address: { moo: '5' } });
assert.ok(html.includes('name="father_first_name"') && html.includes('A&quot;B&lt;') && html.includes('name="guardian_relation"') && html.includes('name="addr_moo" value="5"'));
assert.ok(!html.includes('A"B<'), 'ต้อง escape');

// บันทึก: ผสมกับค่าเดิม (ค่า DMC ที่ฟอร์มไม่แสดงต้องคงอยู่) · ช่องว่าง = null
const r = { father_prefix: 'นาย', father_first_name: ' สมพงษ์ ', father_last_name: 'ใหม่', father_occupation: '', mother_first_name: 'น้ำผึ้ง', guardian_prefix: 'นาง', guardian_first_name: 'ประชุม', guardian_relation: 'ยาย', addr_house_no: '175/2', addr_moo: '3', addr_subdistrict: '', addr_province: 'สุโขทัย' };
const p = familyPatch(priv, r);
assert.equal(p.father.first_name, 'สมพงษ์'); assert.equal(p.father.last_name, 'ใหม่'); assert.equal(p.father.occupation, null); assert.equal(p.father.income, 9000); assert.equal(p.father.citizen_id, '1111111111111');
assert.equal(p.mother.first_name, 'น้ำผึ้ง'); assert.equal(p.guardian.relation, 'ยาย'); assert.equal(p.guardian.prefix, 'นาง');
assert.deepEqual(p.address, { house_no: '175/2', moo: '3', subdistrict: null, district: null, province: 'สุโขทัย', postcode: null });
// เคลียร์ทั้งหมด → null (ไม่ทิ้ง object ว่าง)
const empty = familyPatch({}, {});
assert.deepEqual(empty, { father: null, mother: null, guardian: null, address: null });
// ไม่แก้ priv เดิม
assert.equal(priv.father.last_name, undefined);
console.log('student-family: ผ่านทั้งหมด');
