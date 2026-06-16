---
title: 'ผมใช้ Claude ตั้ง Site-to-Site VPN ด้วย Headscale ยังไง'
published: 2026-06-18
draft: false
description: 'เล่า workflow จริงที่ผมใช้ Claude Code ช่วยตั้ง site-to-site VPN ด้วย Headscale — ตั้งแต่ grill design, generate docker-compose/nginx/ACL, รันคำสั่งทีละขั้น, debug, ไปจนถึงให้มันเขียน runbook เก็บลง vault'
tags: ['claude-code', 'ai', 'headscale', 'site-to-site', 'vpn', 'automation', 'devops', 'gitops']
toc: true
---

:::guy1
เห็นโพสต์ก่อนทำ site-to-site VPN ด้วย Headscale แบบ step-by-step แต่ขั้นตอนมันก็เยอะอยู่นะ จำทุกอย่างไม่ไหว ทำไง?
:::

:::ne7shii
ผมไม่ได้นั่งจำทุกขั้นเองครับ — ผมให้ **Claude Code** ช่วยทำเกือบทั้งกระบวนการ ตั้งแต่ออกแบบ, generate config, รันคำสั่ง, debug ไปจนถึงเขียน runbook เก็บไว้ โพสต์นี้จะเล่า workflow จริงที่ผมใช้
:::

:::claude
หน้าที่ผมไม่ใช่แค่พ่นคำสั่งให้นะครับ — แต่ช่วยคิด design ก่อน, ลงมือทำทีละขั้นแบบ verify ได้, แล้วทิ้งเอกสารไว้ให้ครั้งหน้าทำซ้ำได้ เดี๋ยว ne7shii เล่าให้ฟังว่าผมเข้าไปช่วยตรงไหนบ้าง
:::

## ทำไมงานนี้เหมาะกับ AI

site-to-site VPN เป็นงานที่ **ขั้นตอนเยอะแต่มี pattern ชัด** — deploy server, ตั้ง router แต่ละ site, advertise/approve/accept route, เขียน ACL, verify งานแบบนี้แหละที่ Claude Code ช่วยได้ดีมาก เพราะ:

- config ส่วนใหญ่เป็น **text-based** (docker-compose, nginx, HuJSON ACL) — สิ่งที่ LLM ถนัด generate
- ทุกอย่างควรเป็น **as-code** อยู่แล้ว ตรงกับที่ผมอยากให้อยู่ใน git
- มีขั้นที่ **ลืมง่าย** (approve route, เปิด IP forwarding) — ให้ AI ช่วยไล่ checklist กันพลาด
- พอทำเสร็จต้อง **เขียน runbook** — ซึ่งน่าเบื่อสำหรับคน แต่ AI ทำให้ฟรีๆ ระหว่างทาง

:::note
ผมไม่ได้ใช้ Claude แบบ "พิมพ์คำสั่งให้หน่อย" เฉยๆ — แต่ใช้มันเป็น **engineer คู่คิด** ที่อยู่ใน terminal เดียวกัน เห็น output จริง รันคำสั่งได้จริง แล้วตัดสินใจขั้นต่อไปจาก output นั้น
:::

## ขั้นที่ 1 — Grill design ก่อนลงมือ

ผมไม่เริ่มจากให้มัน generate config ทันที — ผมเริ่มด้วยการ **grill design** ก่อน คือคุยกับ Claude ให้มันถามผมกลับจนได้ข้อสรุปที่ชัด แล้วเขียนเป็น decision เก็บไว้

````text title="prompt เริ่มงาน"
ผมจะทำ site-to-site VPN ด้วย Headscale เชื่อม 2 site:
- Site A: สำนักงาน, subnet 192.168.10.0/24
- Site B: cloud VPC, subnet 10.0.0.0/16

ช่วย grill design ผมก่อน — ถามสิ่งที่ยังไม่ชัด แล้วสรุปเป็น decision
(topology, one-way หรือ two-way, relay อยู่ที่ไหน, ใครเป็น control server)
````

Claude จะถามกลับเรื่องที่ผมยังไม่ได้คิด เช่น จะให้ access เป็น one-way หรือ two-way, vสร้าง DERP/relay เองมั้ย, domain กับ TLS จะใช้อะไร พอตอบครบมันก็สรุปเป็น design ที่ชัดก่อนเขียนโค้ดสักบรรทัด

