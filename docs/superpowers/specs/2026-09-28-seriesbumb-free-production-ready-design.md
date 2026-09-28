# SeriesBumb: Free-tier production-ready demo

**สถานะ:** อนุมัติแล้ว (2026-09-28)
**ขอบเขต:** ทำให้เว็บที่ใช้งานอยู่ (`https://seriesbumb.phetjaa.workers.dev`) พร้อมใช้งานระยะยาวทุกด้าน โดยใช้บริการฟรีทั้งหมด และทำให้การจดโดเมน ย้าย storage หรือย้ายฐานข้อมูลในอนาคตเป็นการเปลี่ยน config มากกว่าการเขียนโค้ดใหม่

## 1. การตัดสินใจที่ได้รับอนุมัติ

| หัวข้อ | ตัดสินใจ |
| --- | --- |
| Deploy | Claude deploy เองทุกเฟส: staging ก่อน แล้ว production จาก worktree ที่สะอาด จด D1 Time Travel bookmark ก่อน apply migration ทุกครั้ง |
| Git | 1 เฟส = 1 branch ใน worktree แยก → PR → CI ผ่าน → merge เข้า `main` |
| โครงสร้างโค้ด | ปรับครบทุกชั้น (config, platform, repositories, services, loaders, errors, http) และย้าย SQL ออกจากหน้าเว็บทั้งหมด |
| บริการที่ต้องสมัครเอง | เขียนโค้ดรองรับไว้แต่ปิดด้วย flag และให้ checklist เปิดใช้ทีหลัง |
| ค่าใช้จ่าย | $0 ต่อเดือน ห้ามเพิ่มบริการที่ต้องผูกบัตรหรือเก็บเงินอัตโนมัติ |

## 2. ข้อจำกัดของ free tier ที่ดีไซน์ต้องเคารพ

- Workers Free: 100,000 requests/วัน, CPU 10 ms/invocation, Cron Triggers 5 ตัวต่อ account
- D1 Free: 5M rows read/วัน, 100k rows written/วัน, ฐานละ 500 MB, Time Travel 7 วัน, สร้างได้ 10 ฐาน
- Supabase Free: 2 projects, storage 1 GB/project, egress 5 GB/เดือน, ไฟล์ละ 50 MB, pause เมื่อไม่มี activity 1 สัปดาห์
- workers.dev ไม่ใช่ zone ของเจ้าของ จึงใช้ WAF/Rate limiting rules ของ zone ไม่ได้ การป้องกันต้องอยู่ในโค้ด
- GitHub repo `phetjaaeiei/SeriesBumb` เป็น public: Actions ไม่จำกัดนาที, secret scanning, Dependabot และ rulesets ใช้ได้ฟรี
- มีหลาย session (Claude/Codex) commit เข้า `main` พร้อมกัน ห้ามเปิด branch protection บน `main` จนกว่าเจ้าของจะสั่ง

## 3. สถาปัตยกรรมเป้าหมาย

```
src/
├─ config/        zod schema ของ env, getConfig() แบบ memoized, typed flags
├─ platform/      ที่เดียวที่ import 'cloudflare:*' ได้: runtime (db, config, background, rateLimit)
├─ db/            schema.ts, enums.ts, SqlClient interface, drizzle (เฉพาะ better-auth)
├─ domain/        pure functions: thai, search-normalize, slug, cursor, permissions, format, urls
├─ repositories/  SQL ทั้งหมด แยกไฟล์ตาม aggregate (search.repo.ts เป็นเจ้าของ FTS5 ที่เดียว)
├─ services/      use case ฝั่งเขียน: invariant, batch, storage calls — ไม่มี SQL string
├─ loaders/       read model ต่อหน้า: เพจ .astro เรียก loader ตัวเดียว
├─ storage/       ports (ImageStore, AudioStore) + adapters (supabase) แยก config รูป/เสียง
├─ errors/        AppError taxonomy เดียว + mapping ไป ActionError / JSON Response
├─ http/          middleware, cache policy, admin-route guard, canonical host
├─ auth/          better-auth factory, admin emails
├─ actions/       define.ts + แยกไฟล์ตามโดเมน, index.ts รวม namespace
└─ worker.ts      entry ของ Worker: fetch = Astro handler, scheduled = งานรายวัน
```

กฎขอบเขต (บังคับด้วย ESLint `no-restricted-imports`):
- `pages/`, `components/`, `actions/` ห้าม import `cloudflare:workers`, `db/*` หรือ `repositories/*` โดยตรง
- `repositories/` ห้าม import `astro:*`
- `domain/` ห้าม import อะไรนอก `domain/`

## 4. Config และความพร้อมย้ายโดเมน

