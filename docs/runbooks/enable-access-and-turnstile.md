# เปิดใช้ Cloudflare Access และ Turnstile (ฟรี)

ทั้งสองอย่างเขียนโค้ดรองรับไว้แล้วแต่ปิดอยู่ จะเปิดเมื่อใส่ค่าครบ ถ้าใส่ไม่ครบระบบจะถือว่าปิด

## Cloudflare Access ครอบหน้าแอดมิน (Zero Trust Free, ไม่เกิน 50 คน)

1. Cloudflare dashboard → Zero Trust → ตั้งชื่อ team (เช่น `seriesbumb`) แล้วเลือกแผน Free
2. Settings → Authentication → Login methods: เพิ่ม **Google** (ใช้ Gmail ธรรมดาได้) และ **One-time PIN** ไว้เป็นทางสำรอง
3. Access → Applications → Add → Self-hosted:
   - Domain: `seriesbumb.phetjaa.workers.dev` ใส่ path `/admin`, `/admin/*`, `/_actions/admin.*` (ต้องใส่ `/admin` แยก เพราะ wildcard ไม่ครอบ path แม่) ส่วน admin action ที่เรียกผ่าน `?_action=admin.*` บนหน้าอื่น Access ที่ edge ครอบไม่ถึง แต่ Worker จะตอบ 403 ให้เองเมื่อไม่มี JWT (ใน UI ไม่มีการเรียกแบบนี้)
   - Policy: Allow → Emails → ใส่อีเมลแอดมินทีละอีเมล (ห้ามใช้ “ทุก Gmail”)
   - Session duration 12 ชั่วโมง
4. คัดลอก **Application Audience (AUD) Tag**
5. ใส่ค่าใน `wrangler.jsonc` → `vars`: `"ACCESS_TEAM_DOMAIN": "https://<team>.cloudflareaccess.com"` แล้วตั้ง secret `npx wrangler secret put ACCESS_AUD` (ใส่ AUD tag)
6. `npm run deploy:prod` แล้วลองเปิด `/admin` ในหน้าต่างส่วนตัว: ต้องเจอหน้า Access ก่อน แล้วจึงถึงหน้า login ของเว็บ
7. ถ้าอีเมลที่ผ่าน Access ไม่ตรงกับบัญชีที่ login ในเว็บ แอปจะตอบ 403 เพื่อกันการใช้ cookie ของคนอื่น

ย้อนกลับ: ลบ `ACCESS_TEAM_DOMAIN` ออกจาก vars แล้ว deploy ใหม่ (หรือปิด Access application)

## Turnstile (login, คอมเมนต์, รีวิว, ข้อเสนอแก้ข้อมูล)

1. Cloudflare dashboard → Turnstile → Add widget: hostname `seriesbumb.phetjaa.workers.dev` (และ staging ถ้าต้องการ), mode **Managed**
2. ใส่ site key ใน `wrangler.jsonc` → `vars`: `"TURNSTILE_SITE_KEY": "<site key>"` (เป็นค่าสาธารณะ) และ secret: `npx wrangler secret put TURNSTILE_SECRET_KEY`
3. `npm run deploy:prod` — build จะเพิ่ม `https://challenges.cloudflare.com` ใน CSP ให้เองเมื่อมี site key
4. ตรวจ: หน้า `/login` มีกล่องยืนยัน, ปุ่มกดได้หลังผ่าน, และคอมเมนต์ส่งได้ตามปกติ

ย้อนกลับ: ลบ `TURNSTILE_SITE_KEY` จาก vars แล้ว deploy ใหม่
