# SeriesBumb

เว็บสารานุกรมเทปเพลงไทย ใช้ Astro บน Cloudflare Workers พร้อม D1, Supabase Storage สำหรับรูปสาธารณะและคลังเสียงส่วนตัว และระบบเข้าสู่ระบบด้วย Google

เว็บ staging: https://seriesbumb-staging.phetjaa.workers.dev (D1 แยก ปิดการอัปโหลด และไม่ให้ search engine เก็บ)

เว็บ production: https://seriesbumb.phetjaa.workers.dev

## คลังไฟล์เพลงส่วนตัว

แอดมินเปิด `/admin/audio` เพื่ออัปโหลด ค้นหา ดาวน์โหลด หรือลบไฟล์เสียง และผูกกับเพลงหรือเทปที่มีอยู่ได้ คนทั่วไปและสมาชิกไม่มีสิทธิ์เข้าหน้ารายการหรือ API ดาวน์โหลด ไฟล์ไม่ถูกเผยแพร่บนหน้าข้อมูลเพลง

- **Supabase Free:** ใช้ private bucket `SeriesBumb` ในโปรเจกต์ `lgtdhbeocizxxvptofdb` ตั้ง `SUPABASE_SECRET_KEY` เป็น Worker secret เท่านั้น ห้ามใส่ในโค้ดฝั่งเบราว์เซอร์ รับ MP3, FLAC, WAV, M4A, OGG และคลิปวิดีโอ MP4 สูงสุด 50,000,000 bytes ต่อไฟล์ (bucket ต้องอนุญาต MIME `video/mp4` ด้วย) เบราว์เซอร์ส่งไฟล์ตรงเข้า Supabase ด้วยลิงก์อัปโหลดอายุ 2 ชั่วโมงที่ Worker ออกให้เฉพาะรายการที่จองไว้ แล้ว Worker ตรวจขนาด ชนิดไฟล์ และ 12 bytes แรกก่อนบันทึกว่าพร้อมใช้ bucket ต้องเป็น private และตั้ง file size limit ไม่เกิน 52,428,800 bytes มิฉะนั้นระบบจะไม่ออกลิงก์
- **เพดานของเว็บ:** เก็บไฟล์ Supabase รวมไม่เกิน 900 MB รวมรายการที่อัปโหลดไม่สำเร็จ/กำลังจองพื้นที่ และดาวน์โหลดไม่เกิน 4 GB ใน 32 วันล่าสุดตามวันที่ UTC นับเต็มไฟล์ก่อนเริ่มส่ง รวมกรณีดาวน์โหลดถูกยกเลิก เมื่อถึงเพดานระบบปฏิเสธคำขอใหม่ ทั้งนี้โควตาจริงของ Supabase แชร์กับโปรเจกต์อื่นในองค์กรด้วย และตัวเลขในเว็บไม่รวมไฟล์ที่เพิ่มผ่าน Console
- **Google Drive:** เก็บเฉพาะลิงก์ไฟล์ ไม่มีการคัดลอกไฟล์หรือขอสิทธิ์อ่าน Drive ทั้งบัญชี ตั้งแชร์เป็น **Restricted** และให้สิทธิ์บัญชีแอดมินใน Drive เอง เว็บไม่สามารถตรวจหรือบังคับสิทธิ์ของไฟล์ Drive และไม่ทราบพื้นที่ว่างจริง
- **Firebase:** `AUDIO_FIREBASE_ENABLED=false` และ `FIREBASE_IMAGE_UPLOADS_ENABLED=false` เป็นค่าเริ่มต้น จึงพักการอัปโหลดเพลงและรูปใหม่บน Blaze จนกว่าจะยอมรับความเสี่ยงค่าใช้จ่าย รูปเดิมยังอ่านและลบได้ ไม่มี spend cap สำหรับ Firebase Storage และ Budget Alert ไม่ใช่ตัวหยุดค่าใช้จ่าย ลิงก์รูปสาธารณะเดิม การใช้งานนอกเว็บ และ soft-deleted objects ไม่อยู่ภายใต้เพดานของคลังเพลง จึงห้ามอ้างว่าการตั้งค่านี้รับประกันค่าใช้จ่ายทั้งบัญชีเป็นศูนย์

รายการ Supabase ที่ยังไม่ยืนยันไฟล์จะจองพื้นที่ 52,428,800 bytes ต่อรายการ (ขนาดสูงสุดที่ลิงก์อัปโหลดส่งได้) และนับตามขนาดจริงหลังตรวจผ่าน เมื่ออัปโหลดขาดช่วง ให้กด “ตรวจสอบไฟล์” หรือ “ส่งไฟล์เดิม” ที่รายการนั้นแทนการอัปโหลดใหม่ เพื่อไม่ให้จองพื้นที่ซ้ำ รายการที่ออกลิงก์แล้วลบได้หลังลิงก์หมดอายุพร้อมช่วงเผื่อ (2 ชั่วโมง 15 นาทีนับจากออกลิงก์) เพราะลิงก์ที่ยังใช้ได้อาจสร้างไฟล์กลับขึ้นมาหลังลบ ไฟล์ที่ไม่ผ่านการตรวจจะแสดงเฉพาะปุ่มลบ ระบบจะคืนพื้นที่หลังยืนยันลบไฟล์จากผู้ให้บริการแล้วเท่านั้น การลบลิงก์ Drive ลบเฉพาะรายการในเว็บ ไม่ลบไฟล์ต้นฉบับ