- ค่าทุกตัวผ่าน `src/config/env.schema.ts` (zod) ครั้งเดียวตอนรับ request แรก ถ้าไม่ผ่านให้ fail fast ด้วย log บรรทัดเดียว
- `SITE_URL` เป็นแหล่งเดียวของ canonical URL, trustedOrigins ของ better-auth, Origin check และ OAuth callback
- `CANONICAL_HOST_REDIRECT` (flag): ถ้าเปิดและ host ของ request ไม่ตรงกับ `SITE_URL` ให้ 301 ไป `SITE_URL` (ใช้ตอนผูกโดเมนจริงแล้ว เพื่อให้ workers.dev ย้ายตามอัตโนมัติ)
- CSP origins คำนวณจาก config เดียวกัน (build-time จาก `wrangler.jsonc` ตามเดิม)
- Storage แยก config: `IMAGE_STORE` / `AUDIO_STORE` (ตอนนี้ `supabase`), `SUPABASE_IMAGE_URL`/`SUPABASE_AUDIO_URL` (ค่าเริ่มต้นเท่ากับ `SUPABASE_URL`) เพื่อแยกเป็น 2 projects หรือเปลี่ยน provider ได้โดยไม่แตะโค้ดส่วนอื่น

## 5. Environments และการ deploy

| Env | Worker | D1 | หมายเหตุ |
| --- | --- | --- | --- |
| local | `astro dev` | local D1 ใน `.wrangler/` ของแต่ละ worktree | `.dev.vars` |
| staging | `seriesbumb-staging` (workers.dev) | `seriesbumb-staging` | ปิดอัปโหลดรูป/เสียง, อ่านรูปจาก bucket production ได้, seed ข้อมูลตัวอย่าง |
| production | `seriesbumb` | `seriesbumb` | ค่าเดิม |

- `npm run deploy:staging` และ `npm run deploy:prod` ครอบขั้นตอน: build ด้วย `CLOUDFLARE_ENV`, จด bookmark (`wrangler d1 time-travel info`), `wrangler d1 migrations apply --remote`, deploy
- Preview URL ของ Worker production ใช้ binding ของ production จึงห้ามใช้ทดสอบโค้ดที่เขียน DB

## 6. Security (ทำได้ฟรีในโค้ด)

