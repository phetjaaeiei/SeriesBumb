# สำรองและกู้คืนข้อมูล (ฟรีทั้งหมด)

การสำรองข้อมูลมี 3 ชั้น ให้เลือกใช้ชั้นที่เร็วที่สุดที่ยังมีข้อมูลที่ต้องการ

| ชั้น | ครอบคลุม | อายุ | เปิดอยู่ไหม |
| --- | --- | --- | --- |
| D1 Time Travel | ทั้งฐาน ย้อนได้ถึงระดับนาที | 7 วัน | เปิดเสมอ (Cloudflare) |
| Export รายคืนแบบเข้ารหัส (`.github/workflows/backup.yml`) | ข้อมูลทุกตาราง ยกเว้น session, verification และดัชนีค้นหา | 30 วัน (GitHub artifact) | ปิดจนกว่าจะตั้งค่าตามข้อ 1 |
| สำรองไฟล์ Supabase (`npm run backup:storage`) | รูปภาพ (public) และไฟล์เพลง (private) | ตามที่เก็บไว้ในเครื่อง | เจ้าของรันเองเดือนละครั้ง |

`scripts/deploy.ts` จด bookmark ของ Time Travel ไว้ใน `.deploys/` ก่อน apply migration ทุกครั้ง จึงย้อนกลับไปก่อน deploy ใด ๆ ได้ภายใน 7 วัน

## 1. เปิด export รายคืน

1. ติดตั้ง age บนเครื่องของเจ้าของ (`brew install age`) แล้วสร้างกุญแจ:
   ```bash
   mkdir -p ~/.config/seriesbumb && age-keygen -o ~/.config/seriesbumb/backup-age.key
   ```
   ไฟล์นี้คือกุญแจถอดรหัส ให้เก็บสำเนาไว้ 2 ที่ (password manager และที่เก็บ offline) ห้ามใส่ใน GitHub หรือ Cloudflare ส่วนบรรทัด `# public key: age1…` ในไฟล์คือ public key
2. Cloudflare dashboard → My Profile → API Tokens → Create Token → Custom token:
   - Permissions: **Account › D1 › Edit** (`wrangler d1 export` ต้องใช้สิทธิ์นี้)
   - Account Resources: เฉพาะ account ของ SeriesBumb
   - ตั้งวันหมดอายุ 1 ปี แล้วลงปฏิทินเตือนให้ต่ออายุ
3. GitHub → repo → Settings → Secrets and variables → Actions:
   - Secret `CLOUDFLARE_API_TOKEN` = token จากข้อ 2
   - Variable `CLOUDFLARE_ACCOUNT_ID` = Account ID (ดูได้ที่หน้า Workers & Pages)
   - Variable `BACKUP_AGE_RECIPIENT` = public key `age1…` จากข้อ 1
4. Actions → **Nightly D1 backup** → Run workflow แล้วตรวจว่ามี artifact `seriesbumb-d1-backup` หลังจากนั้นจะรันทุกคืนเวลา 02:40 น.

repo นี้เป็น public ใครที่ login GitHub ก็ดาวน์โหลด artifact ได้ ไฟล์จึงถูกเข้ารหัสด้วย age ตั้งแต่ยังอยู่บน runner และลบไฟล์ที่ยังไม่เข้ารหัสทิ้งก่อนอัปโหลด

ปิด: ลบ variable `BACKUP_AGE_RECIPIENT` ได้เลย workflow จะรายงานว่าปิดอยู่และหยุดโดยไม่ export

## 2. ดาวน์โหลดและถอดรหัส

```bash
gh run list --repo phetjaaeiei/SeriesBumb --workflow backup.yml --limit 5
gh run download <run-id> --repo phetjaaeiei/SeriesBumb -n seriesbumb-d1-backup -D ~/SeriesBumb-backups/d1
mkdir -p ~/SeriesBumb-backups/d1/restore
age -d -i ~/.config/seriesbumb/backup-age.key ~/SeriesBumb-backups/d1/seriesbumb-d1-YYYY-MM-DD.tar.age | tar -x -C ~/SeriesBumb-backups/d1/restore
```

ในไฟล์จะมี `seriesbumb-YYYY-MM-DD.sql` (INSERT เท่านั้น ไม่มี schema) กับ `.manifest.json` (จำนวนแถวของแต่ละตารางและ SHA-256)

## 3. กู้คืน

### ข้อมูลเสียไม่เกิน 7 วัน: Time Travel (เร็วที่สุด)

