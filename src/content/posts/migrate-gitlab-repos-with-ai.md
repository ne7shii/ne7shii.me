---
title: 'ผมใช้ AI ย้าย GitLab ทีละหลายสิบ repo ยังไง'
published: 2026-06-19
draft: false
description: 'เล่า workflow จริงที่ผมใช้ Claude Code ย้าย GitLab เป็นชุดทีละหลายสิบ repo — วางแผน export/import vs mirror, ให้ AI ทำงานซ้ำๆ (mirror, copy CI vars, grant member), verify ด้วยตัวเลขทุก repo และให้มันเขียน migration report'
tags: ['gitlab', 'migration', 'claude-code', 'ai', 'git', 'devops', 'automation', 'ci-cd']
toc: true
---

:::guy1
ต้องย้าย GitLab จากเครื่องเก่าไปเครื่องใหม่ มี repo เป็นร้อยตัว กระจายหลาย group แถมมี CI variable กับ member สิทธิ์ต่างๆ กันด้วย จะนั่งย้ายมือทีละตัวก็ตายพอดี ทำไง?
:::

:::ne7shii
ผมไม่ได้นั่งย้ายมือครับ — ผมให้ **Claude Code** ช่วยย้ายเป็นชุด ทีละหลายสิบ repo ต่อรอบ ตั้งแต่ mirror code, copy CI variable, grant member ไปจนถึง verify แล้วเขียน report ให้ โพสต์นี้จะเล่า workflow จริงที่ผมใช้
:::

:::claude
งานย้าย repo เป็นงานที่ "ขั้นตอนเดิมซ้ำหลายสิบรอบ" — เหมาะกับ AI อย่างผมมากครับ เพราะผมไม่เบื่อ ไม่ลืมขั้นตอน และนับตัวเลข verify ได้ทุก repo ไม่ตกหล่น เดี๋ยว ne7shii เล่าให้ฟังว่าเราแบ่งงานกันยังไง
:::

## ทำไมงานนี้เหมาะกับ AI

migration เป็นงานที่ **น่าเบื่อและพลาดง่ายเมื่อทำมือ** แต่มี pattern ชัดมาก — แต่ละ repo ต้องทำขั้นตอนเดิมซ้ำ: mirror → copy CI vars → grant member → verify นี่คือลักษณะงานที่ AI ช่วยได้ดีที่สุด เพราะ:

- ขั้นตอน **ซ้ำเดิมทุก repo** — คนทำสิบตัวก็เริ่มลืมขั้น พลาดบางอย่าง แต่ AI ทำเหมือนเดิมทุกครั้ง
- เกือบทุกอย่างทำผ่าน **CLI กับ API** (git, GitLab API) — สิ่งที่ Claude Code รันได้จริงใน terminal
- การ verify คือ **นับตัวเลขให้ตรง** (branch/tag/CI var) — งานที่คนขี้เกียจทำครบ แต่ AI ทำให้ทุก repo
- พอเสร็จต้องมี **migration report** — น่าเบื่อสำหรับคน แต่ AI สรุปให้ระหว่างทางได้ฟรีๆ

:::note
ผมไม่ได้ใช้ Claude แบบ "เขียน script ให้หน่อย" แล้วเอาไปรันเอง — แต่ใช้มันเป็น **engineer ที่อยู่ใน terminal เดียวกัน** รัน git/API ได้จริง เห็น output จริง แล้วตัดสินใจขั้นต่อไปจาก output นั้น ทีละ repo จนครบทั้งระลอก
:::

## ขั้นที่ 1 — วางแผนวิธีย้ายก่อน

ผมไม่เริ่มจากสั่ง "ย้ายเลย" — ผมให้ Claude ช่วยตัดสินใจก่อนว่าจะใช้วิธีไหน เพราะ GitLab มีหลายทางย้าย แต่ละแบบเหมาะกับงานต่างกัน

| วิธี | ได้อะไรมาด้วย | เหมาะกับ |
|---|---|---|
| **Project export/import** | code + issues + MR + setting | ย้ายทีละ project พร้อม metadata |
| **Git mirror (push)** | branch + tag ทั้งหมด (code ล้วน) | ย้ายเป็นชุดเยอะๆ, control ละเอียด |

