# SeriesBumb — คลังเทปเพลงไทย (Design Spec)

- วันที่: 2026-09-25 (ฉบับที่ 3 — สไตล์สารานุกรม + แก้ตามรีวิว 4 มุมมอง และตรวจความสอดคล้องรอบสุดท้าย)
- สถานะ: รอผู้ใช้ตรวจ
- เพจต้นทาง: https://www.facebook.com/seriesbumbs/ ("ซีรี่ย์บั้ม เทปเพลง", ~32K followers, อยู่หล่มสัก)
- อ้างอิงสไตล์: Encyclopaedia Metallum (metal-archives.com) แบบเรียบง่ายและสบายตากว่า
- mockup ที่ผู้ใช้อนุมัติ: [assets/2026-09-25-artist-mockup.html](assets/2026-09-25-artist-mockup.html) (อ้างอิงเท่านั้น ค่าที่ใช้จริงอยู่ในข้อ 9)

## 1. เป้าหมายและขอบเขต

เว็บไซต์ประจำเพจ "ซีรี่ย์บั้ม เทปเพลง" เป็นคลังข้อมูลตลับเทปเพลงไทยยุคเก่า (เน้น 80s–2000s) ในรูปแบบสารานุกรม

- คนทั่วไปค้นหาและดูข้อมูลเทป เพลง ศิลปิน และค่ายได้
- แอดมินเพิ่มและจัดการข้อมูล จัดหมวดหมู่ จัด Collection และอัพโหลดรูป
- สมาชิก login ด้วย Google เพื่อกดถูกใจ บอกว่ามีเทป และคอมเมนต์

**ข้อจำกัดหลัก**

- ใช้บริการฟรีทั้งหมด (Cloudflare free plan) ไม่ต้องซื้อโดเมนก็ใช้งานได้ (ข้อควรรู้เรื่อง R2 ดูข้อ 7)
- เก็บรูปได้มากที่สุดเท่าที่แพ็กเกจฟรีรองรับ
- ลิงก์ที่แชร์ลง Facebook ต้องแสดงรูปปกและชื่อ (render ฝั่งเซิร์ฟเวอร์ + OG tags)
- UI ภาษาไทย สไตล์ "คลังเทปแบบสารานุกรม" โทนมืดเรียบ (ข้อ 9) ธีมเดียว

**ไม่อยู่ในขอบเขต (YAGNI)**

- เล่นเสียง/ฝังวิดีโอ (แสดงข้อมูลอย่างเดียว มีแค่ลิงก์ไป Reel ของเพจ)
- สมาชิกส่งข้อมูลเทปให้แอดมินอนุมัติ, แก้โปรไฟล์, ลบบัญชีผู้ใช้
- คอมเมนต์บนหน้าศิลปิน/ค่าย (มีเฉพาะเทปและเพลง), คอมเมนต์แบบเธรด, แก้ไขคอมเมนต์, การแจ้งเตือน
- หน้าบุคคลแยก (สมาชิกวงเป็นรายชื่อในหน้าวงเท่านั้น)
- View Transitions / client-side router (เปลี่ยนหน้าแบบโหลดปกติ)
- UI ภาษาอังกฤษ, ธีมสว่าง/สลับธีม, ระบบขายของ

## 2. ผู้ใช้และสิทธิ์

| ความสามารถ | ผู้ชมทั่วไป | สมาชิก (Google) | แอดมิน |
|---|---|---|---|
| ดูทุกหน้าสาธารณะ, ค้นหา, อ่านคอมเมนต์ทั้งหมด | ✓ | ✓ | ✓ |
| ถูกใจเทป/เพลง, "ฉันมีเทปนี้", หน้า `/me` | | ✓ | ✓ |
| คอมเมนต์, ลบคอมเมนต์ของตัวเอง | | ✓ (ถ้าไม่ถูกแบน) | ✓ (ไม่ติด rate limit) |
| หลังบ้าน `/admin` ทั้งหมด, ดูรายการที่ยังไม่เผยแพร่ | | | ✓ |

**สมาชิก**

- สมัครอัตโนมัติเมื่อ login Google ครั้งแรก (role = `member`)
- ชื่อและรูปมาจาก Google ตอนสมัครเท่านั้น

**แอดมินตั้งต้นจาก env `ADMIN_EMAILS`** (คั่นด้วย comma)

- **การ parse:** ฟังก์ชันเดียว `parseAdminEmails()`: `split(',')` → `trim()` → `toLowerCase()` → ตัดค่าว่าง แล้วเทียบแบบเท่ากันทั้งสตริงกับอีเมลตัวพิมพ์เล็ก
  - ห้ามใช้ `includes()` บนสตริงดิบ เพราะ `admin@gmail.com` จะไปตรงกับ `shop.admin@gmail.com`
- **การยกระดับ:** ทำใน `databaseHooks.session.create.after` เท่านั้น (ทำงานทั้งตอนสมัครครั้งแรกและทุก login):
  ```sql
  UPDATE user SET role = 'admin'
  WHERE id = :userId AND emailVerified = 1 AND lower(email) IN (:adminEmails) AND role <> 'admin'
  ```
- เอาอีเมลออกจาก `ADMIN_EMAILS` แล้วสิทธิ์ไม่ถูกถอดอัตโนมัติ ต้องถอดเองที่ `/admin/users`

**การจัดการแอดมินและการแบน**

- แอดมินแต่งตั้ง/ถอดแอดมินคนอื่นได้ที่ `/admin/users`
  - ถอดสิทธิ์ตัวเองไม่ได้
  - ถอดคนที่อยู่ใน `ADMIN_EMAILS` ไม่ได้ (ใช้ `parseAdminEmails()` ตัวเดียวกัน)
- **แบนคอมเมนต์** (`commentBanned`) ห้ามแค่คอมเมนต์ ส่วนถูกใจ/มีเทปยังทำได้
  - แบนแอดมินไม่ได้ ต้องถอดแอดมินก่อน
- **ไม่เปิด `session.cookieCache` ของ Better Auth:** `requireAdmin` / `canComment` อ่าน role และ commentBanned ล่าสุดจาก DB ทุก request ถอดแอดมินหรือแบนแล้วจึงมีผลทันที

## 3. โมเดลข้อมูล (D1 / SQLite ผ่าน Drizzle)

- ID ทุกตาราง (ยกเว้น `search_doc`) เป็น text (`crypto.randomUUID()`)
- เวลาเป็น integer (unix ms)
- `updatedAt` / `updatedBy` เปลี่ยนเฉพาะตอนแอดมินแก้ข้อมูล
  - ห้ามใช้ `$onUpdate` อัตโนมัติ เพราะการอัพเดทตัวนับจะไปแตะ updatedAt ทำให้ลำดับ "แก้ไขล่าสุด" ผิด

### 3.1 ผู้ใช้ (ตารางของ Better Auth)

- **`user`:** ฟิลด์มาตรฐาน + `role` (`member` | `admin`, default `member`) + `commentBanned` (boolean, default false) ผ่าน `user.additionalFields`
  - **ทั้งสองฟิลด์ตั้ง `input: false`** ไม่อย่างนั้นสมาชิกส่ง `{ role: 'admin' }` ผ่าน endpoint update-user แล้วกลายเป็นแอดมินได้
  - ค่าเหล่านี้เปลี่ยนได้จากโค้ดฝั่งเซิร์ฟเวอร์เท่านั้น (hook ในข้อ 2 และ admin actions ที่เขียนผ่าน Drizzle)
- **`session`, `account`, `verification`:** ตามมาตรฐาน Better Auth
  - สร้าง schema ด้วย `npx auth@latest generate` แล้วรวมเข้า `db/schema.ts`

### 3.2 แคตตาล็อก

**`artist`**

- id, slug (unique), name, nameAlt (ชื่ออื่น/ภาษาอังกฤษ), nameSort (ข้อ 6.4)
- artistType? — `band` (วงดนตรี) | `solo` (ศิลปินเดี่ยว) | `group` (ดูโอ/กลุ่มนักร้อง) | NULL (ไม่ระบุ แสดง "—")
- status — `active` | `inactive` | `hiatus` | `deceased` | `unknown` (NOT NULL, default `unknown`) การแสดงผลดูข้อ 4.3
- province? — ชื่อจังหวัดภาษาไทยตาม `src/lib/provinces.ts` (77 จังหวัด + "ต่างประเทศ", ตรวจด้วย `z.enum`) หรือ NULL
- yearsActive? (ข้อความ ≤100 เช่น "1994–2003, 2015–2018")
- bio, imageKey?, imageBytes (integer, default 0)
- publishedTapeCount (ข้อ 3.4)
- createdBy?, createdAt, updatedBy?, updatedAt

**`artist_member`** (รายชื่อสมาชิกวง ไม่มีหน้าบุคคลแยก)

- id, artistId, name, role (ข้อความ เช่น "ร้องนำ, กีตาร์"), years?, isCurrent (boolean), position

**`label`** (ค่ายเพลง)

- id, slug (unique), name, nameAlt, nameSort, description
- logoKey?, imageBytes, publishedTapeCount
- createdBy?, createdAt, updatedBy?, updatedAt

**`genre`**

- id, slug (unique), name, position (แอดมินลากเรียง), publishedTapeCount

**`tape`**

- **ตัวตน:** id, slug (unique), slugLocked (boolean — true เมื่อแอดมินแก้ slug เอง), title, titleAlt, titleSort
- **ค่าย:** labelId? → label
- **ปี:** year? (ค.ศ.) — ถ้าแอดมินกรอกค่า > 2400 ถือเป็น พ.ศ. แล้วลบ 543 ให้อัตโนมัติ
  - yearSort (integer NOT NULL = year ?? 9999)
  - decade? (= floor(year/10)*10)
- **ข้อมูลเทป:**
  - releaseType: `album` | `compilation` | `soundtrack` | `single` | `other`
  - catalogNo? (รหัสตลับ), description (plain text), reelUrl? (กฎตรวจดูข้อ 8), isRare (boolean)
- **การเผยแพร่:** status: `draft` | `published`, publishedAt? (ตั้งครั้งแรกที่เผยแพร่ ไม่เปลี่ยนอีก)
- **ปก (denormalized ให้กริดไม่ต้อง join `tape_image`):** coverImageId?, coverThumbKey?
- **รูป OG (เป็นของเทป ข้อ 5.3):** ogImageKey?, ogImageBytes (integer, default 0), ogSourceImageId?, ogSourceTitle?
- **ตัวนับ (denormalized ข้อ 3.3):** likeCount, ownerCount, commentCount
- createdBy?, createdAt, updatedBy?, updatedAt

**ความสัมพันธ์ของเทป**

- **`tape_artist`**: tapeId, artistId, position, isPublished (0/1), yearSort — PK (tapeId, artistId)
  - ศิลปินลำดับแรกคือ**ศิลปินหลัก**
  - ถ้าเทปไม่มีแถวใน `tape_artist` เลย แสดงเป็น "รวมศิลปิน" (ตัดสินจากข้อมูล ไม่ใช่จาก releaseType เพราะเทปรวมฮิตของศิลปินคนเดียวมีเยอะ)
- **`tape_genre`**: tapeId, genreId, isPublished (0/1), publishedAt? — PK (tapeId, genreId)
- ค่า isPublished / yearSort / publishedAt ในสองตารางนี้คัดลอกจาก tape ใน batch เดียวกับการบันทึก/เผยแพร่/ยกเลิกเผยแพร่ เพื่อให้หน้าศิลปินและหน้าแนวเพลงใช้ index ได้
- **`tape_image`**: id, tapeId, kind (`front` | `back` | `inside` | `cassette` | `other`), fullKey, thumbKey, width, height, bytes (full+thumb), position
  - **ปกหลัก** = รูป `front` ที่ position น้อยที่สุด ถ้าไม่มีใช้รูปที่ position น้อยที่สุด

**`song`** = การบันทึกเสียงหนึ่งชิ้นของผู้ร้องชุดหนึ่ง

- ชื่อเดียวกันแต่คนร้องต่างกัน (cover) เป็นคนละ `song`
- เพลงเดียวกันที่อยู่ทั้งในอัลบั้มจริงและเทปรวมฮิตเป็น `song` เดียว
- ฟิลด์: id, slug (unique), title, titleAlt, titleSort, lyricist?, composer?, arranger?, notes?
- lyrics? — ไม่บังคับ ลิขสิทธิ์เป็นของค่าย แอดมินเลือกเอง
- likeCount, commentCount, publishedTapeCount
- createdBy?, createdAt, updatedBy?, updatedAt

**ความสัมพันธ์ของเพลง**

- **`song_artist`**: songId, artistId, position — PK (songId, artistId)
  - เก็บผู้ร้องของเพลงในระดับเพลง ใช้ร่วมทุกเทป
- **`tape_track`**: id, tapeId, songId, side (`A` | `B` | `C` | `D` — C/D สำหรับเทปชุด 2 ม้วน), position (≥1), durationSec?, note?
  - note ใช้กับ "ดนตรี", "Remix", "Live" แสดงต่อท้ายชื่อเพลง แทนการสร้างเพลงปลอมสำหรับเวอร์ชันดนตรี
  - unique (tapeId, side, position)
  - เพลงเดียวกันอยู่ในเทปเดียวกันได้หลายแถว

**Collection**

- **`collection`**: id, slug (unique), title, description, coverKey?, imageBytes, isFeatured, position, status (`draft` | `published`), createdBy?, createdAt, updatedBy?, updatedAt
- **`collection_item`**: collectionId, tapeId, position, note? — PK (collectionId, tapeId)

**ตารางระบบ**

- **`site_stats`** (แถวเดียว id = 1)
  - ตัวเลขสถิติ: tapeCount, publishedTapeCount, songCount, userCount, imageBytes
  - สถานะงานสร้างดัชนีใหม่ (ข้อ 3.5): reindexCursor (text? — JSON `{kind, afterId}`; NULL = ไม่มีงานค้าง), reindexDay (text `YYYY-MM-DD` UTC), reindexRowsWritten (integer รีเซ็ตเมื่อ reindexDay เปลี่ยน)
  - updatedAt
  - อัพเดทแบบบวก/ลบใน batch เดียวกับการสร้าง/ลบเทป เพลง รูปทุกชนิด และการเผยแพร่/ยกเลิก
  - userCount อัพเดทใน `databaseHooks.user.create.after`
  - `/admin` และหน้าแรกอ่านแถวนี้แถวเดียว ห้าม `COUNT(*)`/`SUM()` ทั้งตาราง
- **`search_queue`**: kind, refId — PK (kind, refId) — รายการที่ต้อง reindex ต่อ (ข้อ 3.5)

### 3.3 การมีส่วนร่วมของสมาชิก

**ตาราง**

- **`tape_like`**: userId, tapeId, createdAt — PK (userId, tapeId)
- **`song_like`**: userId, songId, createdAt — PK (userId, songId)
- **`tape_owner`**: userId, tapeId, createdAt — PK (userId, tapeId)
- **`comment`**: id, userId, tapeId?, songId?, body (1–1000 ตัวอักษรหลัง normalize), createdAt, deletedAt?, deletedBy?
  - CHECK: มี tapeId หรือ songId อย่างใดอย่างหนึ่งเท่านั้น
  - ลบแบบ soft delete: ซ่อนจากหน้าเว็บ แต่แอดมินยังเห็นในหน้า moderation

**ถูกใจ / มีเทป**

- **เป็นแบบกำหนดค่า (idempotent) ไม่ใช่สลับ:** `setTapeLike({ tapeId, liked })`, `setSongLike({ songId, liked })`, `setTapeOwned({ tapeId, owned })`
  - userId มาจาก session เสมอ
- **batch เดียว** (D1 batch เป็น transaction):
  1. `INSERT OR IGNORE INTO tape_like …` (หรือ `DELETE FROM tape_like WHERE userId = :me AND tapeId = ?`)
  2. `UPDATE tape SET likeCount = (SELECT COUNT(*) FROM tape_like WHERE tapeId = ?1) WHERE id = ?1`
  3. `SELECT likeCount FROM tape WHERE id = ?1`
- นับใหม่จาก index `tape_like(tapeId)` ทุกครั้ง ตัวนับจึงไม่เพี้ยนแม้กดซ้ำ เปิดสองแท็บ หรือ retry
- action คืน `{ value, count }` ให้ปุ่มใช้แทนค่า optimistic
- ใช้แบบเดียวกันกับ `song_like` และ `tape_owner`

**ตัวนับคอมเมนต์**

- `commentCount` นับเฉพาะคอมเมนต์ที่ `deletedAt IS NULL` คำนวณใหม่แบบเดียวกันทุกครั้งที่สร้าง/ลบ/กู้คืน