Supabase Free ต้องคง Free plan และ Spend Cap; โปรเจกต์อาจพักเมื่อไม่ใช้งาน และอาจหยุดให้บริการเมื่อเกินโควตา สำรองไฟล์เสียงต้นฉบับไว้อีกชุด การสำรอง D1 ด้านล่างครอบคลุมข้อมูลรายการและยอดโควตา แต่ไม่รวม bytes ของไฟล์เสียง

## เริ่มพัฒนาในเครื่อง

ต้องใช้ Node.js 22.12 ขึ้นไป และ npm

1. ติดตั้งแพ็กเกจด้วย `npm install`
2. คัดลอก `.dev.vars.example` เป็น `.dev.vars` แล้วใส่ค่า Google OAuth และ Supabase secret key สำหรับเครื่องที่ใช้พัฒนา (เก็บไฟล์นี้นอก Git) ค่าทุกตัวถูกตรวจด้วย `src/config/env.schema.ts` ถ้าขาดหรือผิดรูปแบบเว็บจะหยุดพร้อมชื่อคีย์ที่ผิด
3. สร้างชนิดข้อมูล binding ใหม่ด้วย `npm run types`
4. เตรียม D1 ในเครื่องด้วย `npm run db:migrate:local`
5. เปิดเว็บด้วย `npm run dev` ที่ `http://localhost:4321`

ตั้ง Google OAuth redirect URI สำหรับเครื่องพัฒนาเป็น `http://localhost:4321/api/auth/callback/google` ค่า `SITE_URL` ใน `.dev.vars` ใช้ URL ในเครื่อง ส่วนค่าใน `wrangler.jsonc` ใช้ URL production

ฐานข้อมูล local และไฟล์ `.dev.vars` ถูกละเว้นโดย Git ค่า `SITE_URL`, `IMAGE_BASE_URL` และ `FIREBASE_STORAGE_BUCKET` สำหรับ production อยู่ใน `wrangler.jsonc` ส่วน `FIREBASE_SERVICE_ACCOUNT_JSON` ต้องเป็น Wrangler secret ที่มี service account ซึ่งได้รับสิทธิ์จัดการ object เฉพาะ bucket นี้ ห้ามใส่ JSON key ใน `wrangler.jsonc` หรือ Git

กฎใน `storage.rules` เปิดให้ผู้เยี่ยมชมอ่านรูปคลังเป็นรายไฟล์ แต่ปิดการเขียนและการ list จาก client; การอัปโหลด/ลบทำผ่าน Worker ด้วย Google Cloud IAM เท่านั้น ใช้ `firebase deploy --only storage --project seriesbumb-32f9e` หรืออัปเดตกฎเดียวกันใน Firebase Console ก่อนเปิดใช้รูปบนเว็บ

## Deploy

Deploy จาก worktree ที่ commit ครบแล้วเท่านั้น (สคริปต์จะหยุดถ้ามีไฟล์ค้าง) และขึ้น staging ก่อน production เสมอ

1. ลงชื่อเข้า Cloudflare ด้วย `npx wrangler login`
2. ตั้ง Worker secrets ครั้งแรก: `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ADMIN_EMAILS`, `SUPABASE_SECRET_KEY` ผ่าน `npx wrangler secret put ชื่อคีย์` (staging เพิ่ม `--env staging` และไม่ต้องมี `SUPABASE_SECRET_KEY`)
3. ตั้ง Google OAuth redirect URI เป็น `https://seriesbumb.phetjaa.workers.dev/api/auth/callback/google` และ `https://seriesbumb-staging.phetjaa.workers.dev/api/auth/callback/google`
4. รัน `npm run check`, `npm run lint`, `npm test`, `npm run test:int`
5. `npm run deploy:staging` แล้ว `E2E_BASE_URL=https://seriesbumb-staging.phetjaa.workers.dev npm run test:e2e`
6. `npm run deploy:prod` แล้ว `E2E_BASE_URL=https://seriesbumb.phetjaa.workers.dev npm run test:e2e`

สคริปต์ deploy จะตรวจ migration กับ journal, build ตาม environment, จด D1 Time Travel bookmark, apply migration, deploy แล้วเช็กหน้าแรก ถ้าไม่ผ่านจะพิมพ์คำสั่ง rollback ทั้งโค้ดและข้อมูล และบันทึกผลไว้ใน `.deploys/`

