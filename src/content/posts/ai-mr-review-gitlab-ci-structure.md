---
title: 'วาง Structure ให้ Claude รีวิว Merge Request ใน GitLab CI'
published: 2026-06-20
draft: false
description: 'เล่าวิธีที่ผมวาง structure ให้ AI รีวิว MR แบบใช้ได้จริงทั้งทีม — เก็บ workspace (skill + script) ไว้ใน git ให้ทุกคน contribute ได้, มี CI auto-build image ทุกครั้งที่ workspace มี commit ใหม่, แล้ว pipeline ของ repo อื่นก็ดึง image นั้นมารัน code review ผ่าน GitLab CI/CD Component'
tags: ['claude-code', 'ai', 'gitlab', 'code-review', 'ci-cd', 'docker', 'platform-engineering', 'devops']
toc: true
---

:::guy1
อยากให้ AI ช่วยรีวิว MR ทั้งทีม ลองเอา prompt ไปแปะรันใน CI ดูแล้ว แต่มันมั่วมาก — แต่ละ repo ก็ทำกันคนละแบบ อัปเดต prompt ทีต้องไล่แก้ทุกที่ ทำยังไงให้มันเป็นระบบ?
:::

:::ne7shii
ปัญหาคือมันยัง **ไม่มี structure** ครับ — ผมแก้ด้วยการแยกเป็น 3 ชิ้นที่ชัดเจน: **workspace ใน git** ที่ทุกคนในทีม contribute ผ่าน MR ได้, **CI ที่ auto-build image** ทุกครั้งที่ workspace มี commit ใหม่, แล้ว **pipeline ของ repo อื่น** ก็ดึง image นั้นมารันรีวิวผ่าน GitLab CI/CD Component โพสต์นี้จะเล่าว่าวางแต่ละชิ้นยังไง
:::

:::guy2
ทำไมต้องแยกขนาดนั้น? เขียน script เดียวจบไม่ได้เหรอ?
:::

:::ne7shii
ได้ครับ แต่พอมีหลาย repo แล้วมันพังเร็วมาก — prompt กระจาย, แต่ละที่ใช้ tool คนละเวอร์ชัน, อัปเดตทีไล่แก้ไม่ไหว การแยก concern ทำให้ **แก้ที่เดียว มีผลทั้ง fleet** เดี๋ยวดูกันทีละชิ้น
:::

## ทำไม structure ถึงสำคัญกว่า prompt

ตอนเริ่มผมก็คิดเหมือนหลายคน — เขียน prompt เก่งๆ แล้วโยนเข้า CI ก็จบ แต่พอจะใช้จริง **ทั้งทีมหลาย repo** ปัญหาโผล่มาทันที:

- **prompt/script กระจาย** — แต่ละ repo copy ไปแก้เอง สุดท้ายไม่มีใครรู้ว่าเวอร์ชันไหนคือของจริง
- **environment ไม่เหมือนกัน** — repo นึงมี `jq` อีก repo ไม่มี, Claude Code คนละเวอร์ชัน ผลรีวิวเลยไม่คงเส้นคงวา
- **อัปเดตยาก** — แก้ logic รีวิวที ต้องไปไล่ทุก repo

ทางออกของผมคือมองมันเป็น **product ชิ้นหนึ่ง** ที่มี source of truth เดียว แล้วแยกเป็น 3 ส่วน:

```text title="3 ชิ้นที่แยก concern กัน"
1. Workspace (git)      → "สมอง" — skill + script + template ที่ทุกคน contribute ได้
2. Build pipeline       → "โรงงาน" — auto-build image ทุกครั้งที่ workspace มี commit
3. CI/CD Component       → "ทางเข้า" — repo อื่นดึง image มารันรีวิวได้
```

ภาพรวมของทั้งระบบเป็นแบบนี้ — แบ่งชัดเป็น 2 ฝั่ง: ฝั่ง **contribute → build** กับฝั่ง **execute**:

![โครงสร้าง AI MR review: workspace → build image → pipeline ใช้ image](/blog/ai-mr-review-structure.svg)

แต่ละชิ้นเปลี่ยนแยกกันได้ และ image มีเวอร์ชันของตัวเอง — นี่คือหัวใจที่ทำให้มัน maintain ได้จริง

## ชิ้นที่ 1 — Workspace ใน git

ผมเก็บทุกอย่างที่เป็น "สมอง" ของการรีวิวไว้ใน repo กลาง repo เดียว (ผมเรียกมันว่า `platform/core`) เป็น **workspace bundle** — รวม skill, script และ template ไว้ในที่เดียว ใช้ layout แบบนี้:

```text title="โครงสร้าง workspace ใน git"
platform/core/
├── ai/
│   └── workspaces/
│       └── code-review/
│           ├── SKILL.md            # คำสั่ง + วิธีรีวิว (สมองจริงๆ)
│           ├── review-template.md  # โครงรายงานรีวิวที่ตายตัว
│           ├── fetch-diff.sh       # ดึง diff ของ MR ผ่าน API
│           ├── post-note.sh        # โพสต์ผลกลับเข้า MR
│           ├── Dockerfile          # นิยาม base image (ชิ้นที่ 2)
│           └── README.md           # วิธี build / run / ใช้ใน CI
├── templates/
│   └── ai-review.yml               # CI/CD Component (ชิ้นที่ 3)
└── docs/adr/                       # ADR บันทึกการตัดสินใจ
```

`SKILL.md` คือหัวใจ — มันบอก Claude ว่ารีวิวยังไง โฟกัสอะไร (correctness, security, audit, naming) แล้ว format ผลตาม template ก่อนโพสต์ ส่วน script เป็นแค่ "มือ" ที่ดึง diff กับโพสต์ note

### ให้ทุกคนในทีม contribute ได้

จุดที่ผมตั้งใจที่สุดคือ — workspace นี้ **ไม่ใช่ของผมคนเดียว** แต่เป็นของทีม ใครเจอว่า AI รีวิวพลาดแบบไหน หรืออยากให้มันโฟกัสเรื่องอะไรเพิ่ม ก็ **เปิด MR เข้ามาที่ `platform/core` ได้เลย** เหมือน contribute โค้ดทั่วไป

เพื่อให้ contribute ได้อย่างปลอดภัย ผมวางกติกาไว้ใน repo:

- **CODEOWNERS** — การแก้ `SKILL.md` หรือ Dockerfile ต้องผ่าน reviewer ที่กำหนด ไม่ใช่ใครก็ merge ได้
- **README** — บอกชัดว่าแต่ละไฟล์ทำอะไร build/test ยังไง คนใหม่อ่านแล้วเริ่ม contribute ได้เลย
- **ADR** — บันทึกเหตุผลของ design ไว้ คนที่จะเสนอเปลี่ยนจะได้เข้าใจ context ก่อน

:::tip
ผมจงใจให้ workspace นี้ **มีเวอร์ชันของตัวเอง** และผ่าน code review เหมือนโค้ดทั่วไป — เพราะ logic การรีวิวก็คือโค้ดชิ้นหนึ่งที่ต้องดูแลร่วมกันทั้งทีม ไม่ใช่ prompt ลอยๆ ที่ใครแก้ก็ได้ ทุกการเปลี่ยน behavior จึงมี history, ผ่าน review และ rollback ได้
:::

## ชิ้นที่ 2 — Base Image ที่มีของพร้อม

ปัญหา environment ไม่เหมือนกันแก้ด้วยการ **bake ทุกอย่างลง image เดียว** — Claude Code CLI, tool ที่ skill ต้องใช้ (`ripgrep`, `jq`, `python3`, `git`) และ workspace bundle ทั้งชุด แล้ว pin เวอร์ชันไว้ให้ผลคงเส้นคงวา