**ข้อกำหนดร่วม**

- ไม่ใช้ SQL trigger เพื่อให้ตรรกะอยู่ในโค้ดที่เดียวและทดสอบได้
  - ถ้าวันหน้าจำเป็นต้องใช้ ต้องเขียน `BEGIN`/`END` ตัวพิมพ์ใหญ่และไฟล์ migration แบบ LF
- รายการที่มองไม่เห็นสาธารณะ (ข้อ 3.4) ถูกปฏิเสธด้วยข้อความ "ไม่พบรายการนี้"

**กฎคอมเมนต์**

- สมาชิกลบคอมเมนต์ตัวเองได้ (soft, `deletedBy` = ตัวเอง) แต่กู้คืนไม่ได้
- แอดมินลบได้ทุกคอมเมนต์ และกู้คืนได้เฉพาะคอมเมนต์ที่แอดมินเป็นคนลบ
- ไม่มีการแก้ไขคอมเมนต์

### 3.4 การมองเห็นสาธารณะ

กฎชุดเดียวกันใช้ใน `lib/queries/*`, การค้นหา และทุก action

**เกณฑ์การมองเห็น**

- **เทป / Collection:** มองเห็นเมื่อ `status = 'published'`
- **เพลง / ศิลปิน / ค่าย:** มองเห็นเมื่อ `publishedTapeCount > 0`
  - เพลง: จำนวนเทปที่เผยแพร่ซึ่งมีเพลงนี้ใน `tape_track`
  - ศิลปิน: จำนวนเทปที่เผยแพร่ซึ่งศิลปินอยู่ใน `tape_artist` **หรือ**ร้องเพลงใน tracklist
  - ค่าย: จำนวนเทปที่เผยแพร่ของค่าย
  - ของที่แอดมินสร้างระหว่างทำเทปร่างจะยังไม่ขึ้นสาธารณะจนกว่าเทปจะเผยแพร่
- **แนวเพลง:** มองเห็นเสมอ (มีไม่กี่แนว) แสดง `publishedTapeCount` ข้างชื่อ

**การคำนวณ `publishedTapeCount`**

- ใช้ SQL แบบ set-based:
  ```sql
  UPDATE … SET publishedTapeCount = (SELECT COUNT(DISTINCT …))
  WHERE id IN (SELECT value FROM json_each(?))
  ```
- คำนวณเฉพาะ id ที่ได้รับผลกระทบ ใน batch เดียวกับ:
  - บันทึก/เผยแพร่/ยกเลิกเผยแพร่/ลบเทป
  - แก้ผู้ร้องของเพลงที่ `/admin/songs/[id]` (ทั้งศิลปินเก่าและใหม่)
- ลำดับการคำนวณ: เพลง → ศิลปิน → ค่าย → แนว

**รายการที่มองไม่เห็น**

- ผู้ชมและสมาชิกได้ 404
- แอดมินเห็นหน้าเดียวกัน พร้อมแถบ "ยังไม่เผยแพร่" + `noindex` และปุ่มถูกใจ/มีเทป/คอมเมนต์ถูกปิด
- ปุ่ม "ดูตัวอย่าง" ในฟอร์มแอดมินเปิด URL สาธารณะในแท็บใหม่

**query ที่ join ไปหาเทปต้องกรองเฉพาะเทปที่เผยแพร่เสมอ** ได้แก่:

- "อยู่ในเทป…", "Collection ที่มีเทปนี้", "เทปอื่นของศิลปิน"
- ผลงานในหน้าศิลปิน/ค่าย/แนว/ยุค
- หน้า Collection (รวมปกสำรอง), `/me`, หน้าแรก
- `collection_item` ของเทปร่างยังเก็บไว้ แต่ซ่อนจนกว่าเทปจะเผยแพร่

### 3.5 ค้นหา, redirect

**`search_doc`** (ตารางปกติ)

- docId INTEGER PRIMARY KEY, kind (`tape` | `song` | `artist` | `label` | `collection`), refId, isPublic (0/1), nameKey (ชื่อหลักที่ normalize แล้ว ข้อ 6.4)
- UNIQUE (kind, refId), index (isPublic, kind, nameKey)

**`search_fts`** — FTS5 virtual table `(text, tokenize='trigram')`

- ใช้ `rowid = search_doc.docId` ไม่เก็บ kind/refId ใน FTS (WHERE ด้วยคอลัมน์ UNINDEXED จะเป็น full scan)
- สร้างด้วย raw SQL migration (Drizzle ไม่รองรับ virtual table)
- **`text` ของแต่ละชนิด** (ฟิลด์ที่ normalize แล้วคั่นด้วย ` | `):
  - เทป: title, titleAlt, ศิลปินทุกคน, ค่าย, catalogNo
  - เพลง: title, titleAlt, ผู้ร้อง, lyricist, composer (**ไม่รวมเนื้อเพลง**)
  - ศิลปิน: name, nameAlt, ชื่อสมาชิกวง
  - ค่าย: name, nameAlt
  - Collection: title
- ทุก entity อยู่ใน index ตลอดรวมถึงร่าง โดย `isPublic` ตามกฎข้อ 3.4 ค้นหาสาธารณะกรอง `isPublic = 1` ส่วนหลังบ้านใช้ `isPublic IN (0, 1)`

**การเขียน index (set-based)**

- `lib/search.ts → reindexStatements(docs)`: อ่านข้อมูลก่อน batch แล้วคำนวณ `text`/`nameKey` ใน JS
- ส่งเป็น JSON array `[{kind, refId, nameKey, text}]` พารามิเตอร์เดียว ใช้ 3 statement ต่อการ reindex:
  1. upsert search_doc (isPublic คำนวณใน SQL หลังขั้น publishedTapeCount ใน batch เดียวกัน):
     ```sql
     INSERT INTO search_doc(kind, refId, isPublic, nameKey)
     SELECT j.value->>'$.kind', j.value->>'$.refId', <isPublic จากตารางหลัก>, j.value->>'$.nameKey'
     FROM json_each(?1) j WHERE true
     ON CONFLICT(kind, refId) DO UPDATE SET isPublic = excluded.isPublic, nameKey = excluded.nameKey
     ```
  2. ลบข้อความเดิมใน FTS:
     ```sql
     DELETE FROM search_fts WHERE rowid IN (
       SELECT d.docId FROM search_doc d JOIN json_each(?1) j
       ON d.kind = j.value->>'$.kind' AND d.refId = j.value->>'$.refId')
     ```
  3. `INSERT INTO search_fts(rowid, text) SELECT d.docId, j.value->>'$.text' FROM json_each(?1) j JOIN search_doc d ON …`

**เมื่อไหร่ต้อง reindex** (อยู่ใน batch เดียวกับ)

- บันทึก/เผยแพร่/ยกเลิกเผยแพร่/ลบรายการนั้น
- `publishedTapeCount` เปลี่ยน
- แก้ชื่อสมาชิกวง → reindex เฉพาะศิลปิน
- แก้ชื่อศิลปิน → reindex ศิลปิน + เทป (tape_artist) + เพลง (song_artist) ของศิลปิน
- แก้ชื่อค่าย → reindex เทปของค่าย
- **ถ้ากระทบเกิน 200 docs:**
  - batch บันทึก reindex entity นั้นเองและ 200 docs แรก
  - ที่เหลือเขียนลง `search_queue`
  - ฟอร์มเรียก `admin.search.continue` ทีละ ≤200 docs จนคิวว่าง
  - `/admin` แสดงจำนวนคงค้าง

**action "สร้างดัชนีใหม่" (`admin.search.rebuild`)**

- สร้าง `search_doc` / `search_fts` / titleSort / nameSort ทั้งหมดจากตารางหลัก
- ทำต่อได้จาก `site_stats.reindexCursor` ทีละ ≤200 docs ต่อ request
- หยุดเมื่อ `reindexRowsWritten` ของวันนั้นเกิน 40k (รวมจาก `meta.rows_written`)
- ใช้หลังกู้จาก JSON หรือหลังแก้อัลกอริทึม normalize/sort

**`redirect`** — fromPath (PK), toPath, createdAt; index (toPath)

- path เก็บแบบถอดแล้ว (decoded) + Unicode NFC + ไม่มี `/` ท้าย เช่น `/tapes/เพื่อน-1998`
- **เปลี่ยน slug old → new** (ใน batch เดียวกับการบันทึก):
  1. `DELETE FROM redirect WHERE fromPath = :new` (กัน loop เมื่อเปลี่ยนกลับ)
  2. `UPDATE redirect SET toPath = :new WHERE toPath = :old` (ยุบ chain ให้เหลือ 1 hop)
  3. `INSERT OR REPLACE INTO redirect VALUES (:old, :new, :now)`
- **สร้าง entity ใหม่:** `DELETE FROM redirect WHERE fromPath = :path` (หน้าจริงชนะเสมอ)
- **ลบ entity:** `DELETE FROM redirect WHERE toPath = :path`
- **การค้น:** middleware เรียก `next()` ก่อน แล้วค้นตาราง redirect **เฉพาะเมื่อ request เป็น GET/HEAD และ response เป็น 404** จึงตอบ 301 (ไม่ query ทุก request)

### 3.6 การลบและ foreign key

D1 บังคับ foreign key เสมอ ทุก FK ต้องระบุ ON DELETE ตามตารางนี้:

| ลบ | เงื่อนไข | ผล |
|---|---|---|
| เทป | dialog ยืนยันโดยพิมพ์ชื่อเทป | CASCADE: tape_artist, tape_genre, tape_track, tape_image, collection_item, tape_like, tape_owner, comment<br>ลบ search_doc/search_fts และ redirect ที่ชี้มา<br>**ไม่ลบเพลง** (เพลงที่ไม่เหลือเทปจะมองไม่เห็น)<br>คำนวณ publishedTapeCount ของที่เกี่ยวข้องใหม่<br>`site_stats.imageBytes -= Σ tape_image.bytes + ogImageBytes`<br>อ่าน key รูปทั้งหมดก่อน batch แล้วลบ object R2 หลัง batch สำเร็จ (`cfContext.waitUntil`) |
| เพลง | ห้ามลบถ้ายังอยู่ใน tape_track (RESTRICT + แสดงรายการเทปที่ผูก) | CASCADE: song_artist, song_like, comment; ลบ search และ redirect |
| Collection | dialog ยืนยัน | CASCADE: collection_item; ลบ search, redirect, object R2 ของปก |
| ศิลปิน / ค่าย / แนว | ห้ามลบถ้ายังผูก (RESTRICT กับ tape_artist, song_artist, tape.labelId, tape_genre) | CASCADE: artist_member; ลบ search, redirect, object R2 ของรูป |
| รูปเทป | confirm แล้วลบทันที (ข้อ 5.1) | ลบแถว tape_image แล้วลบ object R2 (อ่าน key จาก DB) |

**กฎ FK เพิ่มเติม**

- `createdBy`, `updatedBy`, `comment.deletedBy` → `ON DELETE SET NULL`
- `tape.coverImageId`, `tape.ogSourceImageId` → `ON DELETE SET NULL`
  - ogSourceImageId เป็น NULL ทำให้การบันทึกครั้งถัดไปสร้าง OG ใหม่
- `comment.userId`, like/owner ของผู้ใช้ → CASCADE (เผื่อไว้ แม้ยังไม่มีการลบผู้ใช้)

**migration:** ที่ drizzle-kit สร้างตารางใหม่แบบ table recreate ต้องใส่ `PRAGMA defer_foreign_keys = on` ไว้ต้นไฟล์ (`PRAGMA foreign_keys=OFF` ที่ drizzle-kit ใส่ไม่มีผลบน D1)

### 3.7 Index ที่ต้องมี

**กฎ query หน้าสาธารณะ** (ตรวจด้วย `EXPLAIN QUERY PLAN` ใน integration test)

- ต้องไม่มี `SCAN <table>` ที่ไม่ใช้ index
- `SCAN <table> USING [COVERING] INDEX` ยอมให้เฉพาะเมื่อมี LIMIT และ ORDER BY ตรงกับ index
- ตารางขนาดจำกัด `genre`, `collection`, `site_stats` อยู่ใน allowlist
- ห้าม `USE TEMP B-TREE` บน subset ที่ใหญ่กว่า ~500 แถว (ยกเว้นกรณีใช้ตัวกรองหลายตัวพร้อมกันตามข้อ 4.4)

| ใช้กับ | Index |
|---|---|
| /tapes ล่าสุด, หน้าแรก "เพิ่มล่าสุด", /latest | `tape(status, publishedAt, id)` |
| /tapes เรียงปี, ยุค + เรียงปี (range บน yearSort) | `tape(status, yearSort, id)` |
| /tapes เรียงชื่อ + แถบตัวอักษร | `tape(status, titleSort, id)` |
| หน้าแรก "มีเยอะที่สุด" | `tape(status, ownerCount, publishedAt, id)` |
| หน้าแรก/latest "แก้ไขล่าสุด" | `tape(status, updatedAt, id)` |
| ตารางแอดมินเทป | `tape(updatedAt, id)` |
| ยุค + เรียงล่าสุด | `tape(status, decade, publishedAt, id)` |
| หน้าค่าย เรียงล่าสุด / เรียงปี, FK | `tape(labelId, status, publishedAt, id)`, `tape(labelId, status, yearSort, id)` |
| ตัวกรองประเภท | `tape(status, releaseType, publishedAt, id)` |
| หน้าแนวเพลง, ตัวกรองแนว | `tape_genre(genreId, isPublished, publishedAt, tapeId)` |
| หน้าศิลปิน (ผลงาน), เทปอื่นของศิลปิน | `tape_artist(artistId, isPublished, yearSort, tapeId)` |
| ผู้ร้องของเพลง | PK `song_artist(songId, artistId)` + `song_artist(artistId, songId)` |
| อยู่ในเทป…, ห้ามลบเพลงที่ยังผูก, ปรากฏในเทปรวม | `tape_track(songId)` |
| แกลเลอรีหน้าเทป | `tape_image(tapeId, position)` |
| Collection ที่มีเทปนี้ | `collection_item(tapeId)` |
| นับถูกใจ/มีเทป, FK cascade | `tape_like(tapeId)`, `tape_owner(tapeId)`, `song_like(songId)` |
| /me | `tape_like(userId, createdAt, tapeId)`, `song_like(userId, createdAt, songId)`, `tape_owner(userId, createdAt, tapeId)` |
| คอมเมนต์หน้าเทป/เพลง (keyset) | `comment(tapeId, createdAt, id)`, `comment(songId, createdAt, id)` |
| rate limit | `comment(userId, createdAt)` |
| /admin คอมเมนต์ล่าสุด, /admin/comments | `comment(createdAt, id)` |
| /artists แถบตัวอักษร, /labels | `artist(nameSort, id)`, `label(nameSort, id)` |
| /artists?province= | `artist(province, nameSort, id)` |
| สมาชิกวง | `artist_member(artistId, position)` |
| ตารางแอดมินเพลง | `song(updatedAt, id)` |
| ค้นหาแบบ prefix (สาธารณะ/หลังบ้าน/EntityPicker) | `search_doc(isPublic, kind, nameKey)` |
| ยุบ chain / ลบ redirect | `redirect(toPath)` |

**หลัง migration:** รัน `PRAGMA optimize` ท้ายทุก migration ที่เพิ่ม index

## 4. หน้าเว็บ

### 4.1 โครงหน้า (ทุกหน้าสาธารณะ — ขนาดละเอียดในข้อ 9.3)

- **Header:**
  - ชื่อเว็บ "ซีรี่ย์บั้ม · คลังเทปเพลง"
  - ช่องค้นหา (form GET ไป `/search`)
  - ปุ่ม "เข้าสู่ระบบ" หรือ avatar menu
- **Sidebar ซ้าย** (≥1024px; ต่ำกว่านั้นเป็น MobileNav ข้อ 9.4):
  - เทป — ตามตัวอักษร (`/tapes?sort=title`), ตามยุค (`/decades`), ตามแนวเพลง (`/genres`)
  - ศิลปิน — ตามตัวอักษร (`/artists`), ตามจังหวัด (`/artists/provinces`)
  - ค่ายเพลง (`/labels`)
  - Collection (`/collections`)
  - อื่นๆ — สุ่มเทป (`/random`), เพิ่มล่าสุด (`/latest`)
  - ลิงก์ของหน้าปัจจุบันเป็น `--accent` + `aria-current="page"`
- **Footer:** ลิงก์เพจ Facebook, © ซีรี่ย์บั้ม เทปเพลง