```bash
npx wrangler d1 time-travel info seriesbumb --timestamp 2026-09-28T10:00:00+07:00
npx wrangler d1 time-travel restore seriesbumb --bookmark <bookmark>
```

คำสั่งนี้เขียนทับทั้งฐาน ข้อมูลที่เขียนหลังเวลานั้นจะหายหมด จึงควรปิดการเขียนก่อน (เช่น deploy รุ่นที่ปิดฟอร์ม หรือแจ้งผู้ใช้) แล้วตรวจหน้าเว็บ และถ้าต้องการ ให้ bookmark ที่ restore คืนมาเพื่อย้อนการ restore ได้

### เกิน 7 วัน หรือฐานหายทั้งฐาน: ใช้ export

ให้ restore ลงฐานใหม่ก่อนเสมอ แล้วจึงสลับ binding
1. `npx wrangler d1 create seriesbumb-restore`
2. ใส่ฐานใหม่ใน `wrangler.jsonc` แล้วรัน `npx wrangler d1 migrations apply seriesbumb-restore --remote`
3. นำข้อมูลเข้า โดยสคริปต์จะตรวจ checksum, ไม่ยอมเขียนทับฐานที่มีข้อมูล และตรวจจำนวนแถวหลังนำเข้า:
   ```bash
   npm run restore:export -- --database seriesbumb-restore --remote --file ~/SeriesBumb-backups/d1/restore/seriesbumb-YYYY-MM-DD.sql
   ```
4. เปลี่ยน `database_id` ของ binding `DB` ใน `wrangler.jsonc` เป็นฐานใหม่ แล้วทำ branch + PR ตามปกติ จากนั้น deploy staging → prod
5. เปิด `/admin` แล้วกด "สร้างดัชนีใหม่ทั้งหมด" เพราะดัชนีค้นหาไม่ได้อยู่ใน backup
6. สมาชิกต้อง login ใหม่ เพราะไม่มีการสำรอง session

### ซ้อมกู้คืน (ทำทุก 3 เดือน)

ซ้อมบนเครื่องได้โดยไม่แตะ production:
```bash
npx wrangler d1 migrations apply seriesbumb --local --persist-to /tmp/restore-drill
npm run restore:export -- --database seriesbumb --local --persist-to /tmp/restore-drill --file <dump.sql>
```

## 4. สำรองไฟล์ Supabase

ใช้ secret key ของ Supabase จาก dashboard (Project Settings → API Keys) ผ่านตัวแปรในเทอร์มินัลเท่านั้น ห้ามบันทึกลงไฟล์ใน repo
```bash
export SUPABASE_URL=https://<project>.supabase.co
read -rs SUPABASE_SECRET_KEY && export SUPABASE_SECRET_KEY
npm run backup:storage -- --out ~/SeriesBumb-backups/storage --bucket SeriesBumbImages --bucket SeriesBumb --dry-run
npm run backup:storage -- --out ~/SeriesBumb-backups/storage --bucket SeriesBumbImages --bucket SeriesBumb
```
- `--dry-run` บอกจำนวนไฟล์และขนาดที่จะดาวน์โหลด ซึ่งนับรวมใน egress ของ Supabase (ฟรี 5 GB/เดือน)
- รอบต่อไปจะดาวน์โหลดเฉพาะไฟล์ใหม่หรือไฟล์ที่เปลี่ยน และ `manifest.json` ในแต่ละ bucket เก็บ SHA-256 ของทุกไฟล์
- ถ้าต้องกู้ไฟล์คืน ให้อัปโหลดกลับด้วย Supabase dashboard หรือ CLI ตาม path เดิม (key ใน D1 อ้างถึง path เหล่านี้)

## 5. ความปลอดภัยและ PDPA

- backup มีชื่อและอีเมลของสมาชิก จึงต้องเก็บแบบเข้ารหัสเสมอ ห้ามแชร์ และลบทิ้งเมื่อไม่จำเป็น artifact บน GitHub หมดอายุเองใน 30 วัน
- ไม่มี session, OAuth state, provider token หรือรหัสผ่านอยู่ใน backup และถ้าตาราง `account` ยังมี token ค้างอยู่ สคริปต์จะไม่ยอม export
- ถ้ากุญแจ age หลุด ให้สร้างกุญแจใหม่ เปลี่ยน `BACKUP_AGE_RECIPIENT` และลบ artifact เก่าใน Actions
- ถ้า Cloudflare API token หลุด ให้ revoke ใน dashboard ทันที แล้วสร้างใหม่ตามข้อ 1.2