```dockerfile title="ai/workspaces/code-review/Dockerfile"
FROM node:20-bookworm-slim

# tool ที่ skill + script ต้องใช้ + tini เป็น init กัน zombie process
RUN apt-get update && apt-get install -y --no-install-recommends \
      ripgrep jq python3 git ca-certificates tini \
    && rm -rf /var/lib/apt/lists/*

# Claude Code CLI — pin เวอร์ชันไว้เสมอ
RUN npm install -g @anthropic-ai/claude-code@1.x.x

# คัดลอก workspace bundle เข้า image
COPY ai/workspaces/code-review/ /workspace/code-review/

# รันด้วย user ธรรมดา ไม่ใช่ root
RUN useradd -m ci
USER ci

ENTRYPOINT ["tini", "--"]
```

:::important
จุดที่ผมยึดตอนทำ base image:

- **pin เวอร์ชันทุกอย่าง** — ทั้ง Claude Code CLI และ base tag ไม่ใช้ `latest` เพราะอยากให้รีวิววันนี้กับเดือนหน้าได้ behavior เดียวกัน
- **non-root user** — job ใน CI ไม่ควรรันเป็น root
- **มีแต่ของที่จำเป็น** — bookworm-slim + เฉพาะ tool ที่ skill เรียกใช้จริง image เล็ก pull เร็ว
:::

### CI: auto-build image ทุกครั้งที่ workspace มี commit

ผมไม่ build image ด้วยมือ — `platform/core` มี **pipeline ของตัวเอง** ที่ build แล้ว push image เข้า registry **อัตโนมัติทุกครั้งที่มี commit ใหม่บน main** (เช่น พอมี MR ของเพื่อนในทีม merge เข้ามา) แปลว่าพอใครแก้ skill เสร็จ image ใหม่ก็พร้อมใช้เองโดยไม่ต้องมีใครจำไปสั่ง build

```yaml title="platform/core/.gitlab-ci.yml — build pipeline ของ workspace เอง"
build-ai-review-image:
  stage: build
  image: docker:27
  services: [docker:27-dind]
  rules:
    # build เฉพาะตอน commit เข้า main และเฉพาะเมื่อ workspace เปลี่ยน
    - if: $CI_COMMIT_BRANCH == "main"
      changes: [ai/workspaces/code-review/**/*]
  script:
    - IMAGE=$CI_REGISTRY_IMAGE/ai-review
    - docker build -f ai/workspaces/code-review/Dockerfile -t $IMAGE:$CI_COMMIT_SHORT_SHA .
    - docker tag $IMAGE:$CI_COMMIT_SHORT_SHA $IMAGE:latest
    - docker push $IMAGE:$CI_COMMIT_SHORT_SHA
    - docker push $IMAGE:latest
```

:::important
สังเกต `changes:` — ผม build เฉพาะตอน **ไฟล์ใน workspace เปลี่ยนจริง** เท่านั้น ไม่ใช่ทุก commit ของ repo และเวลาจะ release ผม tag version (เช่น `:0.1.0`) แยกจาก `:latest` เพื่อให้ repo ปลายทาง pin เวอร์ชันที่นิ่งได้ ไม่โดน image เปลี่ยนใต้เท้าตอนกลางทาง
:::

ผลคือ flow ฝั่ง contribute → build เป็นแบบนี้: เพื่อนเปิด MR แก้ skill → review/merge เข้า main → pipeline build image ใหม่ → push เข้า registry — จบโดยไม่มี manual step เลย repo ปลายทางไม่ต้องรู้ว่าข้างใน image มีอะไร แค่ดึง image ตาม version มาใช้ก็ได้ environment เดียวกันทั้ง fleet

## ชิ้นที่ 3 — รันผ่าน GitLab CI/CD Component