### 4.2 หน้าสาธารณะ (SSR)

| Path | เนื้อหา |
|---|---|
| `/` | บรรทัดสถิติ "ในคลังตอนนี้ N เทป" (site_stats.publishedTapeCount), ตาราง "เพิ่มล่าสุด" (10), ตาราง "แก้ไขล่าสุด" (10), Collection เด่น (≤3), เลือกตามยุค, เทปที่คนมีเยอะที่สุด (10) |
| `/tapes` | รายการเทป (ตาราง หรือกริดปก) + FilterBar + แถบตัวอักษรเมื่อเรียงตามชื่อ (ข้อ 4.4) |
| `/tapes/[slug]`, `/songs/[slug]`, `/artists/[slug]`, `/labels/[slug]`, `/collections/[slug]` | หน้า entity (ข้อ 4.3) |
| `/artists` | แถบตัวอักษร ก–ฮ, A–Z, 0–9 (`?l=ก` ค่าเริ่มต้นเป็นแท็บแรกที่มีศิลปิน)<br>ตารางศิลปินที่มองเห็น (ชื่อ, ประเภท, จังหวัด, สถานะ, จำนวนเทป) เรียง nameSort<br>`Pagination` keyset ทีละ 50 (ลิงก์ "หน้าถัดไป") |
| `/artists?province=X` | X ไม่อยู่ใน PROVINCES → ละเลย<br>มี province → ไม่แสดงแถบตัวอักษร (ละเลย `l`) หัวเรื่อง "ศิลปินจาก {X}" ตารางเดียวเรียง nameSort keyset ทีละ 50<br>ไม่พบ → "ยังไม่มีศิลปินจากจังหวัดนี้" + ลิงก์ `/artists/provinces` |
| `/artists/provinces` | รายชื่อจังหวัดจาก `provinces.ts` จัดตาม 6 ภาค + "ต่างประเทศ" เป็นลิงก์ไป `/artists?province=…` (ไม่แสดงจำนวน ไม่ query DB) |
| `/labels` | ตารางค่ายที่มองเห็น (ชื่อ, จำนวนเทป) เรียง nameSort, `Pagination` keyset ทีละ 100 |
| `/genres`, `/genres/[slug]` | แนวทั้งหมดพร้อมจำนวน / เทปในแนว (สัญญาข้อ 4.4) |
| `/decades`, `/decades/[decade]` | รายการยุคคงที่ในโค้ด 1950s–2020s (ไม่แสดงจำนวน ไม่ query DB) / เทปในยุค — `decade` ต้องตรง `^(19[5-9]\|20[0-2])0s$` ไม่งั้น 404 |
| `/collections` | Collection ที่เผยแพร่ เรียง position (ปก, ชื่อ, จำนวนเทป) |
| `/latest` | ตาราง "เพิ่มล่าสุด" และ "แก้ไขล่าสุด" อย่างละ 50 |
| `/random` | 302 ไปหน้าเทปที่เผยแพร่แบบสุ่ม (รายละเอียดใต้ตาราง) |
| `/search?q=` | ผลค้นหาแยกกลุ่ม เทป / เพลง / ศิลปิน / ค่าย / Collection (ข้อ 6.4) |
| `/me` | (ต้อง login) แท็บ `#liked-tapes` `#liked-songs` `#owned`<br>แต่ละแท็บเรียง createdAt DESC แสดง 48 รายการ + ลิงก์หน้าถัดไป keyset `(createdAt, tapeId\|songId)`<br>เห็นเฉพาะตัวเอง |
| `/login` | ปุ่ม "เข้าสู่ระบบด้วย Google" (ข้อ 4.6) |
| 404 / 403 / 500 / 503 | หน้าธีมเดียวกัน (ข้อ 4.6) |

**`/random`**

- สุ่ม r ในช่วง `SELECT max(rowid) FROM tape`
- `SELECT slug FROM tape WHERE status = 'published' AND rowid >= r ORDER BY rowid LIMIT 1`
  - ไม่เจอให้ลองใหม่ด้วย r = 0
  - ไม่มีเทปเลยไป `/`
- ห้าม `ORDER BY random()`
- `Cache-Control: no-store`

### 4.3 หน้า entity (แบบสารานุกรม)

**โครงร่วม** (ขนาดดูข้อ 9.3):

1. H1 (+ ชื่อรอง)
2. [InfoBox | รูป]
3. ข้อความยาว (bio/description ตัดที่ 600 ตัวอักษร + "อ่านต่อ" กางในที่เดิม)
4. Tabs
5. ส่วนท้าย
6. CreditLine "เพิ่มโดย {ชื่อ} · {วันที่} | แก้ไขล่าสุดโดย {ชื่อ} · {วันที่}"

**หน้าศิลปิน `/artists/[slug]`**

- **H1:** name (+ nameAlt)
- **InfoBox:**
  - ประเภท
  - สถานะ
  - มาจาก (ลิงก์ `/artists?province=`)
  - ปีที่ทำงาน
  - แนวเพลง = 3 แนวที่พบมากที่สุดในเทปที่เผยแพร่ของศิลปิน (คำนวณตอนอ่านจากผลงาน ≤200 แถว)
  - ค่ายล่าสุด = ค่ายของเทปที่เผยแพร่ซึ่งมี year มากที่สุด (ไม่นับเทปที่ไม่ทราบปี ถ้าไม่มีเทปที่ทราบปีใช้ publishedAt ล่าสุด)
- **การแสดงสถานะ:**
  - `active` → ยังทำงาน
  - `inactive` → "แยกวง" (band/group หรือ NULL) หรือ "หยุดงานเพลง" (solo)
  - `hiatus` → พักงาน
  - `deceased` → เสียชีวิต
  - `unknown` → ไม่ทราบ
  - inactive/deceased ใช้สี `--status`
- **รูป:** รูปศิลปินอยู่ขวา (ไม่มีรูปแสดง Placeholder)
- **Tabs** (`#discography` `#members` `#songs`):
  1. **ผลงาน:** ตาราง (ชื่อชุด, ประเภท, ปี, มีเทปนี้ N คน) ของเทปที่ศิลปินอยู่ใน `tape_artist`
     - เรียง `yearSort, titleSort` ≤200 แถว
     - ปุ่มกรองประเภทฝั่ง client: ทั้งหมด / อัลบั้ม / รวมฮิต / เพลงประกอบ / อื่นๆ (= `single` + `other`)
     - ใต้ตารางมีหัวข้อ "ปรากฏในเทปรวม" (≤50 แถว yearSort DESC): เทปที่ศิลปินร้องบางเพลงแต่ไม่อยู่ใน `tape_artist`
  2. **สมาชิก:** แสดงเมื่อ artistType ≠ `solo` และมีสมาชิก
     - ตาราง "สมาชิกล่าสุด" (isCurrent) และ "อดีตสมาชิก"
     - คอลัมน์: ชื่อ, หน้าที่ (ปี)
  3. **เพลงที่ร้อง:** 100 แถวแรก (titleSort, id) คอลัมน์: ชื่อ, อยู่ในเทปแรก, ปี
     - "อยู่ในเทปแรก" ได้จาก subquery `MIN(yearSort)` ใน query เดียว
     - ลิงก์ `?songs_cursor=…#songs` สำหรับหน้าถัดไป

**หน้าเทป `/tapes/[slug]`**

- **H1:** ชื่อชุด
- **ชื่อรอง:** ศิลปิน (ลิงก์)
  - ไม่มีศิลปินแสดง "รวมศิลปิน"
  - หลายคนแสดงสูงสุด 2 ชื่อคั่น " / " + "และอีก N"
- **InfoBox:**
  - ประเภท, ปี ("พ.ศ. 2541 · 1998"), ค่าย (ลิงก์), รหัสตลับ, แนวเพลง (ลิงก์)
  - แท็ก "หายาก" / "ใหม่" (publishedAt ภายใน 14 วัน)
  - ปุ่ม **ถูกใจ N** และ **ฉันมีเทปนี้ · N คน**
- **รูปปกหลักอยู่ขวา:**
  - กดเปิด Lightbox
  - ใต้ปกมีรูปย่อของรูปอื่น
  - ไม่มีรูปแสดง Placeholder
- **Tabs** (`#songs` `#details` `#collections` `#comments`):
  1. **เพลง** (ค่าเริ่มต้น): ตารางแยกตามหน้า (A, B, C, D เท่าที่มี)
     - คอลัมน์: #, ชื่อเพลง (+ note ตัวเอียง), ผู้ร้อง (แสดงเฉพาะเมื่อไม่ตรงกับศิลปินของเทป), ความยาว
     - แถวที่มีเนื้อเพลงมีลิงก์ "เนื้อเพลง" ไป `/songs/{slug}#lyrics` (query เลือกแค่ `lyrics IS NOT NULL AS hasLyrics`)
     - ท้ายแต่ละหน้าแสดงความยาวรวม
  2. **รายละเอียด:** description + ลิงก์ "ดูรีวิวบนเพจ" (reelUrl)
  3. **Collection:** Collection ที่เผยแพร่ซึ่งมีเทปนี้
  4. **คอมเมนต์ (N)**
- **ส่วนท้าย:**
  - "เทปอื่นของ {ศิลปินหลัก}" (≤8, yearSort ASC, ไม่รวมเทปนี้)
  - ถ้าไม่มีศิลปินหลัก: "เทปอื่นจากค่ายเดียวกัน" (ไม่มีค่ายก็ซ่อน)

**หน้าเพลง `/songs/[slug]`**

- **H1:** ชื่อเพลง
- **InfoBox:** ผู้ร้อง, คำร้อง, ทำนอง, เรียบเรียง, ปุ่มถูกใจ
- **Tabs** (`#tapes` `#lyrics` `#comments`):
  - อยู่ในเทป (ตาราง: เทป, ศิลปิน, ปี, ตำแหน่ง เช่น "หน้า A #3")
  - เนื้อเพลง (มีเมื่อมี lyrics)
  - คอมเมนต์

**หน้าค่าย `/labels/[slug]`**

- **H1:** name (+ nameAlt)
- **InfoBox:**
  - จำนวนเทปในคลัง (publishedTapeCount)
  - ช่วงปี (MIN–MAX year ของเทปที่เผยแพร่ ผ่าน index `tape(labelId, status, yearSort, id)` ไม่ทราบแสดง "—")
- **รูป:** โลโก้อยู่ขวา
- **ข้อความยาว:** description
- **รายการเทป:** ตาราง TapeRow ไม่มีคอลัมน์ค่าย (สัญญาข้อ 4.4)

**หน้า Collection `/collections/[slug]`**

- **H1:** title
- **รูปปก:** อยู่ขวา (กฎปกสำรองข้อ 5.2)
- **ข้อความยาว:** description
- **ตาราง:** ลำดับ, TapeRow, โน้ต (`--text-soft` ตัวเอียง) ≤100 รายการ

**หน้าแรก / latest**

- **ตาราง "เพิ่มล่าสุด":** วันที่ (publishedAt), เทป, ศิลปิน, เพิ่มโดย
- **ตาราง "แก้ไขล่าสุด":** วันที่ (updatedAt), เทป, แก้ไขโดย — เฉพาะเทปที่เผยแพร่
- **Collection เด่น:** เผยแพร่ + isFeatured เรียง position (≤3 ไม่มีก็ซ่อน)
- **เลือกตามยุค:** ลิงก์ 80s/90s/2000s/2010s
- **มีเยอะที่สุด:** ownerCount > 0 เรียง ownerCount DESC, publishedAt DESC (≤10 ไม่มีก็ซ่อน)
- ถ้ายังไม่มีเทปเลย แสดง "เร็วๆ นี้"

### 4.4 สัญญาของรายการเทป (`/tapes`, `/genres/[slug]`, `/decades/[decade]`, `/labels/[slug]`)

**พารามิเตอร์**

| พารามิเตอร์ | ค่า |
|---|---|
| `decade` | เช่น `1990s` |
| `genre` | slug |
| `type` | releaseType |
| `l` | ตัวอักษร ใช้เฉพาะ `/tapes` ที่ `sort=title` และไม่มีตัวกรอง |
| `sort` | `new` \| `year` \| `title` |
| `view` | `table` \| `grid` |
| `cursor` | cursor ของหน้าถัดไป |

- ตัวกรองละค่าเดียว ค่าที่ไม่รู้จักถูกละเลย
- ไม่มีตัวกรองศิลปินและค่าย (ใช้หน้าศิลปิน/หน้าค่ายแทน เพราะ dropdown หลายร้อยรายการต้องอ่าน DB ทุกครั้ง)

**การเรียงที่เปิดให้ใช้** (UI แสดงเฉพาะที่รองรับ; sort ที่ไม่รองรับกลับไปใช้ `new`)

| บริบท | sort ที่ใช้ได้ | index |
|---|---|---|
| `/tapes` ไม่มีตัวกรอง | `new`, `year`, `title` | `tape(status, publishedAt\|yearSort\|titleSort, id)` |
| ยุคอย่างเดียว / `/decades/[d]` | `new`, `year` | `tape(status, decade, publishedAt, id)` / `yearSort >= :d AND yearSort < :d + 10` บน `tape(status, yearSort, id)` |
| แนวอย่างเดียว / `/genres/[slug]` | `new` | `tape_genre(genreId, isPublished, publishedAt, tapeId)` |
| ประเภทอย่างเดียว | `new` | `tape(status, releaseType, publishedAt, id)` |
| `/labels/[slug]` | `new`, `year` | `tape(labelId, status, publishedAt\|yearSort, id)` |
| ตัวกรองหลายตัวพร้อมกัน | `new` | index ของตัวกรองที่แคบที่สุด (แนว > ยุค > ประเภท) ตัวกรองที่เหลือเป็นเงื่อนไขกรองต่อ — ข้อยกเว้นของกฎข้อ 3.7 ใช้งบ ≤5,000 rows |

**Keyset** (id เป็นตัวตัดสินเสมอ ใช้ row-value comparison ทิศเดียวกับ ORDER BY)

| sort | ORDER BY | หน้าถัดไป |
|---|---|---|
| `new` | publishedAt DESC, id DESC | `(publishedAt, id) < (?, ?)` |
| `year` | yearSort ASC, id ASC (เก่า→ใหม่ ไม่ทราบปีอยู่ท้าย) | `(yearSort, id) > (?, ?)` |
| `title` | titleSort ASC, id ASC | `(titleSort, id) > (?, ?)` |

- cursor = base64url ของ JSON `[ค่าคีย์เรียง, id]` ของแถวสุดท้าย ถ้าถอดรหัสไม่ได้หรือไม่ตรงกับ sort ให้กลับไปหน้าแรก (ไม่ error)
- ดึง 25 แถวเพื่อดูว่ามีหน้าถัดไปไหม แสดง 24 (หน้าค่ายดึง 51 แสดง 50)

**ปุ่ม "โหลดเพิ่ม"**

- **ไม่มี JS:** เป็นลิงก์ `?…&cursor=` `rel="nofollow"` ใช้ได้เลย
- **มี JS:** สคริปต์ vanilla `src/scripts/load-more.ts` (ไม่ใช่ React island) ดักคลิก:
  1. `fetch('/partials/tapes?…')`
  2. `const t = document.createElement('template'); t.innerHTML = html` (HTML ที่ SSR เองจาก same-origin)
  3. append `t.content` เข้าตาราง/กริด
  4. ตั้ง href ใหม่จาก `data-next-cursor` ของ partial (ไม่มีให้ซ่อนปุ่ม)
  5. แอนิเมชันแถวใหม่ตามข้อ 9.5
  - ล้มเหลว → ปุ่มเปลี่ยนเป็น "โหลดไม่สำเร็จ ลองอีกครั้ง"
- **`/partials/tapes`:**
  - `export const partial = true`
  - รับพารามิเตอร์ข้างบน + `label` (slug; ใช้เฉพาะ partial ของหน้าค่าย ไม่ใช่ตัวกรองสาธารณะ) + `view`
  - ตอบ `X-Robots-Tag: noindex`

**มุมมอง `view`**

- SSR ตามพารามิเตอร์ใน URL เท่านั้น ไม่มี `view` = `table`
  - บนจอ <640px DataTable ยุบเป็นรายการตามข้อ 9.4 อยู่แล้ว
- ไม่ใช้ localStorage และไม่เลือกค่าเริ่มต้นตามขนาดจอ
- ปุ่มสลับเป็นลิงก์ `?…&view=grid` / ลบ `view`
- ลิงก์โหลดเพิ่มและ partial ส่ง `view` ต่อ

**FilterBar**