การ deploy ครั้งถัดไปจะเก็บ Worker secrets เดิมไว้ CSP `img-src` อนุญาต origin ของ `IMAGE_BASE_URL` (อ่านจาก environment ตอน build หรือ `vars` ใน `wrangler.jsonc`) ส่วน `connect-src` อนุญาต origin ของ `SUPABASE_URL` (อ่านจาก environment ตอน build หรือ `vars` ใน `wrangler.jsonc`) เพื่อให้หน้าแอดมินส่งไฟล์เพลงตรงเข้า Supabase ได้ หากย้ายโปรเจกต์ Supabase ต้อง build และ deploy ใหม่

## คำสั่ง

| คำสั่ง | งาน |
| --- | --- |
| `npm run dev` | เปิดเว็บในเครื่อง |
| `npm run build` | สร้าง Worker และ static assets |
| `npm run deploy:staging` | Deploy ไป staging (D1 แยก) |
| `npm run deploy:prod` | Deploy ไป production (`npm run deploy` ก็เรียกตัวนี้) |
| `npm run check:migrations` | ตรวจว่าไฟล์ migration ตรงกับ Drizzle journal |
| `npm run preview` | ดูผล build ในเครื่อง |
| `npm run check` | ตรวจชนิดข้อมูล Astro และ TypeScript |
| `npm run lint` | ตรวจ ESLint |
| `npm test` | รัน unit tests ใน Node.js |
| `npm run test:int` | รัน integration tests ใน workerd พร้อม D1 และ image store จำลอง |
| `npm run test:e2e` | รัน Playwright smoke tests (ตั้ง `E2E_BASE_URL` เพื่อทดสอบ staging/production) |
| `npm run db:generate` | สร้าง SQL migration จาก Drizzle schema |

การทดสอบ E2E ต้องติดตั้ง Chromium ของ Playwright ด้วย `npx playwright install chromium` ก่อนใช้ครั้งแรก

เมื่ออัปเดตโค้ดที่เปลี่ยนการค้นหาภาษาไทย ให้แอดมินกด **สร้างดัชนีใหม่ทั้งหมด** ที่ `/admin` และรอให้คิวทำงานจบ เพื่อให้ข้อมูลเก่าใช้กฎค้นหาเดียวกับข้อมูลใหม่

## สำรองและกู้คืน D1

ใช้ D1 Time Travel สำหรับการย้อนข้อมูลภายใน 7 วัน (`npx wrangler d1 time-travel restore seriesbumb --timestamp ...`) และสำรองออกนอกระบบอย่างน้อยสัปดาห์ละครั้ง คำสั่งสำรองด้านล่างอ่านตารางปกติทั้งหมดผ่าน `wrangler d1 execute --remote --json` แล้วสร้าง `manifest.json` กับไฟล์ JSON แยกชุด ไม่รวมตาราง FTS5 ที่สร้างใหม่ได้

ก่อนสำรองหรือกู้คืน ให้หยุดการเขียนข้อมูลจากเว็บไซต์/แอดมินจนเสร็จ และกำหนด D1 `database_id` จริงใน `wrangler.jsonc` สคริปต์สำรองจะหยุดถ้าพบ foreign key ที่เสีย เก็บโฟลเดอร์สำรองไว้นอก Git ในที่ปลอดภัย เพราะมีข้อมูลบัญชีและ OAuth token; สำรองไฟล์รูปและเสียงใน Supabase Storage แยกต่างหาก

```sh
node --experimental-strip-types scripts/backup.ts --database seriesbumb --out "$HOME/seriesbumb-backups/$(date -u +%F)" --writes-paused
```

การกู้จาก JSON ต้องใช้ **D1 ใหม่ที่ว่างและลง migrations รุ่นเดียวกับไฟล์สำรองแล้ว** ตั้งชื่อ/ID ของฐานใหม่นั้นใน `wrangler.jsonc` ก่อนรัน ห้ามชี้ไปยังฐานที่มีข้อมูลอยู่:

```sh
npx wrangler d1 migrations apply seriesbumb-restore --remote
node --experimental-strip-types scripts/restore.ts --from "$HOME/seriesbumb-backups/YYYY-MM-DD" --database seriesbumb-restore --confirm-database seriesbumb-restore --writes-paused
```

สคริปต์ตรวจ schema, checksum, ตารางปลายทาง, จำนวนแถวและ foreign keys พร้อมอ่านข้อมูลกลับหลังเขียนแต่ละชุด บันทึกสถานะไว้ในโฟลเดอร์สำรอง จึงรันคำสั่งกู้เดิมซ้ำได้หลังหยุดหรือหลังโควตารีเซ็ต 00:00 UTC (07:00 น. ไทย) สคริปต์หยุดก่อนงบ 80,000 `rows_written` ต่อวันโดยนับจาก metadata ของงานกู้นี้เท่านั้น; หากบัญชี Cloudflare มีงานเขียนอื่นในวันเดียวกัน ต้องเผื่อโควตาเพิ่มเติมด้วย `--max-writes N` เมื่อกู้เสร็จ กด **สร้างดัชนีใหม่ทั้งหมด** ที่ `/admin` และรอจนคิวหมดก่อนเปิดให้เขียนอีกครั้ง