**เฟส 1**
1. `safeNextPath` ปฏิเสธผลลัพธ์ที่ขึ้นต้นด้วย `//` หรือมี `\` / control characters
2. `/api/auth/*` allowlist เฉพาะ `sign-in/social`, `callback/google`, `get-session`, `sign-out`; `account.storeStateStrategy: 'cookie'`; ตั้ง `advanced.ipAddress.ipAddressHeaders: ['cf-connecting-ip']`
3. Rate limit ในโค้ดผ่าน port `RateLimiter` (adapter หลัก: Workers Rate Limiting binding; fallback: ตัวนับใน D1) ใช้กับ auth sign-in (ต่อ IP), engagement, comments, reviews/corrections (ต่อ user)
4. Engagement: ข้ามการอัปเดตตัวนับเมื่อแถวไม่เปลี่ยน และใช้ `±1`
5. Headers: `Permissions-Policy`, `Cross-Origin-Opener-Policy`, `Strict-Transport-Security`; CSP เพิ่ม `form-action`, `frame-ancestors 'none'`; `public/_headers` สำหรับ static assets
6. `Cache-Control: private, no-store` + `Vary: Cookie` เมื่อมี session หรือ path ส่วนตัว
7. `AdminLayout` ตรวจ role ซ้ำ (defense in depth)
8. ตรวจ `imageKey`/`logoKey`/`coverKey` ตาม prefix ของ entity และลบไฟล์เฉพาะ key ที่ entity อ้างอยู่จริง
9. ไม่เก็บ Google OAuth tokens (ล้างใน hook + migration ล้างแถวเดิม) และ backup ไม่รวม `session`, `verification`, token

**เฟส 2**
1. ตาราง `audit_log` บันทึกทุก admin action ที่เปลี่ยนข้อมูล การเปลี่ยน role และการลบ พร้อมหน้า `/admin/audit` แบบอ่านอย่างเดียว
2. ตั้ง/ถอดแอดมินได้เฉพาะอีเมลใน `ADMIN_EMAILS`
3. Session แอดมินอายุสูงสุด 12 ชม. และ action ที่ลบข้อมูลต้องใช้ session ที่สร้างไม่เกิน 15 นาที
4. `ACCESS_TEAM_DOMAIN` + `ACCESS_AUD` (flag): ตรวจ `Cf-Access-Jwt-Assertion` ของ Cloudflare Access บน `/admin*` และ `/_actions/admin.*` เมื่อเปิด
5. `TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY` (flag): ตรวจ Turnstile ที่ login, คอมเมนต์, รีวิว, ข้อเสนอแก้ข้อมูลเมื่อเปิด

## 7. ประสิทธิภาพ (เฟส 3)

- ทุก loader มี budget test: seed ข้อมูลขนาดกลาง แล้วรวม `meta.rows_read` ต่อหน้า และห้าม `SCAN` ตารางหลักใน `EXPLAIN QUERY PLAN`
- แก้จุดร้อนที่พบใน audit: `COUNT(*)` เพลงในหน้าแรก, `/songs` ไม่มี index `titleSort`, ตัวกรองศิลปิน/แนวเพลงแบบ `EXISTS`, `similarArtists`, related tapes, ค่าเริ่มต้นของ advanced search, `/artists/random` แบบ OFFSET, cursor ของ reindex, `audioUsage` ที่ GROUP BY ทั้งตาราง, `saveTape` ที่ลบแล้ว insert ใหม่ทุกครั้ง, session lookup ซ้ำใน middleware

## 8. Ops (เฟส 4)

- `src/worker.ts` เพิ่ม `scheduled` (cron รายวัน 1 ตัว): ลบ session/verification ที่หมดอายุ, ทำ reindex ต่อ, ping Supabase กัน pause, บันทึกสรุปความผิดปกติลง log
- `/api/health`: D1 `SELECT 1` และสถานะ config (ไม่เปิดเผย secret)
- GitHub Actions `backup.yml` รายคืน: export D1 (ไม่รวมตารางชั่วคราวและ token) → เข้ารหัสด้วย `age` public key → artifact อายุ 30 วัน ทำงานเมื่อมี secret `CLOUDFLARE_API_TOKEN` เท่านั้น
- `scripts/backup-storage.ts`: ดาวน์โหลดไฟล์ทั้งสอง bucket ลงโฟลเดอร์ในเครื่องพร้อม checksum
- ปลดระวาง Firebase: ยืนยันใน D1 ว่าไม่มีข้อมูลที่อ้าง Firebase แล้วลบโค้ด, flags, secret และ `storage.rules`

## 9. PDPA และ SEO (เฟส 5)

- `/privacy` และ `/terms` ภาษาไทย ลิงก์จาก footer และหน้า login
- `/me`: export ข้อมูลของตัวเองเป็น JSON และลบบัญชี (ต้องใช้ fresh session) โดยคอมเมนต์และรีวิวแสดงเป็น "ผู้ใช้ที่ลบบัญชีแล้ว"
- `sitemap.xml` (เฉพาะรายการที่เผยแพร่ แบ่งตามชนิด) + บรรทัด `Sitemap:` ใน robots.txt
- JSON-LD `MusicAlbum` (หน้าเทป) และ `MusicGroup`/`Person` (หน้าศิลปิน)

## 10. พร้อมย้าย (เฟส 6)

- Canonical host redirect (ข้อ 4) และ storage config แยก (ข้อ 4)
- `docs/runbooks/`: switch-domain, move-storage, backup-restore, rotate-secrets, incident-response, pdpa-breach
- `docs/adr/0001-free-tier-platform.md` บันทึกเหตุผลและเงื่อนไขที่จะขยับไปแผนเสียเงิน

## 11. การทดสอบ

- CI บนทุก PR: `npm ci`, lint (รวมกฎขอบเขต), `astro check`, unit, integration (workerd + D1 + migrations จริง), budget tests, build, `npm audit --omit=dev --audit-level=high`, gitleaks, ตรวจ migration กับ journal
- ทุกการแก้ security มี test ที่ล้มก่อนแก้
- E2E smoke (Playwright) บน staging หลัง deploy: หน้า public, `/admin` ต้องได้ 403/redirect, ไม่มี CSP error ใน console

## 12. นอกขอบเขต

Custom domain, WAF/rate limiting rules ระดับ zone, Workers Paid, R2, Supabase Pro, Cloudflare Images และ branch protection บน `main`

## 13. Checklist ของเจ้าของ (ทำทีหลังได้)

1. เพิ่ม OAuth redirect URI ของ staging ใน Google Cloud Console
2. สร้าง Turnstile widget แล้วใส่ `TURNSTILE_SITE_KEY`/`TURNSTILE_SECRET_KEY`
3. เปิด Cloudflare Zero Trust Free แล้วสร้าง Access application ครอบหน้าแอดมิน แล้วใส่ `ACCESS_TEAM_DOMAIN`/`ACCESS_AUD`
4. สมัคร UptimeRobot Free แล้วตั้ง monitor ที่ `/` และ `/api/health`
5. สร้าง Cloudflare API token (D1 read) และ `age` key pair แล้วใส่ใน GitHub secrets เพื่อเปิด backup อัตโนมัติ
6. ปิด billing ของ GCP project `seriesbumb-32f9e` หลังปลดระวาง Firebase
7. เมื่อ session อื่นเปลี่ยนมาใช้ PR แล้ว ค่อยเปิด ruleset บน `main`