- ตัวกรองแนวเป็น select ของแนวทั้งหมด (ตาราง genre เล็ก)
- ตัวกรองยุค/ประเภทเป็นค่าคงที่ในโค้ด

**canonical:** = path + พารามิเตอร์ตัวกรอง/เรียง (ไม่รวม cursor และ view)

### 4.5 SEO และ Open Graph

**แท็กทุกหน้า**

- `<title>`, meta description, canonical
- `og:title`, `og:description`, `og:url` (= canonical), `og:type` (`music.album` หน้าเทป, `website` หน้าอื่น), `og:site_name`, `og:locale` = `th_TH`
- `og:image` (URL เต็ม) + `og:image:width` = 1200, `og:image:height` = 630, `og:image:type` = `image/jpeg`, `og:image:alt`

**og:image ตามหน้า** (ห้ามใช้ WebP)

- **หน้าเทป:** `tape.ogImageKey` → ถ้าไม่มีใช้ `/og-default.jpg`
- **หน้าเพลง:** `ogImageKey` ของเทปที่เผยแพร่และปีเก่าที่สุดที่มีเพลงนี้ → `/og-default.jpg`
- **หน้าอื่น:** `/og-default.jpg`

**meta description**

- 155 ตัวอักษรแรกของ description/bio (ตัดขึ้นบรรทัด)
- ถ้าว่าง หน้าเทปใช้แม่แบบ "เทป {title} – {ศิลปิน} (พ.ศ. {ปี}) ค่าย {ค่าย} | ซีรี่ย์บั้ม เทปเพลง" (ตัดส่วนที่ไม่มีข้อมูล)
- หน้าอื่นมีแม่แบบของตัวเองแบบเดียวกัน

**canonical / og:url**

- สร้างด้วยฟังก์ชันเดียว `canonicalUrl(path)` = `SITE_URL + encodeURI(path แบบ NFC)` ให้ Facebook นับเป็น URL เดียว

**`noindex`**

- `/admin/*`, `/me`, `/login`, `/search`, `/partials/*`
- `/tapes`, `/genres/*`, `/decades/*`, `/labels/*` ที่มี query string
- หน้ารายการที่ยังไม่เผยแพร่

**`robots.txt`** (FacebookExternalHit ปฏิบัติตาม robots จึงต้องมีกลุ่มของตัวเองก่อน `*`)

  ```
  User-agent: facebookexternalhit
  Allow: /

  User-agent: *
  Disallow: /search
  Disallow: /partials/
  Disallow: /admin
  Disallow: /tapes?
  Disallow: /genres/*?
  Disallow: /decades/*?
  Disallow: /labels/*?
  ```

**หลังเปลี่ยนปกหรือชื่อของเทปที่แชร์ไปแล้ว:** แอดมินกด "Scrape Again" ใน Facebook Sharing Debugger (ฟอร์มมีลิงก์ให้)

### 4.6 สถานะของหน้าและการ login

**login**

- **`/login?next=/path` — `safeNextPath(next)` ฝั่งเซิร์ฟเวอร์:**
  - `new URL(next, SITE_URL)`
  - ถ้า parse ไม่ได้, origin ไม่ตรง SITE_URL, หรือ pathname ขึ้นต้นด้วย `/login` หรือ `/api/auth/` → ใช้ `/`
  - มิฉะนั้นคืน pathname + search + hash
  - ใช้ค่าเดียวกันเป็น `callbackURL` ของ `signIn.social` และตอน `/login` redirect ผู้ที่ login อยู่แล้ว
  - `errorCallbackURL` = `/login?error=1` (แสดง "เข้าสู่ระบบไม่สำเร็จ ลองอีกครั้ง")
- ยังไม่ login แล้วเข้า `/me` หรือ `/admin/*` → 302 ไป `/login?next=…`
- login แล้วแต่ไม่ใช่แอดมินเข้า `/admin/*` → หน้า 403 "หน้านี้สำหรับแอดมิน"
- **avatar menu** (`<details>` + สคริปต์ vanilla):
  - "ของฉัน" (`/me`)
  - "หลังบ้าน" (เฉพาะแอดมิน)
  - "ออกจากระบบ" (POST `/api/auth/sign-out` แล้วโหลดหน้าเดิมใหม่)

**ถูกใจ / มีเทป**

- ยังไม่ login แล้วกด → ไป `/login?next={หน้าปัจจุบัน}` (ไม่ทำ optimistic)
- optimistic ล้มเหลว → คืนค่าเดิม + toast "บันทึกไม่สำเร็จ ลองอีกครั้ง"
- ปุ่ม disable ระหว่างรอผล

**คอมเมนต์**

- เรียงใหม่→เก่า SSR 20 รายการแรก
- "ดูเพิ่ม" เรียก `comments.list` (ข้อ 8) keyset (createdAt, id) ทีละ 20
- ยังไม่ login แสดง "เข้าสู่ระบบเพื่อคอมเมนต์"
- ถูกแบนแสดง "บัญชีนี้ถูกระงับการคอมเมนต์"
- ก่อนคอมเมนต์ครั้งแรกแสดง "ชื่อและรูปโปรไฟล์ Google ของคุณจะแสดงต่อสาธารณะพร้อมคอมเมนต์"

**สถานะว่าง**

- `/tapes` ไม่พบผล → "ไม่พบเทปตามตัวกรองนี้" + ลิงก์ล้างตัวกรอง
- `/search` ว่าง → แสดงแค่ช่องค้นหา
- `/search` ไม่พบ → 'ไม่พบ "{q}"' + ลิงก์ไป `/tapes` + หมายเหตุ "คำค้นสั้นกว่า 3 ตัวอักษรค้นเฉพาะต้นชื่อ"
- `/me` ว่าง → ข้อความแนะนำ + ลิงก์ไป `/tapes`

**หน้าข้อผิดพลาด**

- **404** "เทปม้วนนี้ยืดไปแล้ว" + ช่องค้นหา (ตรวจ redirect ก่อนตามข้อ 3.5)
- **500** "เทปติดเครื่อง" + ปุ่มลองใหม่
- **503** เมื่อโควตา D1 หมด: "ร้านปิดชั่วคราว กลับมาเปิด 07:00 น." + `Retry-After` — หน้านี้ห้าม query D1
- middleware ครอบการโหลด session ด้วย try/catch ถ้า D1 ล้มถือเป็นผู้ชมทั่วไป

**Loading:** หน้า SSR ไม่มีสถานะ loading ส่วน island แสดง spinner บนปุ่มระหว่างรอ action

### 4.7 หลังบ้าน `/admin`

**layout**

- ต้องเป็นแอดมิน, ธีมเดียวกัน, `noindex`
- sidebar ของหลังบ้าน (`AdminNav`): แดชบอร์ด, เทป, เพลง, ศิลปิน, ค่าย, แนวเพลง, Collection, คอมเมนต์, ผู้ใช้, "กลับหน้าเว็บ"

| Path | เนื้อหา |
|---|---|
| `/admin` | จาก site_stats:<br>• จำนวนเทป (เผยแพร่/ทั้งหมด), เพลง, สมาชิก<br>• พื้นที่ R2 (imageBytes / 10 GB แถบแดงเมื่อเกิน 80%)<br>• ขนาด D1 (จาก `meta.size_after` เตือนเมื่อเกิน 400 MB)<br>คอมเมนต์ล่าสุด 10, "เทปที่เป็นร่าง" (เรียง updatedAt เก่าสุดก่อน ลบได้)<br>งาน reindex คงค้าง (จำนวนใน search_queue + ปุ่ม "ทำต่อ"), ปุ่ม "สร้างดัชนีค้นหาใหม่" |
| `/admin/tapes`, `/new`, `/[id]` | ตาราง (ค้นหา, กรองสถานะ, เรียงแก้ไขล่าสุด, keyset ทีละ 50, ปุ่ม "เพิ่มเทป") + ฟอร์มเทป (ข้อ 5.1) |
| `/admin/songs`, `/new`, `/[id]` | ตาราง (ตัวกรอง "เพลงที่ไม่อยู่ในเทปใด") + SongForm (ข้อ 5.5) |
| `/admin/artists`, `/new`, `/[id]` | ตาราง (ตัวกรอง "ไม่ผูกกับเทปใด") + ArtistForm (ข้อ 5.5) |
| `/admin/labels`, `/new`, `/[id]` | ตาราง + LabelForm (ข้อ 5.5) |
| `/admin/genres` | GenreTable: ลากเรียง position, เพิ่ม, แก้ชื่อ/slug inline, ลบ (ข้อ 5.5) |
| `/admin/collections`, `/new`, `/[id]` | ตาราง (ลากเรียง position) + CollectionEditor (ข้อ 5.5) |
| `/admin/comments` | คอมเมนต์ทั้งหมด (รวมที่ถูกลบ) กรองตามเทป/เพลง/ผู้ใช้ ลบ/กู้คืน (กู้ได้เฉพาะที่แอดมินลบ) |
| `/admin/users` | รายชื่อสมาชิก ค้นหาชื่อ/อีเมล แต่งตั้ง/ถอดแอดมิน แบน/ปลดแบนคอมเมนต์ |

- **หน้า `/new`:** ทุกหน้าเป็นฟอร์มเปล่าแบบเดียวกับ `/[id]` สร้างแถวตอนกด "บันทึก" ครั้งแรก แล้ว `history.replaceState` ไป `/admin/{kind}/{id}`
  - ยกเว้นเทป ซึ่งอาจสร้างร่างก่อนเมื่ออัพรูปแรก (ข้อ 5.1)
- **ตารางแอดมินค้นหา** ผ่านฟังก์ชันค้นหาข้อ 6.4 แบบ `isPublic IN (0, 1)` และ kind เดียว

## 5. ฟอร์มหลังบ้าน

ทุกฟอร์มเป็น React island `client:only="react"`

### 5.1 ฟอร์มเทป (`TapeForm`)

**1. ข้อมูลพื้นฐาน**

- title, titleAlt, slug (ข้อ 6.4), ปี, ประเภท, catalogNo, isRare, reelUrl, description

**2. ความสัมพันธ์ (`EntityPicker`)**

- ศิลปิน (หลายคน ลากเรียง), ค่าย (หนึ่ง), แนวเพลง (หลาย)
- พิมพ์ค้นหา (debounce 250ms, ≥2 codepoint, kind เดียว)
- ถ้าไม่เจอกด "สร้าง '…' ใหม่" ซึ่งสร้างทันทีผ่าน admin action จากชื่ออย่างเดียว
  - ศิลปินได้ artistType = NULL, status = `unknown` (แอดมินกรอกที่เหลือภายหลังที่ `/admin/artists/[id]`)
  - แนวได้ position = MAX(position)+1
  - ทุกชนิดสร้าง slug ตามข้อ 6.4
- ของใหม่ยังมองไม่เห็นสาธารณะจนกว่าจะผูกกับเทปที่เผยแพร่

**3. รูปภาพ (`ImageUploader`)**

- ลากไฟล์หลายไฟล์มาวางหรือกดเลือก (รับ JPEG/PNG/WebP/HEIC ที่เบราว์เซอร์ถอดรหัสได้)
- **ย่อในเบราว์เซอร์** (`lib/client/image-resize.ts`, `createImageBitmap` + canvas):
  - full ≤1600px (ด้านยาว), thumb ≤480px
  - เข้ารหัส WebP 0.82 ถ้า canvas คืนชนิดอื่น (Safari/iOS เข้ารหัส WebP ไม่ได้) ใช้ JPEG 0.85
- **เทปใหม่ที่ยังไม่มี id:** ก่อนอัพรูปแรก ฟอร์มเรียก `admin.tapes.createDraft`
  - สร้างแถวร่าง title "(ร่างไม่มีชื่อ)" หรือ title ที่กรอกแล้ว + slug `draft-{8 ตัวแรกของ id}` + search_doc + `site_stats.tapeCount` ใน batch เดียว
  - จากนั้น `history.replaceState` ไป `/admin/tapes/{id}`
- **อัพโหลดรูปละ 2 request** ผ่าน `admin.images.upload` (input ข้อ 8):
  1. ส่ง full → เซิร์ฟเวอร์สร้าง uuid เขียน `{uuid}-full.{ext}` คืน `{ uuid }`
  2. ส่ง thumb พร้อม uuid เดิม → เซิร์ฟเวอร์ตรวจว่ามี `{uuid}-full.*` ของเทปนั้นจริง (`BUCKET.head`) เขียน `{uuid}-thumb.{ext}` แล้ว insert แถว `tape_image` (fullKey, thumbKey, width, height, bytes, position ท้ายสุด) และ `site_stats.imageBytes` ใน request นี้
  - แสดงความคืบหน้ารายรูป รูปที่ล้มเหลวขึ้นสถานะแดง + "ลองใหม่" โดยรูปอื่นไม่หาย
- **ลบรูป** (`admin.images.deleteTapeImage({ imageId })`, confirm ก่อน) ทำทันทีใน batch เดียว:
  - ลบแถว `tape_image`
  - คำนวณ `coverImageId`/`coverThumbKey` ใหม่จากรูปที่เหลือตามกฎปกหลัก (ไม่เหลือรูป → NULL)
  - ลด `site_stats.imageBytes`
  - แล้วลบ object R2 ด้วย `waitUntil`
  - เทปที่เผยแพร่แล้วห้ามลบรูปสุดท้าย
- **kind และลำดับ:** เลือก kind ต่อรูป ลากเรียง (Motion `Reorder`) — บันทึกพร้อมฟอร์ม
  - ทุกแถวมีปุ่ม ↑/↓ (aria-label ภาษาไทย) สำหรับคีย์บอร์ด และประกาศผลผ่าน `aria-live`

**4. Tracklist (`TracklistEditor`)**

- แท็บหน้า A / B (เพิ่ม C/D ได้) แต่ละแถวเป็นอย่างใดอย่างหนึ่ง:
  - **เพลงเดิม:** เลือกจาก autocomplete ที่แสดง "ชื่อเพลง — ผู้ร้อง · เทปแรกที่มี"
    - ผู้ร้องแสดงแบบอ่านอย่างเดียว (แก้ได้ที่ `/admin/songs/[id]` เท่านั้น เพราะกระทบทุกเทป)
  - **เพลงใหม่:** กรอกชื่อ + ผู้ร้อง (EntityPicker ศิลปิน)
    - ค่าเริ่มต้นของผู้ร้อง = ศิลปินหลักของเทป ถ้าไม่มีศิลปินหลักต้องกรอก
- ทุกแถวมี note และความยาว (mm:ss เก็บที่ `tape_track.durationSec`)
- **วางหลายบรรทัด:** แต่ละบรรทัด = ชื่อเพลง + ความยาว mm:ss ท้ายบรรทัด (ถ้ามี) สร้างเป็นแถวเพลงใหม่เสมอ
  - ถ้ามีเพลงเดิมที่ `normalize(title)` และผู้ร้องตรงกัน แถวนั้นขึ้นป้าย "มีเพลงนี้แล้ว — เชื่อมเพลงเดิม?" ให้กดเอง (ไม่เชื่อมอัตโนมัติ)
- ลากเรียงด้วย Motion `Reorder` + ปุ่ม ↑/↓
- การเอาแถวออกไม่ลบเพลง

**5. บันทึก**

- **ปุ่ม:** "บันทึกร่าง", "เผยแพร่" / "ยกเลิกเผยแพร่", "ดูตัวอย่าง", "ลบ" (ข้อ 3.6)
- **เงื่อนไข:**
  - บันทึกร่างต้องมีแค่ title
  - เผยแพร่ต้องมี title + รูป ≥1 รูป + ศิลปิน ≥1 คน (ยกเว้น releaseType = `compilation` หรือ `soundtrack` ซึ่งแสดงเป็น "รวมศิลปิน")
  - ไม่ครบแสดงรายการที่ขาดใต้ปุ่ม
- **ก่อนส่ง batch:** client คำนวณปกหลัก ถ้า id ≠ `ogSourceImageId` หรือ title ≠ `ogSourceTitle` ให้สร้างรูป OG ใหม่ (ข้อ 5.3)
- **งบ query ของ request บันทึก:** รวม ≤50 = session ≤2 + อ่านก่อน batch ≤8 + batch ≤40
  - อ่านก่อน batch: ความสัมพันธ์เดิม (หา id ที่ได้รับผลกระทบ), ชื่อที่ใช้สร้างข้อความค้นหา
  - ตรวจ slug ชนของเทปและเพลงใหม่ทุกเพลงใน query เดียว `SELECT slug FROM song WHERE slug IN (SELECT value FROM json_each(?1))` (ส่ง candidate ทุกตัวรวม -2…-5) ห้ามตรวจทีละเพลง
