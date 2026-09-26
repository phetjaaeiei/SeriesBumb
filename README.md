# SeriesBumb

เว็บสารานุกรมเทปเพลงไทย ใช้ Astro บน Cloudflare Workers พร้อม D1, Firebase Storage สำหรับรูป และระบบเข้าสู่ระบบด้วย Google

เว็บ production: https://seriesbumb.phetjaa.workers.dev

## เริ่มพัฒนาในเครื่อง

ต้องใช้ Node.js 22.12 ขึ้นไป และ npm

1. ติดตั้งแพ็กเกจด้วย `npm install`
2. คัดลอก `.dev.vars.example` เป็น `.dev.vars` แล้วใส่ค่า Google OAuth และ Firebase service account JSON สำหรับเครื่องที่ใช้พัฒนา (เก็บไฟล์นี้นอก Git)
3. สร้างชนิดข้อมูล binding ใหม่ด้วย `npm run types`
4. เตรียม D1 ในเครื่องด้วย `npm run db:migrate:local`
5. เปิดเว็บด้วย `npm run dev` ที่ `http://localhost:4321`

ตั้ง Google OAuth redirect URI สำหรับเครื่องพัฒนาเป็น `http://localhost:4321/api/auth/callback/google` ค่า `SITE_URL` ใน `.dev.vars` ใช้ URL ในเครื่อง ส่วนค่าใน `wrangler.jsonc` ใช้ URL production

ฐานข้อมูล local และไฟล์ `.dev.vars` ถูกละเว้นโดย Git ค่า `SITE_URL`, `IMAGE_BASE_URL` และ `FIREBASE_STORAGE_BUCKET` สำหรับ production อยู่ใน `wrangler.jsonc` ส่วน `FIREBASE_SERVICE_ACCOUNT_JSON` ต้องเป็น Wrangler secret ที่มี service account ซึ่งได้รับสิทธิ์จัดการ object เฉพาะ bucket นี้ ห้ามใส่ JSON key ใน `wrangler.jsonc` หรือ Git

กฎใน `storage.rules` เปิดให้ผู้เยี่ยมชมอ่านรูปคลังเป็นรายไฟล์ แต่ปิดการเขียนและการ list จาก client; การอัปโหลด/ลบทำผ่าน Worker ด้วย Google Cloud IAM เท่านั้น ใช้ `firebase deploy --only storage --project seriesbumb-32f9e` หรืออัปเดตกฎเดียวกันใน Firebase Console ก่อนเปิดใช้รูปบนเว็บ

## Deploy

1. ลงชื่อเข้า Cloudflare ด้วย `npx wrangler login`
2. ตั้ง Worker secrets: `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ADMIN_EMAILS`, `FIREBASE_SERVICE_ACCOUNT_JSON` ผ่าน `npx wrangler secret put ชื่อคีย์`
3. ตั้ง Google OAuth redirect URI เป็น `https://seriesbumb.phetjaa.workers.dev/api/auth/callback/google`
4. เมื่อมี migration ใหม่ รัน `npx wrangler d1 migrations apply seriesbumb --remote`
5. รัน `npm run check`, `npm run lint`, `npm test`, `npm run test:int` แล้ว `npm run deploy`

การ deploy ครั้งถัดไปจะเก็บ Worker secrets เดิมไว้ CSP อนุญาตรูปจาก Firebase เป็นค่าเริ่มต้น หากเปลี่ยนผู้ให้บริการรูป ให้กำหนด `IMAGE_BASE_URL` ใน environment ตอน build ให้ตรงกับค่าที่ Worker ใช้

## คำสั่ง

