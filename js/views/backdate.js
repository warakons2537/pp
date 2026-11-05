// =====================================================================
//  เช็กชื่อย้อนหลัง — แยกจากเช็กชื่อประจำวัน
//  เลือกเดือน/วันที่ย้อนหลังได้ตลอดปีการศึกษา โดยไม่ต้องเปลี่ยนภาคเรียนปัจจุบัน
//  รายชื่อ = นักเรียนที่อยู่ในห้องวันนั้น (รองรับย้ายเข้า/ออกกลางปี) · วันนอกช่วงที่นักเรียนอยู่ในห้อง และวันในอนาคต แก้ไม่ได้
//  ใช้ตารางเช็กชื่อเดียวกับหน้าประจำวัน (ข้อมูล daily_attendance ชุดเดียวกัน)
// =====================================================================
import { renderAttendance } from './daily.js?v=2569.11.1-23';
import { getRoster, academicYearMonths, enrolledOn } from '../data.js?v=2569.11.1-23';
import { iso } from '../util.js?v=2569.11.1-23';

const yesterday = () => { const d = new Date(); d.setDate(d.getDate() - 1); return iso(d); };

const BACKDATE = {
  title: 'เช็กชื่อย้อนหลัง', pref: { room: null, mode: 'month', ym: null, date: null },
  intro: (canEdit) => `บันทึก/แก้ไขการมาเรียนของวันที่ผ่านมา เลือกเดือนหรือวันที่ได้ตลอดปีการศึกษา ไม่ต้องเปลี่ยนภาคเรียน · รายชื่อตามนักเรียนที่อยู่ในห้องวันนั้น (ช่องสีเทา = ยังไม่ได้เข้า/ออกจากห้องแล้ว) · ${canEdit ? 'ข้อมูลชุดเดียวกับเช็กชื่อประจำวัน' : 'ดูอย่างเดียว (ไม่ใช่ครูประจำชั้นห้องนี้)'}`,
  months: (ctx, room) => academicYearMonths(room.academic_year),
  roster: (ctx, room, { from, to, date, mode }) => (mode === 'month' ? getRoster(ctx.db, room.id, { from, to }) : getRoster(ctx.db, room.id, { asOf: date })),
  inClass: (s, date) => enrolledOn(s, date), noFuture: true, defaultDate: yesterday,
  emptyText: 'ไม่มีนักเรียนอยู่ในห้องช่วงนี้ — ตรวจวันที่เข้า/ย้ายออกของนักเรียนที่หน้า "นักเรียน"',
};

export const render = (el, ctx) => renderAttendance(el, ctx, BACKDATE);