- **batch เดียว:**
  1. upsert `tape` (titleSort, yearSort, decade, coverImageId, coverThumbKey, updatedBy/updatedAt)
  2. insert `song` + `song_artist` ของเพลงใหม่
  3. ความสัมพันธ์แบบรายการ (`tape_artist`, `tape_genre`, `tape_track`): ลบทั้งหมดของเทปนี้แล้ว insert ใหม่ (ไม่ชน unique ตอนสลับลำดับ; ใส่ isPublished/yearSort/publishedAt ตามข้อ 3.2)
  4. update kind/position ของ `tape_image`
  5. publishedTapeCount (ข้อ 3.4)
  6. reindex (ข้อ 3.5)
  7. redirect ถ้า slug เปลี่ยน
  8. site_stats (publishedTapeCount, songCount)
  9. ตั้ง ogImageKey / ogImageBytes / ogSourceImageId / ogSourceTitle และ `site_stats.imageBytes += ใหม่ − ogImageBytes เดิม`
  - การ insert หลายแถวใช้ statement เดียวต่อตาราง `INSERT INTO … SELECT … FROM json_each(?1)` (ข้อ 6.5)
- **หลัง batch สำเร็จ:** ลบ object OG เก่าด้วย `waitUntil`
- **เผยแพร่/ยกเลิกเผยแพร่:**
  - `publishedAt` ตั้งครั้งแรกที่เผยแพร่และไม่เปลี่ยนอีก
  - ยกเลิกเผยแพร่แล้ว likes/owners/comments/collection_item ยังเก็บไว้แต่ซ่อน
- **ร่างที่ยังไม่บันทึก:** ค่าในฟอร์มเก็บใน `localStorage` (key `tape:new` แล้วย้ายเป็น `tape:{id}` เมื่อได้ id) กู้คืนได้เมื่อเปิดใหม่ ล้างหลังบันทึกสำเร็จ
- **validation:** Zod ใช้ร่วม client/server (`src/lib/schemas.ts`, import `z` จาก `astro/zod`) แสดงข้อผิดพลาดใต้ช่อง

### 5.2 รูปเดี่ยวของศิลปิน/ค่าย/Collection (`SingleImageField`)

**การอัพโหลด**

- ใช้ `image-resize.ts` ตัวเดียวกัน: full ≤1200px + thumb ≤480px (ไม่มี OG)
- อัพโหลดคู่ full/thumb ด้วย uuid เดียวกันผ่าน `admin.images.upload` (entityType ของ entity นั้น)
- key ของ full เก็บใน `imageKey`/`logoKey`/`coverKey` ตอนกดบันทึกฟอร์ม
- key ของ thumb ได้จากการแทน `-full.` ด้วย `-thumb.` (`lib/images.ts`)

**ข้อจำกัดและการเปลี่ยนรูป**

- ก่อนบันทึกครั้งแรก (ยังไม่มี id) ช่องนี้ถูกปิดพร้อมข้อความ "บันทึกก่อนจึงเพิ่มรูปได้"
- เปลี่ยนรูป หรือกด "เอารูปออก" (ตั้งเป็น NULL ตอนบันทึก) แล้ว object เก่าถูกลบหลังบันทึกสำเร็จ และลด `imageBytes` / `site_stats.imageBytes`

**ปกสำรองของ Collection:** Collection ที่ไม่มี coverKey ใช้ coverThumbKey ของเทปแรก (ตาม position) ที่เผยแพร่ ถ้าไม่มีใช้ Placeholder

### 5.3 รูป OG (JPEG 1200×630)

**การสร้าง (ในเบราว์เซอร์)**

- วางปกกลางพื้น `--bg` ด้านข้างเป็นชื่อชุด (สี `--heading`) และ "ซีรี่ย์บั้ม · คลังเทปเพลง" (`--label`)
- **แหล่งรูป:**
  - ตอนอัพโหลด ถ้ารูปนั้นจะเป็นปกหลัก ใช้ bitmap ที่ยังอยู่ในหน่วยความจำ
  - ถ้าปกหลักหรือชื่อเปลี่ยนภายหลัง ดึงรูป full จาก route same-origin เฉพาะแอดมิน `GET /admin/api/image/[imageId]`
    - ตรวจ `requireAdmin`, อ่าน key จากแถว `tape_image`, stream จาก R2
    - ไม่ใช้ URL r2.dev จึงไม่ต้องตั้ง CORS และ canvas ไม่ถูก taint

**การอัพโหลดและกรณีล้มเหลว**

- อัพโหลดผ่าน `admin.images.upload` variant `og` (ไม่สร้างแถว `tape_image`) ได้ key `tapes/{tapeId}/{uuid}-og.jpg` ก่อนส่ง batch บันทึก
- ถ้าสร้างไม่สำเร็จ บันทึกต่อได้ `og:image` ใช้ `/og-default.jpg` และฟอร์มแสดงคำเตือน

### 5.4 ขีดจำกัดข้อมูล (`src/lib/schemas.ts`)

| ฟิลด์ | ขีดจำกัด |
|---|---|
| title / name | 1–200 |
| titleAlt / nameAlt | ≤200 |
| slug | ≤80 codepoint ตามรูปแบบข้อ 6.4 |
| catalogNo | ≤50 |
| description / bio | ≤5,000 |
| lyrics | ≤10,000 |
| notes / collection note / track note | ≤1,000 / ≤1,000 / ≤50 |
| yearsActive | ≤100 |
| member name / role / years | ≤100 / ≤100 / ≤50 |
| year | 1950–(ปีปัจจุบัน+1) หลังแปลง พ.ศ. หรือว่าง |
| durationSec | 1–3,599 หรือว่าง |
| จำนวนต่อเทป | แทร็ก ≤60, รูป ≤40, ศิลปิน ≤20 |
| สมาชิกต่อวง | ≤40 |
| เทปต่อ Collection | ≤100 |
| comment body | 1–1,000 |

### 5.5 ฟอร์มอื่น (`ArtistForm`, `LabelForm`, `SongForm`, `CollectionEditor`, `GenreTable`)

**ข้อกำหนดร่วม**

- **ปุ่ม:** "บันทึก", "ดูตัวอย่าง", "ลบ" (ข้อ 3.6 — ถ้าถูก RESTRICT แสดงรายการที่ยังผูกพร้อมลิงก์)
- **ช่อง slug:** แสดงค่าปัจจุบัน ตรวจด้วย regex ข้อ 6.4 และความไม่ซ้ำฝั่งเซิร์ฟเวอร์
  - เมื่อแก้แสดงคำเตือน "ลิงก์เดิมจะ redirect มาที่ใหม่"
- **การบันทึก:** ใน `db.batch()` เดียว หลายแถวใช้ `json_each`

**ฟิลด์และสิ่งที่ batch ทำ แยกตามฟอร์ม**

- **ArtistForm**
  - ฟิลด์: name, nameAlt, slug, ประเภท (select รวม "ไม่ระบุ"), สถานะ, จังหวัด (`<select>` จัดกลุ่มด้วย `<optgroup>` ตามภาค + "ไม่ระบุ"), ปีที่ทำงาน, bio, รูป (SingleImageField)
  - สมาชิก (`MemberEditor`): แถว ชื่อ/หน้าที่/ปี/ปัจจุบัน ลากเรียง + ↑/↓
  - batch:
    1. update `artist` (nameSort, updatedBy/updatedAt)
    2. `DELETE FROM artist_member WHERE artistId = ?` + `INSERT … SELECT … FROM json_each(?)`
    3. redirect ถ้า slug เปลี่ยน
    4. reindex ตามข้อ 3.5
- **LabelForm**
  - ฟิลด์: name, nameAlt, slug, description, โลโก้ (SingleImageField)
  - batch:
    1. update `label`
    2. redirect
    3. reindex ค่าย (+ เทปของค่ายถ้าชื่อเปลี่ยน)
- **SongForm**
  - ฟิลด์: title, titleAlt, slug, ผู้ร้อง (EntityPicker ศิลปิน หลายคน ลากเรียง), lyricist, composer, arranger, lyrics, notes
  - batch:
    1. update `song`
    2. replace `song_artist`
    3. publishedTapeCount ของศิลปินเก่าและใหม่
    4. redirect
    5. reindex เพลง
- **CollectionEditor**
  - ฟิลด์: title, slug, description, ปก (SingleImageField), isFeatured
  - เทปใน Collection: ค้นหาเทปมาเพิ่ม, ลากเรียง, โน้ตต่อเทป
  - ปุ่มเพิ่มเติม: "บันทึกร่าง" / "เผยแพร่" / "ยกเลิกเผยแพร่"
  - batch:
    1. update `collection`
    2. replace `collection_item`
    3. redirect
    4. reindex
- **GenreTable**
  - แต่ละแถว: ชื่อ, slug, จำนวนเทป, ปุ่มลบ
  - ลากเรียงแล้วบันทึก position ทั้งหมดใน statement เดียว (`json_each`)
- **การลากเรียงตารางใน `/admin/collections`:** บันทึก `collection.position` แบบเดียวกับ GenreTable

## 6. สถาปัตยกรรม

### 6.1 ภาพรวม

```
Browser ──► Cloudflare Worker (Astro SSR + Astro Actions + Better Auth)
   │              ├──► D1  (DB binding)
   │              └──► R2  (BUCKET binding) ◄── upload ผ่าน admin action
   └──── <img> โหลดตรงจาก R2 public URL (IMAGE_BASE_URL) — ไม่ผ่าน Worker
```

**Framework**

- Astro 7.x + `@astrojs/cloudflare` 14.x, `output: 'server'`, Node ≥22.12
- อ่าน binding/vars/secrets ด้วย `import { env } from 'cloudflare:workers'` (`Astro.locals.runtime` ถูกลบแล้ว)
- งานหลังตอบกลับ (ลบ object R2) ใช้ `Astro.locals.cfContext.waitUntil()`
- adapter ตั้ง `imageService: 'passthrough'` (รูปย่อจากเบราว์เซอร์แล้ว)
- astro config ตั้ง `session: false` (ใช้ Better Auth ไม่สร้าง KV `SESSION`)
- เปลี่ยนหน้าแบบโหลดหน้าเต็ม (ไม่ใช้ `<ClientRouter />`)
- สคริปต์ฝั่ง client เป็น module script ปกติของ Astro

**Interactive**

- **React islands:** เฉพาะ LikeButton, OwnButton (`client:visible`, SSR ตัวเลขมาใน HTML), Comments (`client:visible`), และฟอร์มหลังบ้านทั้งหมด (`client:only="react"` เพื่อลด CPU ฝั่ง Worker)
- **สคริปต์ vanilla** (`src/scripts/*.ts`): tabs, load-more, lightbox, mobile-nav, avatar-menu, filter-bar, bio-expand

**Mutation (Astro Actions)**

- Zod input, import จาก `astro/zod` (Zod 4)
- ตัว Action เป็นเพียง wrapper บางๆ ที่เรียก service layer (`src/lib/services/*.ts`) ซึ่งรับ `db`/`bucket`/`user` เป็นพารามิเตอร์ (ทดสอบได้)
- ต้องตั้ง `security.actionBodySizeLimit: 4 * 1024 * 1024` (ค่าเริ่มต้น 1 MB จะปฏิเสธรูป JPEG จาก iPhone)

**DB**

- Drizzle ORM (`drizzle-orm/d1`) + drizzle-kit สร้าง SQL migration
- FTS5 และ index พิเศษเขียนเป็น raw SQL migration
- apply ด้วย `wrangler d1 migrations apply`
- ไฟล์ `migrations/*.sql` บังคับ LF (`.gitattributes`)

**Auth: Better Auth 1.7.x**

```ts
betterAuth({
  baseURL: env.SITE_URL, secret: env.BETTER_AUTH_SECRET, trustedOrigins: [env.SITE_URL],
  database: drizzleAdapter(db, { provider: 'sqlite', schema }),
  socialProviders: { google: { clientId, clientSecret, prompt: 'select_account' } },
  user: { additionalFields: { role: { …, input: false }, commentBanned: { …, input: false } } },
  disabledPaths: ['/update-user'],
  databaseHooks: { session: { create: { after: promoteAdmins } }, user: { create: { after: bumpUserCount } } },
})
```

- import `drizzleAdapter` จาก `@better-auth/drizzle-adapter`
- factory `getAuth()` สร้างแบบ lazy/memoize ระดับโมดูล (ห้ามทำงานหนักใน global scope — startup ≤1 วินาที)
- route `/api/auth/[...all]`

**Styling และฟอนต์**

- Tailwind CSS v4 (`@tailwindcss/vite`, tokens ข้อ 9.2 ใน `@theme`)
- ฟอนต์ self-host ผ่าน fontsource (เฉพาะ subset thai + latin) เสิร์ฟเป็น static assets:
  - `@fontsource/noto-serif-thai` (500)
  - `@fontsource/ibm-plex-sans-thai` (400, 500)
  - `@fontsource/ibm-plex-mono` (400)

**Animation และ analytics**

- **Animation:** Motion (motion.dev) — `motion/react` ใน islands, `animate()` / `inView()` / `stagger()` จาก `motion` ในสคริปต์ vanilla (ข้อ 9.5)
- **Analytics:** Cloudflare Web Analytics (ฟรี ไม่ใช้ cookie) วาง beacon snippet ใน layout เมื่อมี `CF_BEACON_TOKEN` (workers.dev ไม่มี auto-inject)

**เวอร์ชันที่ pin (ตรวจ ณ 2026-09-25 — ยืนยันอีกครั้งตอนติดตั้ง)**

- `astro@^7.3`, `@astrojs/cloudflare@^14`, `@astrojs/react`, `react@^19`
- `better-auth@^1.7` + `@better-auth/drizzle-adapter@^1.7`
- `drizzle-orm@^0.45` + `drizzle-kit@^0.31` (ยังไม่ใช้ 1.0 RC)
- `motion@^13`, `tailwindcss@^4.3` + `@tailwindcss/vite@^4.3`, `wrangler@^4`
- `vitest@~4.1` + `@cloudflare/vitest-plugin@^1` (plugin ยังไม่รองรับ Vitest 5), `@playwright/test`
- ระวัง `compressHTML: 'jsx'` ของ Astro 7 ตัดช่องว่างระหว่าง inline element (ใส่ `{' '}` ตรงที่ต้องการเว้นวรรค)

### 6.2 Bindings และค่าตั้ง (`wrangler.jsonc`)

- `compatibility_date` = วันที่เริ่มโปรเจกต์, `compatibility_flags: ["nodejs_compat"]` (Better Auth ใช้ AsyncLocalStorage)
- **bindings:**
  - `DB` (D1)
  - `BUCKET` (R2 bucket `seriesbumb-images` เปิด public access ผ่าน r2.dev) — ห้ามตั้งชื่อ `IMAGES` เพราะชนกับ Cloudflare Images binding ค่าเริ่มต้นของ adapter
- **vars:** `SITE_URL`, `IMAGE_BASE_URL`, `CF_BEACON_TOKEN` (ว่างได้)
- **secrets:** `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ADMIN_EMAILS`
- **local dev:** `.dev.vars` (อยู่ใน `.gitignore`)
- **observability:** เปิด Workers Logs (`observability.enabled = true`) เพื่อดู CPU time ต่อ route
- **ค่าที่ใช้ตอน build:** `IMAGE_BASE_URL` ใช้ใน CSP ของ `astro.config` ด้วย จึงอ่านจาก env ตอน build และต้องตรงกับ var ใน wrangler.jsonc

### 6.3 โครงสร้างโฟลเดอร์

