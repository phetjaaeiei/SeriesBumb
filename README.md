# SeriesBumb

เว็บสารานุกรมเทปเพลงไทย ใช้ Astro บน Cloudflare Workers พร้อม D1, R2 และระบบเข้าสู่ระบบด้วย Google

## เริ่มพัฒนาในเครื่อง

ต้องใช้ Node.js 22.12 ขึ้นไป และ npm

1. ติดตั้งแพ็กเกจด้วย `npm install`
2. คัดลอก `.dev.vars.example` เป็น `.dev.vars` แล้วใส่ค่า Google OAuth และ secret สำหรับเครื่องที่ใช้พัฒนา
3. สร้างชนิดข้อมูล binding ใหม่ด้วย `npm run types`
4. เตรียม D1 ในเครื่องด้วย `npm run db:migrate:local`
5. เปิดเว็บด้วย `npm run dev` ที่ `http://localhost:4321`

ตั้ง Google OAuth redirect URI สำหรับเครื่องพัฒนาเป็น `http://localhost:4321/api/auth/callback/google` ค่า `SITE_URL` อยู่ใน `wrangler.jsonc` และต้องตรงกับ URL ที่เปิดเว็บ

ฐานข้อมูล local และไฟล์ `.dev.vars` ถูกละเว้นโดย Git ค่า `database_id` ใน `wrangler.jsonc` เป็น placeholder สำหรับพัฒนาในเครื่อง ก่อน deploy ให้สร้าง D1 จริงแล้วแทนค่าดังกล่าว ตั้ง `SITE_URL` เป็น URL ของ Worker และตั้ง `IMAGE_BASE_URL` เป็น URL ของ R2 public bucket ทั้งใน `wrangler.jsonc` และ environment ตอน build

## คำสั่ง

| คำสั่ง | งาน |
| --- | --- |
| `npm run dev` | เปิดเว็บในเครื่อง |
| `npm run build` | สร้าง Worker และ static assets |
| `npm run preview` | ดูผล build ในเครื่อง |
| `npm run check` | ตรวจชนิดข้อมูล Astro และ TypeScript |
| `npm run lint` | ตรวจ ESLint |
| `npm test` | รัน unit tests ใน Node.js |
| `npm run test:int` | รัน integration tests ใน workerd พร้อม D1/R2 จำลอง |
| `npm run test:e2e` | รัน Playwright บนเว็บในเครื่อง |
| `npm run db:generate` | สร้าง SQL migration จาก Drizzle schema |

การทดสอบ E2E ต้องติดตั้ง Chromium ของ Playwright ด้วย `npx playwright install chromium` ก่อนใช้ครั้งแรก