ใน PoC แรกเราลอง **export/import** ย้าย service หนึ่งจาก GitLab เวอร์ชันเก่าไปเวอร์ชันใหม่ — ได้ branch ครบ verify ผ่าน เหมาะกับย้ายทีละตัวที่อยากได้ issue/MR ติดไปด้วย

แต่พอต้องย้าย **เป็นระลอกหลายสิบ repo** ผมกับ Claude สรุปว่าใช้ **git mirror** เป็นหลักดีกว่า เพราะ control ได้ละเอียดและ verify ง่ายกว่า

:::tip
การให้ AI ช่วย "เลือกวิธี" ก่อน save เวลามาก — มันสรุป trade-off ให้เห็นภาพ แล้วเราตัดสินใจร่วมกัน แทนที่จะรีบย้ายผิดวิธีแล้วมาแก้ทีหลังตอนทำไปครึ่งระลอกแล้ว
:::

## ขั้นที่ 2 — ปล่อยให้ AI ทำงานซ้ำๆ ทีละ repo

พอล็อกวิธีได้ ผมให้ Claude ไล่ย้ายทีละ repo ตาม loop เดิม สิ่งที่มันทำให้แต่ละ repo คือ 3 อย่างนี้

### mirror code

```bash title="Claude รัน mirror ทีละ repo"
git clone --mirror https://old-gitlab.example.com/group/repo.git
cd repo.git
git remote set-url --push origin https://new-gitlab.example.com/new-group/repo.git
git push --mirror
```

### copy CI/CD variables ผ่าน API

variable ของ CI ไม่ได้อยู่ใน git — Claude ดึงจากเครื่องเก่าผ่าน API แล้วสร้างที่เครื่องใหม่ให้ครบ (ในงานจริงมีตั้งแต่ 14–29 ตัวต่อ project):

```bash title="copy CI variables ผ่าน API"
curl -s --header "PRIVATE-TOKEN: $OLD_TOKEN" \
  "https://old-gitlab.example.com/api/v4/projects/$OLD_ID/variables" > vars.json

jq -c '.[]' vars.json | while read v; do
  curl -s --request POST --header "PRIVATE-TOKEN: $NEW_TOKEN" \
    "https://new-gitlab.example.com/api/v4/projects/$NEW_ID/variables" \
    --data-urlencode "key=$(echo "$v" | jq -r .key)" \
    --data-urlencode "value=$(echo "$v" | jq -r .value)"
done
```

### grant member ตาม access level เดิม

Claude map สมาชิกและ access level จากเครื่องเก่าให้ตรง level เดิม ส่วน user ที่ยังไม่มี account บนเครื่องใหม่ก็ **log ไว้เพื่อส่ง invite ทีหลัง** ไม่ปล่อยให้เงียบหาย

## ขั้นที่ 3 — Verify ด้วยตัวเลข ทุก repo

นี่คือจุดที่ AI ช่วยได้เด่นมาก — **นับให้ตรงทุก repo** ผมให้ Claude verify หลังย้ายแต่ละตัวด้วย output จริง ไม่ใช่เชื่อว่า "push ผ่าน = เสร็จ"

```bash title="verify นับ branch/tag สองฝั่งให้ตรง"
# ฝั่งเก่า
git ls-remote --heads https://old-gitlab.example.com/group/repo.git | wc -l
git ls-remote --tags  https://old-gitlab.example.com/group/repo.git | wc -l
# ฝั่งใหม่ — ต้องได้ตัวเลขเท่ากันเป๊ะ
git ls-remote --heads https://new-gitlab.example.com/new-group/repo.git | wc -l
git ls-remote --tags  https://new-gitlab.example.com/new-group/repo.git | wc -l
```

ในระลอกจริง Claude verify ให้ว่า "26/26 repos mirrored, branch/tag counts ตรงเป๊ะ, CI vars copied ครบ" — ตัวเลขพวกนี้คือสิ่งที่ทำให้ผมมั่นใจว่าย้ายครบจริง ไม่ใช่เดา

:::tip
ให้ AI verify ด้วยตัวเลขทุก repo คือสิ่งที่คนมักข้าม เพราะน่าเบื่อ — แต่นี่แหละจุดที่ migration พลาดเงียบๆ เช่น push ผ่านแต่ ref ไม่ครบ การมี AI นับให้ครบทุกตัวเลยมีค่ามาก
:::