```
src/
  db/schema.ts, db/client.ts        schema (รวมตาราง auth) + helper json_each/batch
  lib/auth.ts                       getAuth() factory + hooks
  lib/permissions.ts                requireUser / requireAdmin / canComment / parseAdminEmails
  lib/actions.ts                    defineAdminAction / defineMemberAction
  lib/services/                     tapes, songs, artists, labels, genres, collections,
                                    engagement, comments, images, users, search-admin
  lib/queries/                      query ฝั่งอ่านของหน้าสาธารณะ (ทุกตัวใช้กฎข้อ 3.4)
  lib/visibility.ts                 statement คำนวณ publishedTapeCount
  lib/search.ts                     normalize, reindexStatements, buildSearchQuery, rebuild
  lib/thai.ts                       thaiSortKey, normalizeThai
  lib/slug.ts                       slugify, slugCandidates, decodePathSegments
  lib/urls.ts                       canonicalUrl, safeNextPath, imageUrl
  lib/format.ts                     ปี พ.ศ./ค.ศ., ความยาวเพลง, สถานะศิลปิน
  lib/provinces.ts                  PROVINCES: { name, region }[] (77 จังหวัด 6 ภาค) + 'ต่างประเทศ'
  lib/schemas.ts                    Zod schemas ใช้ร่วม client/server
  lib/client/image-resize.ts        ย่อรูป + สร้าง OG
  actions/index.ts                  server = { engagement, comments, admin: {...} }
  middleware.ts                     session → locals.user, guard /admin /me /_actions/admin.*,
                                    security headers, redirect เมื่อ 404, จับ error โควต้า D1
  components/layout/                BaseLayout, Header, Sidebar, Footer, CreditLine, AdminLayout
  components/ui/                    InfoBox, Tabs, DataTable, TapeRow, TapeCard, Tag, Pagination,
                                    LetterBar, FilterBar, Placeholder, CassetteIcon
  components/islands/               LikeButton, OwnButton, Comments
  components/admin/                 TapeForm, ImageUploader, TracklistEditor, EntityPicker,
                                    SingleImageField, ArtistForm, MemberEditor, LabelForm,
                                    SongForm, CollectionEditor, GenreTable, AdminTable, AdminNav
  scripts/                          tabs, load-more, lightbox, mobile-nav, avatar-menu,
                                    filter-bar, bio-expand
  pages/                            ตามข้อ 4 + partials/tapes.astro + admin/api/image/[imageId].ts
                                    + 404/500 + robots.txt.ts
  styles/global.css                 tokens (ข้อ 9.2)
public/                             og-default.jpg, favicon.svg
migrations/                         SQL (drizzle-kit + raw SQL สำหรับ FTS5/index)
scripts/backup.ts, scripts/restore.ts   สำรอง/กู้ข้อมูล (ข้อ 11)
tests/unit, tests/integration, tests/e2e
```

### 6.4 รายละเอียดเฉพาะภาษาไทย (`lib/thai.ts`, `lib/slug.ts`, `lib/search.ts`)

**`normalizeThai(s)`** ใช้ร่วมกับทุกข้อด้านล่าง ลำดับขั้น:

1. `NFC`
2. ลบ zero-width (U+200B–U+200D, U+FEFF)
3. แปลง `ํา` เป็น `ำ`
4. lowercase
5. เลขไทย ๐–๙ เป็น 0–9

**`thaiSortKey(s)`** ใช้กับ `titleSort` (เทป เพลง) และ `nameSort` (ศิลปิน ค่าย) SQLite เทียบแบบ BINARY จึงสร้างคีย์ที่เรียงแบบ byte แล้วได้ลำดับพจนานุกรมไทย:

1. `normalizeThai` → ตัดช่องว่าง/สัญลักษณ์นำหน้า
2. สลับสระหน้า**ทุกตัวในข้อความ**กับพยัญชนะตัวถัดไปหนึ่งตัว: `s.replace(/([เ-ไ])([ก-ฮ])/g, '$2$1')` (`เปล` → `ปเล` ถูกต้องตาม ICU; ฤ ฦ ไม่ใช่สระหน้า)
3. เติมศูนย์หน้าเลขทุกชุดให้ยาว 6 หลัก (`ชุดที่ 2` < `ชุดที่ 10`)
4. คีย์ = กลุ่มอักษร + primary + `\u0001` + ข้อความจากขั้น 3
   - กลุ่มอักษร: `0` ขึ้นต้นด้วยตัวเลข, `1` อักษรไทย, `2` อย่างอื่น (ตัวเลข → ก–ฮ → A–Z)
   - primary = ข้อความขั้น 3 ที่ลบ ็ ่ ้ ๊ ๋ ์ ํ (U+0E47–U+0E4D) — วรรณยุกต์ใช้แค่ตัดสินเสมอ

การใช้งานและการทดสอบ:

- แถบตัวอักษรใช้ range เช่น `nameSort >= '1ก' AND nameSort < '1ข'` (พยัญชนะต้นอยู่หน้าคีย์เสมอเพราะสลับสระแล้ว)
- unit test: เรียงชื่อจริง ≥100 ชื่อ เทียบกับ `Intl.Collator('th').compare` ต้องตรงทุกคู่ (ยกเว้นลำดับตัวเลขแบบ natural ที่ตั้งใจ)

**slug**

- **กฎสร้าง slug:**
  1. `normalizeThai` (เก็บวรรณยุกต์ไว้)
  2. ถ้าเป็นละตินล้วน → kebab-case ASCII; ถ้ามีอักษรไทย → เก็บทั้งไทยและละติน (`รวมฮิต-vol-2`)
  3. อนุญาตเฉพาะ `[ก-๛a-z0-9-]`: ช่องว่าง/สัญลักษณ์ → `-`, ยุบ `-` ซ้ำ, ตัด `-` หัวท้าย, ฐานยาว ≤50 codepoint ตัดที่ขอบคำ
  4. เทปต่อท้ายปี ค.ศ. (ถ้ามี) เช่น `potato-life-2005`
     - ถ้าซ้ำต่อท้าย slug ศิลปินหลัก (เทป) หรือผู้ร้องหลัก (เพลง) โดยตัดส่วนศิลปินที่ขอบคำให้รวม ≤76 codepoint แล้วจึง `-2` … `-5`
     - slug สุดท้าย ≤80
  - `slugCandidates()` คืน candidate ทั้งหมดเพื่อตรวจชนใน query เดียว (ข้อ 5.1)
- **ตรวจฝั่งเซิร์ฟเวอร์** ด้วย regex `^[a-z0-9ก-๛]+(-[a-z0-9ก-๛]+)*$` ยาว ≤80
- **เมื่อไหร่ slug เปลี่ยน:**
  - slug เทปสร้างใหม่ตาม title/ปีอัตโนมัติเฉพาะเมื่อ `publishedAt IS NULL` และ `slugLocked = false`
  - เพลง/ศิลปิน/ค่าย/แนว/Collection สร้าง slug ครั้งเดียวตอนสร้าง หลังจากนั้นเปลี่ยนเมื่อแอดมินแก้ช่อง slug เท่านั้น
  - ทุกการเปลี่ยน slug ของแถวที่บันทึกแล้วเขียน redirect (ข้อ 3.5)
- **การอ่าน path:**
  - DB เก็บ slug แบบถอดแล้ว (NFC)
  - ทุก route แยก `new URL(request.url).pathname` เป็น segment แล้วถอดทีละ segment ด้วย `decodeURIComponent` (URIError → 404) และ `.normalize('NFC')` ก่อน query
  - ห้ามถอดทั้ง path ครั้งเดียว (`%2F` จะกลายเป็น `/`) และห้ามพึ่ง `Astro.params` ตรงๆ
  - path ที่ไม่ใช่รูป canonical → 301

**ค้นหา (`buildSearchQuery`)**

- **normalize คำค้นและ `text`/`nameKey`:** `normalizeThai` แล้วลบไม้ไต่คู้ วรรณยุกต์ การันต์ นิคหิต (U+0E47–U+0E4E) และลบช่องว่าง ขีด จุด วงเล็บภายในแต่ละฟิลด์ (คนพิมพ์วรรณยุกต์และเว้นวรรคไม่สม่ำเสมอ เช่น ซีรี่ย์/ซีรีย์)
- **แปลงคำค้น:**
  - trim, ≤100 ตัวอักษร
  - แยกตามช่องว่าง (≤5 คำ) → normalize ทีละคำ → นับความยาวเป็น codepoint (`[...s].length`)
- **ถ้ามีคำ ≥3 codepoint (ทาง FTS):**
  - ห่อแต่ละคำด้วย `"…"` (escape `"` เป็น `""`) ตัดคำ <3 ทิ้ง ต่อด้วยช่องว่าง (AND) แล้วส่ง `MATCH ?` แบบ bind parameter — ห้ามส่งข้อความดิบ (`"`, `:`, `(`, `*`, `AND/OR/NOT/NEAR` เป็นไวยากรณ์ FTS5)
  - จำกัดผู้สมัคร 300 อันดับแรกก่อน join เพื่อให้ rows read ไม่เกินงบไม่ว่าจะพบกี่รายการ:
    ```sql
    SELECT kind, refId FROM (
      SELECT d.kind, d.refId, row_number() OVER (PARTITION BY d.kind ORDER BY c.rank) AS rn
      FROM (SELECT rowid, rank FROM search_fts WHERE search_fts MATCH ?1 ORDER BY rank LIMIT 300) c
      JOIN search_doc d ON d.docId = c.rowid
      WHERE d.isPublic = 1)
    WHERE rn <= 20
    ```
- **ถ้าทุกคำ <3 codepoint (ทาง prefix):**
  - `UNION ALL` ของ subquery ต่อ kind:
    ```sql
    WHERE isPublic = 1 AND kind = ? AND nameKey >= ?1 AND nameKey < ?1 || char(1114111)
    ORDER BY nameKey LIMIT 20
    ```
  - ใช้ index `search_doc(isPublic, kind, nameKey)` ห้ามใช้ LIKE
- **หลังบ้าน:** ใช้ฟังก์ชันเดียวกันแต่แทน `isPublic = 1` ด้วย `isPublic IN (0, 1)` และส่ง kind เดียวเสมอ
- **error จากการค้น** แสดงเป็น "ไม่พบผลลัพธ์" แทน 500

**ปี:** เก็บ ค.ศ. แสดง "พ.ศ. {ปี+543} · {ปี}" ไม่ทราบปีแสดง "—"

### 6.5 ข้อจำกัดการเรียก D1 (แพ็กเกจฟรี)

**จำนวน query**

- **≤50 query ต่อ request** (นับทุก statement ใน `db.batch()` ไว้ก่อน เพราะเอกสารไม่ระบุชัด)
- หน้า SSR หนึ่งหน้าโหลดด้วย query ที่ join มาแล้ว ห้าม N+1 ต่อแถว/การ์ด และรวม query อิสระของหน้าเดียวกันเป็น `db.batch([...])` ครั้งเดียว — เป้าหมาย ≤10 statement ต่อหน้า

**bound parameter**

- **≤100 ต่อ statement**
- insert/update หลายแถวใช้ `json_each(?)` ส่ง JSON array เป็น parameter เดียว
- `IN (…)` ที่อาจยาวใช้ `IN (SELECT value FROM json_each(?))`
- การเรียงรูปใหม่: `UPDATE tape_image SET position = (SELECT j.value->>'$.p' FROM json_each(?1) j WHERE j.value->>'$.id' = tape_image.id), kind = … WHERE tapeId = ?2`
- statement ≤100 KB

**การทดสอบ:** ดูข้อ 10

## 7. แพ็กเกจฟรีและวิธีรับมือ

| ขีดจำกัด (Cloudflare Free) | วิธีรับมือ |
|---|---|
| Workers 100,000 requests/วัน | รูปโหลดตรงจาก R2 public URL ไม่ผ่าน Worker; static assets (JS/CSS/ฟอนต์) ไม่นับโควต้า; ไม่เปิด Workers Cache (`cache.enabled`) เพราะทำให้ static assets ถูกนับเป็น request |
| Workers CPU 10 ms/request (ไม่นับเวลารอ D1/R2; งาน SSR + auth มักใช้ 10–20 ms เกินบ่อยได้ Error 1102) | ย่อรูปในเบราว์เซอร์; island ที่ไม่ต้อง SSR ใช้ `client:only`; ส่วนอื่นเป็นสคริปต์ vanilla; หน้า public ส่ง HTML เบา; ดู CPU time p50/p99 ต่อ route ใน Workers Logs ก่อนเปิดใช้จริงและหลังเพิ่มฟีเจอร์; ถ้าเกินลดงาน SSR ของ route นั้น (ย้ายส่วนรองเป็น partial ที่โหลดทีหลัง) — Cache API (`caches.default`) ไม่มีผลบน `*.workers.dev` จึงใช้ cache HTML ได้หลังผูก custom domain เท่านั้น |
| Worker ≤64 MiB uncompressed (ไม่มีขีดจำกัด gzip แล้ว) และ startup (global scope) ≤1 วินาที | Astro + React islands; ห้ามทำงานหนักใน global scope (auth/drizzle สร้างแบบ lazy) |
| D1: ≤500 MB ต่อฐานข้อมูล (5 GB คือรวมทั้งบัญชี), 5M rows read/วัน, 100k rows written/วัน — เกินแล้ว query ทุกตัว error จนรีเซ็ต 00:00 UTC (07:00 เวลาไทย) | index ครบ (3.7), ตัวนับ denormalized, keyset pagination, FTS5, site_stats; งบ rows read ต่อหน้า (ด้านล่าง ทดสอบในข้อ 10); หน้า 503 เมื่อโควตาหมด; robots/noindex กัน bot ไล่ URL ตัวกรอง (ข้อ 4.5); แดชบอร์ดเตือนขนาด DB เกิน 400 MB |
| D1: ≤50 queries/request, ≤100 bound parameters/statement | ข้อ 6.5 |
| R2: 10 GB-month, Class A 1M/เดือน, Class B 10M/เดือน (Standard storage) | ต่อรูป: full WebP ~150–250 KB (JPEG จาก iPhone ~300–500 KB) + thumb ~30–50 KB, + OG ~100 KB ต่อเทป ≈ **25,000–40,000 รูป**; แดชบอร์ดเตือนเมื่อ `site_stats.imageBytes` เกิน 80% |
| r2.dev: rate-limited, สำหรับ non-production, ไม่มี edge cache (ทุกการโหลดรูป = 1 Class B) | `BUCKET.put(key, body, { httpMetadata: { contentType, cacheControl: 'public, max-age=31536000, immutable' } })` (key มี uuid จึง immutable) ให้เบราว์เซอร์ cache; URL รูปสร้างจาก `IMAGE_BASE_URL` ตัวเดียว ถ้าซื้อโดเมนภายหลังเปลี่ยนเป็น custom domain ได้โดยไม่แก้โค้ด (ได้ edge cache ด้วย) |

**งบ rows read ต่อหน้า**

| หน้า | งบ (rows read) |
|---|---|
| หน้าเทป | ≤150 (เทปทั่วไป 12 แทร็ก/6 รูป) / ≤400 (เทปขนาดสูงสุดตามข้อ 5.4) |
| หน้าเพลง | ≤150 |
| หน้าศิลปิน | ≤800 |
| หน้าค่าย | ≤400 |
| หน้า Collection | ≤400 |
| รายการ 24 แถว | ≤200 (ตัวกรองหลายตัวพร้อมกัน ≤5,000) |
| /artists, /labels | ≤200 |
| หน้าแรก | ≤300 |
| /latest | ≤600 |
| /me | ≤300 |
| ค้นหา | ≤500 |

**ข้อควรรู้สำหรับเจ้าของเว็บ**

- **การเปิดใช้ R2 ต้องผูกบัตรเครดิตหรือ PayPal** แม้ใช้แค่ free tier
- R2 ใช้เกิน free tier จะถูกเรียกเก็บเงินอัตโนมัติ ไม่ถูกบล็อกเหมือน Workers/D1 คำเตือน 80% ในแดชบอร์ดคือด่านป้องกัน

## 8. ความปลอดภัยและการจัดการข้อผิดพลาด

**สิทธิ์ของ action**

- action แอดมินทั้งหมดอยู่ใต้ key `admin` ของ `server` (`/_actions/admin.*`) สร้างผ่าน `defineAdminAction()` ที่เรียก `requireAdmin` ก่อน handler เสมอ
- action สมาชิก (`engagement.*`, `comments.create`, `comments.delete`) สร้างผ่าน `defineMemberAction()` (`requireUser`)
- middleware ใช้ `getActionContext(context)` ปฏิเสธทุก action ที่ชื่อขึ้นต้น `admin.` จากผู้ที่ไม่ใช่แอดมินอีกชั้น (401 ถ้าไม่ login, 403 ถ้าเป็นสมาชิก) เพราะการกัน path `/admin/*` ไม่ครอบคลุม `/_actions/*`
- ทุก action และหน้า (รวม `/me` และสถานะถูกใจ/มีเทปของผู้ใช้) ใช้ `locals.user.id` เสมอ ไม่รับ `userId` จาก input

**คอมเมนต์**

- **`comments.list({ tapeId | songId, cursor })`:**
  - เป็น action สาธารณะ (`defineAction` ปกติ) คืน DTO ทีละ 20 ตามกฎการมองเห็นข้อ 3.4
  - `isMine = locals.user?.id === comment.userId` (ผู้ชมทั่วไปเป็น false เสมอ)
