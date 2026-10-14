// =====================================================================
//  ตั้งค่าการเชื่อมต่อ Supabase
//  - เว้นว่างไว้ = เปิดแอปใน "โหมดทดลอง" (ข้อมูลตัวอย่าง เก็บในเบราว์เซอร์เครื่องนี้เท่านั้น)
//  - ใส่ค่าจาก Supabase > Project Settings > API Keys
//      SUPABASE_URL = Project URL  (เช่น https://abcdefgh.supabase.co)
//      SUPABASE_KEY = Publishable key  (ขึ้นต้นด้วย sb_publishable_...)
//    แล้วแอปจะใช้ฐานข้อมูลกลางจริงทันที
//  ห้ามใส่ Secret key (sb_secret_...) ที่นี่เด็ดขาด
//  Publishable key เปิดเผยในหน้าเว็บได้ตามปกติ เพราะสิทธิ์ถูกคุมด้วย RLS ในฐานข้อมูล
// =====================================================================
export const SUPABASE_URL = 'https://fvfdyskidcxxhzpsnanp.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_ReEEMSeH1iBJ2rzXlAqhVw_vX2xvqtz';