## ขั้นที่ 4 — ให้เขียน Migration Report

ขั้นที่ผมชอบที่สุด — พอจบแต่ละระลอก ผมให้ Claude สรุปเป็น **`batch-migration-report.md`** ระหว่างที่ context ยังครบ ว่าย้ายอะไรไปบ้าง verify อะไรแล้ว และอะไรที่ยัง block

:::ne7shii
สรุประลอกนี้เป็น batch-migration-report.md — repo ที่ย้าย, branch/tag/CI var ที่ verify, member ที่ grant, user ที่ต้อง invite, และ repo ที่ยัง block พร้อมเหตุผล
:::

report นี้คือ **source of truth** เวลามีคนถามว่า "repo นี้ย้ายหรือยัง" และเป็นหลักฐานว่าเรา verify จริง ไม่ใช่เดาว่าน่าจะครบ — ระลอกถัดไปก็แค่บอก Claude ว่า "ทำตามแบบระลอกก่อน แต่เปลี่ยนเป็น group นี้" มันก็ทำซ้ำได้เลย

## สิ่งที่ผมยังตัดสินใจเอง

ถึงจะให้ AI ทำงานซ้ำๆ เยอะ แต่มีเรื่องที่ผม **ไม่ปล่อยให้มันตัดสินใจแทน**:

- **access level ของ member** — ใครควรได้สิทธิ์ระดับไหนบนเครื่องใหม่ เป็นเรื่อง security ที่ผม review เอง
- **branch ไหนแตะได้** — main ของ production ผมคุมเองว่าจะ force-push ทับหรือไม่
- **repo ที่ติด protected-branch** — มีระลอกที่ re-sync แล้ว 1 repo ถูก protected-branch rule บล็อก force-push **ซึ่งถูกต้องแล้ว** (งานย้ายไปอยู่เครื่องใหม่จริง) ผมเป็นคนตัดสินว่าปล่อยไว้แบบ new-ahead ไม่ฝืน
- **token / secret** — ไม่ commit ค่า CI variable จริงเข้า git เด็ดขาด

:::caution
AI ช่วยให้ย้ายเร็วขึ้นมาก แต่ **เรื่องสิทธิ์และ secret ยังเป็นความรับผิดชอบของเรา** — โดยเฉพาะ access level กับ protected branch อย่าปล่อยให้ automation force ทุกอย่างให้ "เหมือนกันเป๊ะ" โดยไม่คิด บางครั้งการที่มันย้ายไม่ได้คือระบบกำลังปกป้องคุณอยู่
:::

## สรุป

workflow ของผมกับ Claude Code สำหรับย้าย GitLab เป็นชุดสรุปเป็น 4 ขั้น:

1. **วางแผนวิธีย้าย** — export/import vs mirror ให้ตรงงาน
2. **ปล่อยให้ AI ทำงานซ้ำ** ทีละ repo — mirror, CI vars, member
3. **verify ด้วยตัวเลข** ทุก repo — นับ branch/tag/var ให้ตรง
4. **ให้เขียน migration report** ทุกระลอก

มันไม่ได้แทนความเข้าใจเรื่อง GitLab ของผม — แต่ทำให้ผมโฟกัสกับ **การตัดสินใจ** (วิธีย้าย, สิทธิ์, branch policy) ส่วนงาน mechanical ที่ซ้ำหลายสิบรอบและพลาดง่ายก็ให้ AI ไล่ให้ครบ ผลคือย้ายเสร็จเร็วขึ้น พลาดน้อยลง และมี report ครบทุกระลอก

:::guy1
สรุปคือให้ AI ทำงานซ้ำๆ ทีละ repo แต่ verify ด้วยตัวเลขแล้วเราคุมเรื่องสิทธิ์เองใช่มั้ย?
:::

:::ne7shii
ใช่เลยครับ — **AI ย้ายซ้ำๆ ไม่ลืมไม่เบื่อ ผมคุม design กับ security** พอแบ่งงานแบบนี้ migration ที่เคยเป็นงานน่าเบื่อสุดๆ ก็จบได้ไวและไม่ตกหล่นครับ
:::

:::claude
แล้วอย่าลืมให้ผมเขียน report ทุกระลอกนะครับ — ระลอกหน้าจะได้ทำซ้ำได้ทันที :rocket:
:::