- **normalize ฝั่งเซิร์ฟเวอร์ก่อนตรวจความยาว:** NFC, trim, ตัดอักขระควบคุม (ยกเว้น `\n`) และ bidi override (U+202A–U+202E, U+2066–U+2069), ยุบบรรทัดว่างเกิน 2 บรรทัด
- **`comments.create` เป็น INSERT คำสั่งเดียว** ที่ตรวจแบน + rate limit ในตัว เพื่อไม่ให้ request ที่ยิงพร้อมกันหลุดลิมิต:
  ```sql
  INSERT INTO comment (id, userId, tapeId, songId, body, createdAt)
  SELECT :id, :me, :tapeId, :songId, :body, :now
  WHERE (SELECT commentBanned FROM user WHERE id = :me) = 0
    AND (SELECT COUNT(*) FROM comment WHERE userId = :me AND createdAt > :now - 60000) < 5
    AND (SELECT COUNT(*) FROM comment WHERE userId = :me AND createdAt > :now - 86400000) < 50
    AND (/* เป้าหมายมองเห็นได้ตามข้อ 3.4 */)
  ```
  - นับรวมคอมเมนต์ที่ถูกลบแล้ว (กันการโพสต์-ลบวนเลี่ยงลิมิต)
  - แอดมินใช้เส้นทางที่ไม่ตรวจลิมิต
  - ถ้า `meta.changes = 0` ค่อย query แยกเพื่อบอกเหตุผลเป็นภาษาไทย
- **`comments.delete`** (ของตัวเอง):
  ```sql
  UPDATE comment SET deletedAt = :now, deletedBy = :me
  WHERE id = :id AND userId = :me AND deletedAt IS NULL
  ```
  - ถ้า `meta.changes = 0` ตอบ `NOT_FOUND` (ไม่แยกว่าไม่มีหรือเป็นของคนอื่น)
- **แอดมินลบ/กู้คืน:** `admin.comments.delete` / `admin.comments.restore`
- **ข้อมูลผู้เขียนที่ออกสู่สาธารณะ** (HTML ที่ SSR, props ของ island ที่ Astro serialize ลงหน้า, ผล `comments.list`) ใช้ DTO `{ id, body, createdAt, author: { name, image }, isMine }` เท่านั้น
  - query ระบุคอลัมน์ ห้าม select ทั้งแถว `user`
  - อีเมลแสดงเฉพาะใน `/admin/users` และ `/admin/comments`
- **avatar:** ใช้ `user.image` เฉพาะเมื่อ hostname ลงท้าย `.googleusercontent.com` ไม่งั้นใช้ avatar เริ่มต้น ชื่อที่แสดงตัดไม่เกิน 50 ตัวอักษร

**XSS และ CSP**

- **การ render ข้อความ:** ทุกช่องที่ผู้ใช้/แอดมินพิมพ์ (description, bio, lyrics, notes, คอมเมนต์, ชื่อผู้ใช้, ชื่อสมาชิกวง) เก็บเป็น plain text และ render ด้วย expression `{}` ของ Astro/React เท่านั้น
  - ห้าม `set:html` และ `dangerouslySetInnerHTML` (บังคับด้วย ESLint `astro/no-set-html-directive` และ `react/no-danger`)
  - partial ของ load-more เป็น HTML ที่ SSR เองจาก same-origin ด้วยกฎเดียวกัน
  - ขึ้นบรรทัด/ย่อหน้าใช้ CSS `white-space: pre-line`
- **JSON-LD** (ถ้ามี) ใช้ `JSON.stringify(data).replace(/</g, '\\u003c')`
- **เปิด `security.csp` ของ Astro** (ใช้ได้เพราะไม่มี ClientRouter) เพิ่ม resource:
  - `img-src`: `'self'`, `data:`, origin ของ `IMAGE_BASE_URL`, `https://*.googleusercontent.com`
  - `script-src`: `https://static.cloudflareinsights.com`
  - `connect-src`: `'self'`, `https://cloudflareinsights.com`
  - ห้ามใช้ attribute `style` ใน HTML ที่ SSR (CSP บล็อก) ใช้ class ของ Tailwind แทน การตั้ง style ผ่าน JS (Motion, `element.style`) ใช้ได้
- **security headers** (middleware ใส่ทุก response): `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`

**อัพโหลด (`admin.images.upload`, Action `accept: 'form'`, ทีละไฟล์ต่อ request)**

- **input:**
  - `entityType: z.enum(['tapes', 'artists', 'labels', 'collections'])`
  - `entityId: z.string().uuid()`
  - `variant: z.enum(['full', 'thumb', 'og'])`
  - `uuid: z.string().uuid().optional()` — ต้องมีเมื่อ variant = thumb และต้องมี object `-full` ของ uuid นั้นอยู่แล้ว
  - `file: z.instanceof(File)`, `file.size ≤ 3 MB`
- **variant `og`** รับเฉพาะ entityType = tapes และไม่สร้างแถว `tape_image`
- **ชนิดไฟล์** ต้องเป็น JPEG/WebP ตรวจจาก 12 ไบต์แรก (JPEG `FF D8 FF`, WebP `RIFF` + 4 ไบต์ + `WEBP`)
  - `httpMetadata.contentType` และนามสกุลกำหนดจากชนิดที่ตรวจได้ ไม่ใช้ `file.type` ของ client
- ตรวจว่า entity มีอยู่จริงก่อน `put`
- **key สร้างฝั่งเซิร์ฟเวอร์:** `{entityType}/{entityId}/{uuid}-{variant}.{jpg|webp}`
- บวก `site_stats.imageBytes` จาก `R2Object.size`
- **การลบรูป:** รับแค่ id ของแถว (`tape_image.id` หรือ id ของ entity) และลบ object ด้วย key ที่อ่านจาก DB เท่านั้น
- ถ้าลบ object ใน R2 ล้มเหลวหลัง DB สำเร็จ log ไว้ ไม่ย้อน DB (object กำพร้าเล็กน้อยรับได้ เช่นเดียวกับรูปที่อัพแล้วไม่ได้บันทึก)

**อื่นๆ**

- **`reelUrl`:** ต้องเป็น `https:` และ hostname ∈ {`www.facebook.com`, `facebook.com`, `m.facebook.com`, `web.facebook.com`, `fb.watch`} เก็บตามที่กรอก (trim) แสดงเป็นลิงก์ `target="_blank" rel="noopener"`
- **CSRF:**
  - Better Auth ตรวจ origin ของ `/api/auth/*`
  - Astro `security.checkOrigin` (ค่าเริ่มต้น) ครอบคำขอแบบ form/multipart
  - action แบบ JSON ต้องผ่าน CORS preflight (Astro ไม่ตอบ Allow headers) + cookie `SameSite=Lax`
- **ข้อความข้อผิดพลาด:** ภาษาไทย บอกว่าเกิดอะไรขึ้นและทำอะไรต่อ ไม่แสดง exception ดิบ

## 9. ดีไซน์: "คลังเทปแบบสารานุกรม" (แนว Metal Archives แบบเรียบ)

### 9.1 หลักการ

- **เก็บจาก Metal Archives:**
  - โทนมืดแบบห้องสมุด ข้อมูลแน่นแบบสารานุกรม
  - กล่องข้อมูล 2 คอลัมน์, แท็บ, ตาราง discography
  - เมนูซ้ายค้นตามตัวอักษร/ยุค/แนว และเครดิต "เพิ่มโดย / แก้ไขล่าสุด"
- **ตัดออก:** พื้นลายหินอ่อน, ลวดลายประดับ, ตัวอักษรเล็ก 11px, สีลิงก์หลายสี, กล่องโฆษณา
- **ทำให้สบายตา:** พื้นเรียบสีถ่านอุ่น, ตัวอักษรขาวนวล (ไม่ขาวจัด), ตัวอักษรใหญ่ขึ้น, ระยะห่างมากขึ้น, สีเน้นสีเดียว (ทองจากโลโก้เพจ)
- **mockup อ้างอิง:** [assets/2026-09-25-artist-mockup.html](assets/2026-09-25-artist-mockup.html)
  - แท็บ "คอมเมนต์" ในรอบที่ผู้ใช้เห็นถูกแทนด้วย "เพลงที่ร้อง" เพราะคอมเมนต์มีเฉพาะเทปและเพลง

### 9.2 Tokens (ธีมเดียว — มืด)

| Token | ค่า | ใช้กับ |
|---|---|---|
| `--bg` | `#14110E` | พื้นหลังหน้า |
| `--surface` | `#1C1814` | พื้นแถวที่ hover, ช่องค้นหา, dropdown, drawer |
| `--surface-2` | `#231E19` | กรอบรูปปก (contain), placeholder |
| `--border` | `#3A322A` | เส้นหัวตาราง, กรอบช่องกรอก, เส้นใต้แถบแท็บ |
| `--rule` | `#2E2720` | เส้นแบ่ง header/sidebar/ท้ายหน้า |
| `--row-rule` | `#241F1A` | เส้นระหว่างแถวตาราง |
| `--text` | `#E6DFD3` | ตัวอักษรหลัก |
| `--text-soft` | `#C9C0B2` | ย่อหน้า bio/description, โน้ต |
| `--text-muted` | `#A89C8A` | ข้อความรอง, แท็บที่ไม่เลือก |
| `--label` | `#8F8474` | ป้ายในกล่องข้อมูล, หัวคอลัมน์, เครดิตท้ายหน้า (ขนาด ≥13px เท่านั้น) |
| `--heading` | `#F0E6D2` | หัวเรื่อง |
| `--accent` | `#D4A24C` | ลิงก์, แท็บที่เลือก, focus ring, ปุ่มหลัก |
| `--accent-ink` | `#1A1409` | ตัวอักษรบนปุ่ม `--accent` |
| `--status` | `#D9785F` | สถานะ "แยกวง"/"เสียชีวิต", ข้อความ error |
| `--success` | `#8DB07A` | toast สำเร็จ |

- ทุกคู่สีตัวอักษร/พื้นที่ใช้จริงต้องผ่าน WCAG AA (ตรวจใน unit test ด้วยสูตร contrast ratio)
- ห้ามใช้ `opacity` กับตัวอักษร

### 9.3 Layout

**Container และ spacing**

- container `max-width: 1120px` (รวม sidebar) กึ่งกลาง
- padding ข้าง 16px (<640px) / 24px (≥640px)
- spacing ใช้ scale 4/8/12/16/24/32/48px

**Header** (สูง 56px เส้นล่าง `--rule`)

- <1024px: [☰] [ชื่อเว็บ] [ไอคอนค้นหา → กางช่องค้นหาเต็มแถวใต้ header] [avatar/เข้าสู่ระบบ]
- ≥1024px: ชื่อเว็บซ้าย, ช่องค้นหากว้าง 320px, avatar ขวา

**Sidebar** (≥1024px)

- กว้าง 208px ห่าง main 32px เส้นขวา `--rule`
- หัวกลุ่ม: Noto Serif Thai 14px `--heading`
- ลิงก์: 14px `--text-muted` สูงแถว 32px เยื้อง 8px, hover `--accent`

**หน้า entity** (ลำดับตามข้อ 4.3)

- H1 28px (+ ชื่อรอง 15px `--text-muted`)
- ≥1024px: `grid-template-columns: minmax(0,1fr) 240px; gap: 24px` — รูปปก/รูปศิลปิน/ปก Collection กว้าง 240px, โลโก้ค่าย 160px
- <1024px: รูปอยู่บน InfoBox กว้างสูงสุด 240px ชิดซ้าย; InfoBox 2 คู่ต่อแถวตั้งแต่ 640px

**รูปปก**

- หน้าเทปใช้สัดส่วนจริง (`width`/`height` จาก `tape_image` กัน CLS)
- TapeRow 48×48 และ TapeCard ใช้กรอบ `aspect-ratio: 1` + `object-fit: contain` บนพื้น `--surface-2` (ปกตลับเป็นแนวตั้ง ห้าม crop)
- ทุก `<img>` มี `width`/`height`, `loading="lazy"` (ยกเว้นรูปปกหลักของหน้าเทป), `decoding="async"`

**static assets**

- `public/og-default.jpg`: 1200×630 พื้น `--bg` + ชื่อเว็บสี `--heading` + ไอคอนตลับเทป `--accent`
- `public/favicon.svg`: ตลับเทป line-art `--accent`
- `CassetteIcon.astro`: SVG line-art ใช้ `currentColor` ใช้ใน Placeholder

### 9.4 ตัวอักษรและคอมโพเนนต์

**ฟอนต์**

- **Noto Serif Thai 500** — หัวเรื่อง ส่วนภาษาอังกฤษใช้ `font-variant: small-caps` ให้กลิ่น Metal Archives
- **IBM Plex Sans Thai 400/500** — เนื้อหาและตาราง
- **IBM Plex Mono 400** — ปี, ความยาว, รหัสตลับ, ตัวเลข
- **ขนาด:** เนื้อหา 15–16px line-height 1.7, ตาราง 14px, ป้าย 13px, H1 28px, H2 20px

**InfoBox และ Tabs**

- **InfoBox:** grid 2 คู่ต่อแถวบนจอ ≥640px (ป้าย `--label` / ค่า `--text`) 1 คู่ต่อแถวบนจอเล็ก ลิงก์ในค่าเป็น `--accent`
- **Tabs** (`Tabs.astro` + `src/scripts/tabs.ts`):
  - **HTML:** แถบแท็บเป็น `<a href="#id">` ทุก panel เป็น `<section id="id">` ที่มี `<h2>` — ไม่มี JS ทุก panel แสดงเรียงกัน ลิงก์แท็บเลื่อนไป panel
  - **มี JS:**
    - เพิ่ม `role=tablist/tab/tabpanel`, `aria-selected`, `aria-controls`
    - ซ่อน panel อื่นด้วย `hidden` และ h2 ด้วย sr-only
    - เลือกแท็บจาก `location.hash` (ไม่ตรงใช้แท็บแรก) เปลี่ยนแท็บแล้ว `history.replaceState` hash
    - ลูกศรซ้าย/ขวา/Home/End ตาม ARIA tabs pattern
  - **สไตล์:** แท็บ `--text-muted` แท็บที่เลือก `--heading` เส้นใต้ 2px `--accent` เป็น element เดียวเลื่อนตาม (ข้อ 9.5)

**ตารางและการ์ด**

- **DataTable:**
  - หัวคอลัมน์ `--label` 13px เส้นล่าง `--border` แถวคั่นด้วย `--row-rule` hover `--surface`
  - คอลัมน์ตัวเลขใช้ Mono ชิดขวา
  - บนจอ <640px ยุบเป็นรายการ (บรรทัดแรกชื่อ บรรทัดสองข้อมูลรองคั่น " · ")
- **TapeRow:** รูปย่อ 48×48 (`coverThumbKey`) + ชื่อชุด + ศิลปิน + ประเภท + ปี + ค่าย
- **TapeCard** (มุมมองกริด): กรอบปกสี่เหลี่ยม + ชื่อชุด 2 บรรทัด + ศิลปิน + ปี ขอบ `--border` มุม 4px

**ตัวช่วยนำทาง**

- **FilterBar** (`FilterBar.astro` + `src/scripts/filter-bar.ts`):
  - `<form method="get">` มี select ยุค/แนว/ประเภท/เรียง (เฉพาะที่รองรับตามข้อ 4.4) + ปุ่ม "กรอง" + ลิงก์ "ล้างตัวกรอง"
  - มี JS submit อัตโนมัติเมื่อเปลี่ยนค่าและซ่อนปุ่ม "กรอง"
  - ≥640px เป็นแถวเหนือตาราง; <640px อยู่ใน `<details>` ปุ่ม "ตัวกรอง (N)" กางเป็นแผงเต็มกว้าง
- **LetterBar:** แถวตัวอักษร ก–ฮ / A–Z / 0–9 เลื่อนแนวนอนได้บนมือถือ ตัวที่เลือกขีดเส้นใต้ `--accent`
- **Pagination:** ลิงก์ "หน้าถัดไป →" (`?cursor=`) `rel="nofollow"`

**องค์ประกอบย่อย**

- **Tag:** กรอบ 1px `--border` ตัวอักษร `--text-muted` 13px มุม 4px ("หายาก" ใช้กรอบและตัวอักษร `--accent`)
- **CreditLine:** ข้อความ 13px `--label` คั่นเส้น `--rule` ด้านบน
- **Placeholder:** กล่อง `--surface-2` + CassetteIcon สี `--text-muted`
- **ปุ่ม:**
  - หลัก: พื้น `--accent` ตัวอักษร `--accent-ink`
  - รอง: กรอบ `--border` ตัวอักษร `--text`
  - มุม 4px สูง ≥40px (≥44px บนจอสัมผัส)

**หน้าต่างและเมนู**