ชิ้นสุดท้ายคือ "ทางเข้า" — แทนที่จะให้แต่ละ repo copy บล็อก `.gitlab-ci.yml` ไปแปะ (แล้ว maintain ไม่ไหว) ผม package เป็น **GitLab CI/CD Component** ที่มี `spec.inputs` แบบ typed

```yaml title="templates/ai-review.yml — CI/CD Component"
spec:
  inputs:
    stage:
      default: test
    image:
      default: registry.example.com/platform/ai-review:0.1.0
    max_diff_lines:
      type: number
      default: 8000
---
ai-mr-review:
  stage: $[[ inputs.stage ]]
  image: $[[ inputs.image ]]
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
  variables:
    MAX_DIFF_LINES: $[[ inputs.max_diff_lines ]]
  script:
    - /workspace/code-review/fetch-diff.sh   # ดึง diff ของ MR
    - claude -p --append-system-prompt "$(cat /workspace/code-review/SKILL.md)" \
        "review the diff in $CI_DIFF_FILE following the skill" > review.md
    - /workspace/code-review/post-note.sh review.md   # โพสต์ผลกลับเข้า MR
```

ฝั่ง repo ที่อยากเปิดใช้ ก็ `include` มาบรรทัดเดียว:

```yaml title=".gitlab-ci.yml ใน repo ปลายทาง"
include:
  - component: gitlab.example.com/platform/core/ai-review@0.1.0
    inputs:
      max_diff_lines: 5000   # override ได้ตาม repo
```

:::tip
ความสวยของ CI Component คือ — วันที่ผมอยากปรับ logic รีวิวหรือ bump image ผมแก้ที่ `platform/core` ที่เดียว แล้ว repo ที่ pin เวอร์ชันไว้ก็ค่อยขยับตามเมื่อพร้อม **ไม่ต้องไล่ commit ทุก repo** อีกต่อไป
:::

## การ execute ใน CI — เชื่อมทุกอย่างเข้าด้วยกัน

พอ MR เปิด/อัปเดต GitLab จะ trigger pipeline แล้ว job ก็เดินตามนี้:

```text title="flow ตอนรันจริง"
MR event ─► pull base image (Claude Code + tool + workspace พร้อม)
         ─► fetch-diff.sh   : ดึง diff ผ่าน GitLab API
         ─► claude -p + SKILL.md : รีวิวตาม skill
         ─► post-note.sh    : โพสต์ผลกลับเข้า MR เป็น note
```

เรื่อง auth ที่ต้องเตรียมในขั้นนี้:

- **`CI_JOB_TOKEN`** — ใช้ clone/อ่าน MR และโพสต์ note กลับ โดยไม่ต้องสร้าง PAT แยก
- **API token ของ Anthropic** — เก็บเป็น **masked CI/CD variable** ไม่ commit เข้า git เด็ดขาด

:::caution
secret ทั้งหมด (Anthropic key, token ต่างๆ) ต้องอยู่ใน **masked + protected CI variable** เท่านั้น — อย่าฝังลง image หรือ commit เข้า workspace repo ภาพรวมที่วางมาเป็น as-code ก็จริง แต่ "ค่า secret" ไม่ใช่สิ่งที่ควรอยู่ใน code
:::

## พฤติกรรมที่ทำให้ skill อยู่ร่วมกับทีมได้

structure ที่ดีต้องมาคู่กับ behavior ที่ไม่กวนทีม — สี่อย่างที่ผมใส่ไว้ใน skill/script:

- **Idempotent** — โพสต์ note ด้วย hidden marker แล้ว **upsert** (รันซ้ำ = แก้ note เดิม ไม่ spam note ใหม่ทุกรอบ)
- **Preflight label** — `skip-ai-review` / `force-ai-review` ให้คนคุมว่าจะรีวิว MR ไหน
- **Diff cap** — `MAX_DIFF_LINES` (default 8000) ถ้า MR ใหญ่เกินก็ข้ามพร้อมบอกเหตุผล แทนที่จะรีวิวกว้างๆ ไม่มีคุณภาพ
- **Fallback parser** — parse JSON ด้วย `jq → python → awk` ตามที่มี (จริงๆ image เรา bake มาครบ แต่กันเหนียวไว้)