| คำสั่ง | งาน |
| --- | --- |
| `npm run dev` | เปิดเว็บในเครื่อง |
| `npm run build` | สร้าง Worker และ static assets |
| `npm run deploy` | Build และ deploy ไป Cloudflare Workers |
| `npm run preview` | ดูผล build ในเครื่อง |
| `npm run check` | ตรวจชนิดข้อมูล Astro และ TypeScript |
| `npm run lint` | ตรวจ ESLint |
| `npm test` | รัน unit tests ใน Node.js |
| `npm run test:int` | รัน integration tests ใน workerd พร้อม D1 และ image store จำลอง |
| `npm run test:e2e` | รัน Playwright บนเว็บในเครื่อง |
| `npm run db:generate` | สร้าง SQL migration จาก Drizzle schema |

การทดสอบ E2E ต้องติดตั้ง Chromium ของ Playwright ด้วย `npx playwright install chromium` ก่อนใช้ครั้งแรก

เมื่ออัปเดตโค้ดที่เปลี่ยนการค้นหาภาษาไทย ให้แอดมินกด **สร้างดัชนีใหม่ทั้งหมด** ที่ `/admin` และรอให้คิวทำงานจบ เพื่อให้ข้อมูลเก่าใช้กฎค้นหาเดียวกับข้อมูลใหม่

## สำรองและกู้คืน D1

ใช้ D1 Time Travel สำหรับการย้อนข้อมูลภายใน 7 วัน (`npx wrangler d1 time-travel restore seriesbumb --timestamp ...`) และสำรองออกนอกระบบอย่างน้อยสัปดาห์ละครั้ง คำสั่งสำรองด้านล่างอ่านตารางปกติทั้งหมดผ่าน `wrangler d1 execute --remote --json` แล้วสร้าง `manifest.json` กับไฟล์ JSON แยกชุด ไม่รวมตาราง FTS5 ที่สร้างใหม่ได้

ก่อนสำรองหรือกู้คืน ให้หยุดการเขียนข้อมูลจากเว็บไซต์/แอดมินจนเสร็จ และกำหนด D1 `database_id` จริงใน `wrangler.jsonc` สคริปต์สำรองจะหยุดถ้าพบ foreign key ที่เสีย เก็บโฟลเดอร์สำรองไว้นอก Git ในที่ปลอดภัย เพราะมีข้อมูลบัญชีและ OAuth token; สำรองไฟล์รูปใน Firebase Storage แยกต่างหาก

```sh
node --experimental-strip-types scripts/backup.ts --database seriesbumb --out "$HOME/seriesbumb-backups/$(date -u +%F)" --writes-paused
```

การกู้จาก JSON ต้องใช้ **D1 ใหม่ที่ว่างและลง migrations รุ่นเดียวกับไฟล์สำรองแล้ว** ตั้งชื่อ/ID ของฐานใหม่นั้นใน `wrangler.jsonc` ก่อนรัน ห้ามชี้ไปยังฐานที่มีข้อมูลอยู่:

```sh
npx wrangler d1 migrations apply seriesbumb-restore --remote
node --experimental-strip-types scripts/restore.ts --from "$HOME/seriesbumb-backups/YYYY-MM-DD" --database seriesbumb-restore --confirm-database seriesbumb-restore --writes-paused
```

สคริปต์ตรวจ schema, checksum, ตารางปลายทาง, จำนวนแถวและ foreign keys พร้อมอ่านข้อมูลกลับหลังเขียนแต่ละชุด บันทึกสถานะไว้ในโฟลเดอร์สำรอง จึงรันคำสั่งกู้เดิมซ้ำได้หลังหยุดหรือหลังโควตารีเซ็ต 00:00 UTC (07:00 น. ไทย) สคริปต์หยุดก่อนงบ 80,000 `rows_written` ต่อวันโดยนับจาก metadata ของงานกู้นี้เท่านั้น; หากบัญชี Cloudflare มีงานเขียนอื่นในวันเดียวกัน ต้องเผื่อโควตาเพิ่มเติมด้วย `--max-writes N` เมื่อกู้เสร็จ กด **สร้างดัชนีใหม่ทั้งหมด** ที่ `/admin` และรอจนคิวหมดก่อนเปิดให้เขียนอีกครั้ง