:::tip
การ grill design ก่อน save เวลามากครับ — แทนที่จะ generate config ผิดๆ แล้วมาแก้ทีหลัง ผมได้ข้อสรุปที่ถูกตั้งแต่ต้น แล้ว config ที่ generate ออกมาก็ตรงความต้องการเลย
:::

## ขั้นที่ 2 — ให้ generate config เป็นไฟล์จริง

พอ design ชัด ผมให้ Claude generate config ทั้งชุดเป็นไฟล์จริงใน repo — `docker-compose.yml`, `config.yaml` ของ Headscale, nginx vhost และ `acl.hujson`

:::ne7shii
generate docker-compose + nginx + acl.hujson ตาม design ที่เพิ่งสรุป วางไว้ใน repo นี้ แล้วอธิบายแต่ละไฟล์สั้นๆ ว่าทำอะไร
:::

:::claude
จัดให้ครับ — ผมเขียนไฟล์ลง repo พร้อม comment กำกับจุดสำคัญ เช่นใน nginx ผมตั้ง `proxy_read_timeout` ยาวเป็นพิเศษเพราะ Headscale ใช้ long-lived connection ถ้าตั้งสั้น control channel จะหลุด แล้วใน ACL ผมแยก `src`/`dst` ตาม design one-way/two-way ที่เราคุยกันไว้
:::

ข้อดีคือมันไม่ได้แค่พ่น config — แต่ **อธิบายเหตุผล**ของแต่ละบรรทัดด้วย ทำให้ผม review ได้ว่ามันเข้าใจถูกมั้ย ก่อน commit เข้า git

## ขั้นที่ 3 — รันทีละขั้น แล้วอ่าน output จริง

นี่คือจุดที่ต่างจากการถาม chatbot เฉยๆ — Claude Code **รันคำสั่งใน terminal ได้จริง เห็น output จริง** แล้วตัดสินใจขั้นต่อไป

ผมให้มันไล่ทำตามขั้นตอน deploy ทีละ step — `docker compose up`, สร้าง user/key, enroll subnet router, จากนั้นให้มันเช็คเองว่า route เข้ามาครบมั้ย:

```bash title="Claude รันแล้วอ่านผลเอง"
headscale routes list
# Claude เห็นว่ามี 2 route แต่ยังไม่ enabled
headscale routes enable -r 1
headscale routes enable -r 2
```

พอมันเห็นว่า route ยังไม่ถูก approve มันก็ enable ให้เอง ไม่ต้องให้ผมสั่งทีละบรรทัด — เพราะมัน **เห็น state จริงของระบบ** ไม่ได้เดา

:::important
จุดนี้สำคัญมาก — ผมตั้งกติกาให้ Claude **verify หลังทุกขั้นด้วย output จริง** ไม่ใช่สมมติว่าคำสั่งสำเร็จ เช่นหลัง enroll ก็ต้อง `headscale nodes list` ดูว่าเครื่องขึ้นจริง หลัง approve ก็ต้อง ping ทะลุจริง การยึด "เชื่อ output ไม่เชื่อสมมติฐาน" ทำให้ไม่หลงทาง
:::

## ขั้นที่ 4 — Debug ด้วยกัน

ตอนทำจริงมันไม่เคยราบรื่น 100% — แต่ Claude debug เก่งเวลามี output ให้ดู ตัวอย่างที่เจอบ่อยคือ "tunnel ติดแต่ ping ข้าม subnet ไม่ผ่าน"

:::ne7shii
ping จาก host ใน Site A ไป 10.0.0.5 ไม่ผ่าน ทั้งที่ tailscale status ขึ้น connected แล้ว
:::

:::claude
อาการนี้ส่วนใหญ่คือ **IP forwarding ไม่ได้เปิด** บน subnet router ครับ — tunnel ต่อติด (เลยเห็น connected) แต่ตัว router ไม่ยอม forward packet ของ subnet เข้า tunnel ขอเช็ค `sysctl net.ipv4.ip_forward` ก่อน ถ้าได้ `0` ก็เปิดแล้ว persist ให้รอด reboot ด้วย
:::