:::note
สังเกตว่าพอวาง structure แบบนี้ behavior พวกนี้อยู่ใน **workspace (ชิ้นที่ 1)** ทั้งหมด — เพื่อนในทีมแก้ผ่าน MR ครั้งเดียว, build pipeline (ชิ้นที่ 2) สร้าง image ใหม่ให้เอง แล้ว repo ทั้ง fleet ก็ได้ของใหม่พร้อมกัน นี่คือผลพลอยได้ของการแยก concern ตั้งแต่แรก
:::

## เริ่มเล็กแล้วค่อยโต

ผมไม่ได้ทำใหญ่ตั้งแต่วันแรก — เวอร์ชันแรก trim เหลือ **minimal v0.1.0** ราว 19 ไฟล์ (workspace + skill + Dockerfile + CI Component + ADR ไม่กี่ตัว) แล้วลองกับ MR จริงก่อน รอบแรกมันจับ bug จริงได้ 4 ตัว (cache key ผิด, ลืม audit transaction, สร้าง URI ผิด, typo) — พอพิสูจน์ว่าได้ผลค่อยขยาย

ADR (Architecture Decision Record) ช่วยมากในจุดนี้ — ผมบันทึกว่าทำไมเลือก workspace-bundle, ทำไม CI Component, ทำไม pin เวอร์ชัน ไว้ใน `docs/adr/` ครั้งหน้ากลับมาดูก็รู้เหตุผล ไม่ต้องเดาว่าตอนนั้นคิดอะไรอยู่

## สรุป

key takeaway ของโพสต์นี้คือ — **AI review ที่ใช้ได้ทั้งทีม อยู่ที่ structure ไม่ใช่ prompt** แยกให้ชัดเป็น 3 ชิ้น:

1. **Workspace ใน git** — skill + script + template เป็น source of truth เดียว ที่ **ทุกคนในทีม contribute ผ่าน MR ได้** (มี CODEOWNERS + ADR คุม)
2. **Build pipeline** — **auto-build image ทุกครั้งที่ workspace มี commit ใหม่** แล้ว push เข้า registry แบบมีเวอร์ชัน
3. **CI/CD Component** — repo อื่น`include` มาแล้ว pipeline ก็ดึง image นั้นมารันรีวิวได้เลย

พอวางสามชิ้นนี้แล้ว เพื่อนในทีมแก้ skill ผ่าน MR → image build เองอัตโนมัติ → repo ทั้ง fleet ได้ของใหม่โดยไม่ต้องไล่แก้ทีละที่ และการเพิ่ม repo ใหม่เข้าระบบก็เหลือแค่ `include` บรรทัดเดียว — นั่นแหละคือความต่างระหว่าง "เล่น AI review" กับ "มี AI review ที่ scale ได้จริง"

:::guy1
สรุปคือทีม contribute skill ผ่าน MR, image build เอง, แล้ว repo ไหนก็เสียบ component ใช้ได้ใช่มั้ย?
:::

:::ne7shii
ใช่ครับ — **สมองอยู่ใน git ที่ทุกคนช่วยกันแก้, โรงงาน build image ให้เอง, ทางเข้าเป็น CI Component** แก้ที่เดียวมีผลทั้ง fleet ส่วน prompt เก่งแค่ไหนก็ไม่ช่วยถ้า structure ไม่นิ่งครับ
:::

:::claude
แล้วก็อย่าลืม pin เวอร์ชันผมไว้ใน image นะครับ — จะได้รีวิวออกมา behavior เดียวกันทุกครั้ง ไม่ใช่เปลี่ยนไปตามวันที่ build :rocket:
:::
