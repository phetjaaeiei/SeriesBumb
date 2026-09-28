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
6. commit การแก้ `wrangler.jsonc` ผ่าน branch + PR แล้ว merge เข้า `main` เพราะ `scripts/deploy.ts` ไม่ยอม deploy ถ้ามีไฟล์ที่ยังไม่ commit
7. `npm run deploy:prod` จาก worktree ของ `main` ที่สะอาด แล้วลองเปิด `/admin` ในหน้าต่างส่วนตัว: ต้องเจอหน้า Access ก่อน แล้วจึงถึงหน้า login ของเว็บ
8. ถ้าอีเมลที่ผ่าน Access ไม่ตรงกับบัญชีที่ login ในเว็บ แอปจะตอบ 403 เพื่อกันการใช้ cookie ของคนอื่น

ย้อนกลับ (ทำตามลำดับนี้เท่านั้น):
1. ลบ `ACCESS_TEAM_DOMAIN` ออกจาก vars (commit + merge) แล้ว deploy ใหม่ ตรวจว่า Cloudflare dashboard → Workers & Pages → `seriesbumb` → Settings → Variables ไม่มี `ACCESS_TEAM_DOMAIN` แล้ว และ `/admin` ยังเปิดได้ตามปกติหลังผ่านหน้า Access (ช่วงนี้ Access ที่ edge ยังเปิดอยู่ จึงยังเจอหน้า Access ตามปกติ)
2. จากนั้นจึงปิดหรือลบ Access application แล้วตรวจในหน้าต่างส่วนตัวว่าเปิด `/admin` แล้วไปหน้า login ของเว็บเลยโดยไม่ผ่าน Access

> **ห้ามปิด Access application ก่อน** ถ้า Worker ยังมี `ACCESS_TEAM_DOMAIN` อยู่ request จะไม่มี JWT และแอปจะตอบ 403 ทุกหน้าแอดมิน ซึ่งทำให้เจ้าของเข้าแอดมินไม่ได้

## Turnstile (login, คอมเมนต์, รีวิว, ข้อเสนอแก้ข้อมูล)

1. Cloudflare dashboard → Turnstile → Add widget: hostname `seriesbumb.phetjaa.workers.dev` (และ staging ถ้าต้องการ), mode **Managed**
2. ใส่ site key ใน `wrangler.jsonc` → `vars`: `"TURNSTILE_SITE_KEY": "<site key>"` (เป็นค่าสาธารณะ) และ secret: `npx wrangler secret put TURNSTILE_SECRET_KEY`
   - site key ต้องอยู่ใน `wrangler.jsonc` เท่านั้น ห้ามตั้งผ่าน dashboard หรือเป็น secret เพราะ CSP คำนวณตอน build จากไฟล์นี้ ถ้าไม่มี widget จะโหลดไม่ได้ และปุ่มเข้าสู่ระบบจะกดไม่ได้
3. commit การแก้ `wrangler.jsonc` ผ่าน branch + PR แล้ว merge เข้า `main`
4. `npm run deploy:prod` จาก worktree ของ `main` ที่สะอาด — build จะเพิ่ม `https://challenges.cloudflare.com` ใน CSP ให้เองเมื่อมี site key
5. ตรวจ: หน้า `/login` มีกล่องยืนยัน, ปุ่มกดได้หลังผ่าน, และคอมเมนต์ส่งได้ตามปกติ

ลองบน staging ก่อนได้ด้วย test key ของ Cloudflare (ผ่านทุกครั้ง): ใส่ `"TURNSTILE_SITE_KEY": "1x00000000000000000000AA"` ใน `env.staging.vars` และ `npx wrangler secret put TURNSTILE_SECRET_KEY --env staging` เป็น `1x0000000000000000000000000000000AA` ระบบยอมรับ test key เฉพาะเมื่อ `APP_ENV` ไม่ใช่ `production`

ย้อนกลับ: ลบ `TURNSTILE_SITE_KEY` จาก vars (commit + merge) แล้ว deploy ใหม่