- **Lightbox** (`src/scripts/lightbox.ts`):
  - `<dialog>` + `showModal()` (focus trap และ Esc ในตัว) พื้น `::backdrop` `rgba(0,0,0,.85)`
  - รูปกลางจอ ปุ่มปิด/ก่อน/ถัดไป ลูกศรคีย์บอร์ด และปัดบนมือถือ
- **MobileNav** (`src/scripts/mobile-nav.ts`):
  - ปุ่ม ☰ (`aria-expanded`, `aria-controls`) เปิด `<dialog>` ด้วย `showModal()` เนื้อหาเดียวกับ Sidebar
  - ปิดเมื่อคลิกลิงก์หรือพื้นหลัง
  - ไม่มี JS ☰ เป็นลิงก์ `#site-nav` ไป Sidebar ที่แสดงท้ายหน้าบนจอ <1024px

### 9.5 แอนิเมชัน (Motion) — น้อยและนุ่ม

| ที่ | พฤติกรรม |
|---|---|
| Tabs | เส้นใต้เลื่อนไปแท็บใหม่ด้วย `animate(el, { x, width }, { duration: 0.2 })` (วัดตำแหน่งด้วย `getBoundingClientRect`) + panel fade 150ms |
| แถว/การ์ดที่โหลดเพิ่ม | `animate(newRows, { opacity: [0, 1], y: [6, 0] }, { duration: 0.2, delay: stagger(0.02) })` |
| Lightbox | เปิด: scale 0.96→1 + fade 200ms; เลื่อนรูป: slide 180ms |
| MobileNav | drawer เลื่อนเข้าจากซ้าย `x: ['-100%', 0]` 200ms |
| LikeButton / OwnButton | ไอคอน scale 1→1.25→1 (200ms) + ตัวเลขเปลี่ยน |
| bio "อ่านต่อ" | กางความสูงด้วย `animate` 250ms |
| ฟอร์มหลังบ้าน | `Reorder` ของ Motion ตอนลากเรียง |

**ลดการเคลื่อนไหว**

- ทุก React island ครอบด้วย `<MotionConfig reducedMotion="user">` ซึ่งปิดได้เฉพาะ transform/layout ส่วน fade เช็ค `useReducedMotion()` เอง
- สคริปต์ vanilla เช็ค `matchMedia('(prefers-reduced-motion: reduce)').matches` แล้วข้ามแอนิเมชัน (CSS media query ไม่หยุด animation ของ Motion)

**ระยะเวลา:** ทุกแอนิเมชัน ≤300ms

### 9.6 Responsive และการเข้าถึง

**ขนาดจอ**

- **Mobile-first:**
  - <640px: header + MobileNav, InfoBox 1 คอลัมน์, รูปอยู่บน InfoBox, ตารางเป็นรายการ, กริดปก 2 คอลัมน์, FilterBar ใน `<details>`
  - ≥640px: ตาราง, InfoBox 2 คู่ต่อแถว, กริด 3 คอลัมน์
  - ≥1024px: sidebar ถาวร, รูปอยู่ขวา InfoBox, กริด 4 คอลัมน์
  - ≥1280px: กริด 5 คอลัมน์
- ไม่มี horizontal scroll ของหน้า (ยกเว้น LetterBar ที่เลื่อนในตัวเอง)

**การเข้าถึง**

- contrast ผ่าน WCAG AA
- target กดได้ ≥44px บนจอสัมผัส
- ใช้คีย์บอร์ดได้ครบ: focus ring 2px `--accent`, Tabs ตาม ARIA pattern, Reorder มีปุ่ม ↑/↓, dialog ใช้ `showModal()`
- **alt ของรูป:**
  - ปก: "{kind ภาษาไทย} {ชื่อชุด} – {ศิลปิน}" เช่น "ปกหน้า หน้าร้อน – วงตัวอย่าง"
  - รูปศิลปิน: "รูป {ชื่อศิลปิน}"
  - โลโก้: "โลโก้ {ชื่อค่าย}"
- `lang="th"` ที่ `<html>`

## 10. การทดสอบ

**Unit (Vitest)**

- `thaiSortKey` (เทียบ Intl.Collator กับชื่อจริง ≥100 ชื่อ), `normalizeThai`
- `slugify` / `slugCandidates` (ยาว ≤80 ทุกกรณี) / `decodePathSegments`
- `buildSearchQuery` (ดูกรณีทดสอบด้านล่าง)
- `safeNextPath` (`//evil`, `/\evil`, `https://evil`, `javascript:`), `parseAdminEmails` (substring, ตัวพิมพ์, ช่องว่าง)
- magic-byte sniff, format ปี/เวลา/สถานะศิลปิน (รวม artistType NULL), Zod schemas (ขีดจำกัดข้อ 5.4 และการแปลง พ.ศ.)
- parse รายชื่อเพลงหลายบรรทัด, ตรวจ `reelUrl`, contrast ของ token สี (ข้อ 9.2), `provinces.ts` มี 77 จังหวัดไม่ซ้ำ

**กรณีทดสอบ `buildSearchQuery`**

- "อัสนี-วสันต์" เจอ
- คำที่มี `"` / `*` / `OR` ไม่ error
- "ซีรีย์" เจอ "ซีรี่ย์"
- "เบิร์ดธงไชย" เจอ "เบิร์ด ธงไชย"
- "ใจ" ใช้ทาง prefix

**Integration**

- **เครื่องมือ:** Vitest 4.1.x + `@cloudflare/vitest-plugin` (`cloudflareTest()`), D1/R2 จำลองด้วย Miniflare
  - โหลด migration ด้วย `readD1Migrations()` + `applyD1Migrations(env.DB, …)`
  - ทดสอบ service layer (`src/lib/services/*`) ไม่ import `astro:actions`
  - ถ้า `main` ของ Astro ใน wrangler.jsonc resolve ไม่ได้ กำหนด binding ผ่าน `miniflare: { d1Databases: ['DB'], r2Buckets: ['BUCKET'] }`
- **เทป:**
  - CRUD พร้อม tracklist
  - บันทึกเทป 40 แทร็กใหม่/20 ศิลปินสำเร็จ ด้วย batch ≤40 statement และทั้ง request (รวม session และอ่านก่อน batch) ≤50
  - `createDraft` → อัพรูปคู่ full/thumb → แถว `tape_image` ถูกต้อง
  - thumb ที่ไม่มี full คู่ถูกปฏิเสธ
  - ลบปกหลักแล้ว coverImageId/coverThumbKey เปลี่ยนเป็นรูปถัดไป
- **การมองเห็น:**
  - เทปร่าง/เพลงที่ publishedTapeCount = 0 ได้ 404 สำหรับผู้ชม และไม่อยู่ในผลค้นหาสาธารณะ แต่แอดมินค้นเจอ
  - เผยแพร่/ยกเลิกเผยแพร่แล้ว publishedTapeCount ของเพลง/ศิลปิน/ค่าย/แนวถูกต้อง
  - แก้ชื่อศิลปินแล้วค้นเจอเทปด้วยชื่อใหม่
  - แก้ชื่อศิลปินที่มี >200 docs แล้ว search_queue ถูกใช้และ `admin.search.continue` ทำจนคิวว่าง
- **การลบ:**
  - ลบเทปแล้ว collection_item/likes/comments หายแต่เพลงยังอยู่ และ imageBytes ลดตามจริง
  - ลบเพลง/ศิลปินที่ยังผูกถูกปฏิเสธ
- **redirect:** A→B→C กลายเป็น A→C, เปลี่ยนกลับ B→A ไม่เกิด loop, slug ไทยแบบ percent-encoded หาเจอ
- **ตัวนับและคอมเมนต์:**
  - `setTapeLike(true)` และ `setSongLike(true)` ซ้ำ 2 ครั้ง (รวมแบบยิงพร้อมกัน) แล้ว likeCount = 1
  - ลบ/กู้คืนคอมเมนต์เทปและเพลงแล้ว commentCount ถูกต้อง
  - คอมเมนต์บนเพลงที่ publishedTapeCount = 0 ถูกปฏิเสธ "ไม่พบรายการนี้"
  - สมาชิก B ลบคอมเมนต์ของ A ไม่ได้
  - rate limit 5/นาที ถูกบังคับแม้ยิงพร้อมกัน 10 request, ผู้ใช้ที่ถูกแบนคอมเมนต์ไม่ได้
  - `comments.list` เรียกได้โดยไม่ login
- **ศิลปิน:**
  - บันทึกพร้อมสมาชิก 3 คน (สลับลำดับ, isCurrent ผสม) แล้ว artist_member ตรงลำดับ
  - ค้นชื่อสมาชิกเจอศิลปิน
  - สร้างจาก EntityPicker ด้วยชื่ออย่างเดียวได้ artistType NULL / status `unknown`
  - `/artists?province=` แสดงเฉพาะศิลปินที่มองเห็นในจังหวัดนั้น
- **Collection:**
  - เทปร่างใน Collection ไม่แสดงและไม่ถูกใช้เป็นปกสำรอง
  - Collection ร่างได้ 404
  - หน้าแรกแสดง Collection เด่นไม่เกิน 3
- **สิทธิ์:**
  - สมาชิกเรียก `POST /api/auth/update-user` พร้อม `{ role: 'admin', commentBanned: false }` แล้วค่าใน DB ไม่เปลี่ยน
  - แอดมินถอดตัวเอง/ถอดคนใน ADMIN_EMAILS ถูกปฏิเสธ
- **อัพโหลดและ OG:**
  - ไฟล์ที่ไม่ใช่ webp/jpeg (ตาม magic bytes) หรือ >3 MB ถูกปฏิเสธ
  - เปลี่ยนปกหลักหรือชื่อแล้ว ogSourceImageId/ogSourceTitle เปลี่ยนตามและ imageBytes ไม่เพี้ยน
- **ผู้ชมทั่วไป:** HTML หน้าเทปที่มีคอมเมนต์ไม่มีสตริงอีเมลของผู้คอมเมนต์
- **การใช้ D1:**
  - `EXPLAIN QUERY PLAN` ของทุก query หน้าสาธารณะผ่านกฎข้อ 3.7
  - **งบ rows read:** seed 5,000 เทป / 40,000 เพลง / 40,000 รูป รวมเทป 60 แทร็ก/40 รูป, ศิลปินที่มี 150 เทป/400 เพลง และแนวที่มี 2,000 เทป แล้วห่อ D1 binding ให้รวม `meta.rows_read` ต่อหน้า — เกินงบข้อ 7 ให้ fail
- **ทุก admin action ถูกกันสิทธิ์ (อัตโนมัติ):** test สร้างรายชื่อ action จาก key ของ `server.admin` แบบ recursive แล้ว POST ไป `/_actions/<ชื่อ>` (ผ่าน E2E server) ยืนยันว่าผู้ไม่ login และสมาชิกถูกปฏิเสธทุกตัว — action ใหม่ถูกทดสอบโดยไม่ต้องเพิ่มเคสเอง

**E2E (Playwright บน local dev)**

- global-setup เขียนแถว `user`/`session` ลง D1 local ด้วย `wrangler d1 execute --local` และตั้ง cookie session ที่เซ็นด้วย `BETTER_AUTH_SECRET` จาก `.dev.vars`
- **ไม่มี HTTP route สำหรับ seed** ถ้าจำเป็นต้องมี ต้องขึ้นต้นด้วย `if (!import.meta.env.DEV) return new Response(null, { status: 404 })` ห้ามใช้ env var runtime เป็นสวิตช์
- ทุกสถานการณ์ตรวจว่าไม่มี CSP violation ใน console
- **สถานการณ์ที่ต้องผ่าน:**
  1. แอดมินสร้างเทป + อัพรูป + tracklist + ศิลปินใหม่ → เผยแพร่ → หน้าเทป/ศิลปิน/เพลงแสดงถูกต้อง
  2. สมาชิกกดถูกใจ/มีเทป/คอมเมนต์ในหน้าเทป → เห็นใน `/me`; ออกจากระบบแล้วกดถูกใจถูกพาไป login
  3. สมาชิกถูกใจเพลงและคอมเมนต์ในหน้าเพลง → เห็นในแท็บ `#liked-songs` ของ `/me`
  4. ผู้ชมทั่วไปค้นหาคำไทยเจอเทป; `/artists?l=ก` เรียงถูก; "โหลดเพิ่ม" ใน `/tapes` ต่อแถวได้ทั้งมีและไม่มี JS
  5. ผู้ชมทั่วไปเข้า `/admin` ไม่ได้, สมาชิกเข้าได้หน้า 403
  6. เปลี่ยนปกหลักของเทปที่เผยแพร่แล้ว → `og:image` ชี้ไปรูปใหม่ และ HTML ที่ได้โดยไม่รัน JS มี og:title/og:description/og:image ครบ
  7. แอดมินสร้างศิลปิน (ประเภท/สถานะ/จังหวัด/ปีที่ทำงาน/สมาชิก/รูป) และ Collection (ปก + 2 เทป) แล้วเผยแพร่ → กล่องข้อมูล แท็บสมาชิก และหน้า Collection ถูกต้อง
  8. แท็บหน้าเทปใช้คีย์บอร์ดได้, `#comments` เปิดแท็บคอมเมนต์ตรง, ปิด JS แล้วทุก panel แสดง
  9. ที่ 375px: ☰ เปิด/ปิดเมนูได้ด้วยคีย์บอร์ด, ตารางยุบเป็นรายการ, `document.documentElement.scrollWidth <= innerWidth`; ที่ 1280px sidebar แสดงถาวร

**ก่อน deploy**

- ตรวจขนาดด้วย `wrangler deploy --dry-run --outdir bundled/` (uncompressed <64 MiB งบภายใน <10 MiB)
- วัด startup ด้วย `wrangler versions upload` ซึ่งรายงาน `startup_time_ms` ต้อง <1000

## 11. การ deploy และสำรองข้อมูล

1. **Google OAuth client** (Google Cloud Console, Web application)
   - Authorized redirect URIs: `{SITE_URL}/api/auth/callback/google` และ `http://localhost:4321/api/auth/callback/google`
   - OAuth consent screen: External, scopes `openid` `email` `profile` แล้วกด Publish app → In production (scope พื้นฐานไม่ต้องผ่าน verification)
2. **R2:** ผูกวิธีชำระเงินในบัญชี Cloudflare (จำเป็นสำหรับการเปิดใช้) แล้ว `wrangler r2 bucket create seriesbumb-images` เปิด r2.dev public access → ได้ `IMAGE_BASE_URL`
3. **D1:** `wrangler d1 create seriesbumb` ใส่ id ใน `wrangler.jsonc`
4. **secrets:** `wrangler secret put` สำหรับ secrets ในข้อ 6.2
5. **migrations:** `wrangler d1 migrations apply seriesbumb --remote`
6. **deploy:** `astro build && wrangler deploy` (ตั้ง `IMAGE_BASE_URL` ใน env ตอน build ด้วย) → `seriesbumb.<account>.workers.dev` และ `SITE_URL` ต้องตรงกับ URL นี้
7. **smoke test บน production:**
   - หน้าแรก, login Google, สร้างเทปทดสอบ
   - ตรวจ `og:image` ด้วย Facebook Sharing Debugger
   - `/api/test/*` ต้องตอบ 404
8. **Web Analytics:** สร้างไซต์ใน Cloudflare Web Analytics ด้วย hostname workers.dev แล้วตั้ง `CF_BEACON_TOKEN`
9. **สำรองข้อมูล:**
   - **หลัก:** D1 Time Travel (Free ย้อนได้ 7 วัน: `wrangler d1 time-travel restore`) กู้แล้วไม่ต้องสร้างดัชนีใหม่ เพราะ search_fts ถูกกู้ไปด้วย
   - **backup นอกระบบรายสัปดาห์:** `scripts/backup.ts` ดึงทุกตารางปกติ (ยกเว้น `search_fts` และตาราง shadow ของ FTS5) ด้วย `wrangler d1 execute --remote --json` เก็บเป็นไฟล์ JSON — `wrangler d1 export` ใช้ไม่ได้เพราะ DB มี virtual table
   - **กู้จาก JSON:** `scripts/restore.ts` import ทีละตาราง/ทีละชุด และหยุดเมื่อใกล้ 80k rows written ต่อวัน (ทำต่อได้ บนแพ็กเกจฟรีอาจใช้หลายวัน) แล้วจึงรัน "สร้างดัชนีค้นหาใหม่"
10. **README.md** (ภาษาไทย) เขียนขั้นตอนทั้งหมด + วิธี dev ในเครื่อง (`.dev.vars`, `wrangler d1 migrations apply --local`)