มันชี้สาเหตุที่เป็นไปได้จากอาการ แล้วไล่ยืนยันทีละข้อจาก output จริง — เร็วกว่าผมนั่งงมเองเยอะ

## ขั้นที่ 5 — ให้เขียน runbook เก็บลง vault

ขั้นสุดท้ายที่ผมชอบที่สุด — พอทุกอย่างใช้งานได้ ผมให้ Claude **สรุปเป็น runbook** เก็บลง Obsidian vault ของผม ทั้งขั้นตอน, ค่า config, จุดที่ต้องระวัง และคำสั่ง verify

:::ne7shii
เขียน runbook ของงานนี้เก็บลง vault — ครอบคลุม topology, ค่าที่ใช้, ขั้นตอน, gotcha (approve route + IP forwarding) และคำสั่ง verify ให้ครั้งหน้าทำซ้ำได้
:::

ทำแบบนี้ทุกครั้งจน knowledge สะสมเป็น runbook library ของผมเอง ครั้งหน้าจะเชื่อม site ที่ 3 ก็แค่บอก Claude ว่า "ทำตาม runbook headscale-site-to-site แต่เพิ่ม site C subnet นี้" — มันก็ทำตามแบบเดิมได้เลย

:::tip
นี่คือ pattern ที่ผมใช้กับงาน infra ทุกอย่าง — **ทำเสร็จแล้วให้ AI เขียน runbook ทันที** ระหว่างที่ context ยังอยู่ครบ เอกสารที่ได้จึงแม่นและทำซ้ำได้จริง ไม่ใช่เขียนย้อนหลังตอนลืมไปครึ่งนึงแล้ว
:::

## สิ่งที่ผมยังตัดสินใจเอง

ถึงจะให้ Claude ช่วยเยอะ แต่มีเรื่องที่ผม **ไม่ปล่อยให้มันตัดสินใจแทน**:

- **design เรื่อง access** — site ไหนควรเข้าถึง site ไหน เป็น business decision ที่ผมต้องเป็นคนคุม
- **อะไรที่กระทบ production** — ก่อน apply ACL หรือ restart service ที่มีคนใช้อยู่ ผม review เองทุกครั้ง
- **secret / key** — ผมไม่ให้มัน commit key จริงเข้า git เด็ดขาด

:::caution
AI ช่วยให้ทำงานเร็วขึ้นมาก แต่ **ความรับผิดชอบเรื่อง security ยังเป็นของเรา** — โดยเฉพาะ network access กับ secret อย่าปล่อยให้ automation ตัดสินใจแทนทั้งหมด review จุดที่กระทบความปลอดภัยเองเสมอ
:::

## สรุป

workflow ของผมกับ Claude Code สำหรับงาน infra แบบนี้สรุปเป็น 5 ขั้น:

1. **Grill design** ก่อน — ได้ข้อสรุปชัดก่อนเขียนโค้ด
2. **Generate config** เป็นไฟล์จริงพร้อมเหตุผล
3. **รันทีละขั้น + verify ด้วย output จริง**
4. **Debug ด้วยกัน** จากอาการ + output
5. **เขียน runbook เก็บลง vault** ให้ทำซ้ำได้

มันไม่ได้แทนความเข้าใจของผมเรื่อง networking — แต่ทำให้ผมโฟกัสกับ **design และการตัดสินใจ** ส่วนงาน mechanical ที่ขั้นตอนเยอะและลืมง่ายก็ให้ AI ช่วยไล่ให้ครบ ผลคือทำเสร็จเร็วขึ้น พลาดน้อยลง และมีเอกสารครบทุกครั้ง

:::guy1
สรุปคือให้ AI ช่วยงาน mechanical แต่ design กับ security ยังตัดสินใจเองใช่มั้ย?
:::

:::ne7shii
ใช่เลยครับ — **AI ทำส่วนที่ขั้นตอนเยอะและลืมง่าย ผมคุมส่วนที่ต้องคิดและรับผิดชอบ** พอแบ่งงานแบบนี้แล้วงาน infra ที่เคยน่าเบื่อก็เร็วและสนุกขึ้นเยอะเลย
:::

:::claude
แล้วอย่าลืมให้ผมเขียน runbook ทุกครั้งนะครับ — ครั้งหน้าจะได้ทำซ้ำได้ไว :rocket:
:::
