---
title: 'จาก NetBird สู่ Headscale — ทำไมผมย้าย mesh VPN อีกครั้ง'
published: 2026-06-10
draft: false
description: 'บันทึกการย้ายจาก NetBird มาเป็น Headscale — control plane ของ Tailscale แบบ self-host, ACL เป็น code ที่อยู่ใน git, และใช้ subnet router ทำ site-to-site VPN เชื่อมหลาย site เข้า mesh เดียวกัน'
tags: ['headscale', 'tailscale', 'wireguard', 'vpn', 'zero-trust', 'networking', 'open-source']
toc: true
---

:::guy1
เห็นโพสต์ก่อนบอกใช้ NetBird ดีมาก แล้วทำไมตอนนี้ย้ายมา Headscale อีกล่ะ? เปลี่ยนไปเปลี่ยนมา 555
:::

:::ne7shii
ใช่ครับ NetBird ยังดีอยู่ — แต่พอผมต้องการ **ACL แบบ as-code** ที่เอาไปอยู่ใน git และให้ automation จัดการได้ บวกกับอยากใช้ **client ของ Tailscale ตัวจริง** (MagicDNS, แอปมือถือ, exit node) สุดท้ายผมเลยลองย้ายมา Headscale ดู งานหลักของผมคือทำ **site-to-site VPN** เชื่อมหลาย site เข้าด้วยกันด้วย
:::

:::guy2
Headscale มันคืออะไรอ่ะ? ต่างกับ Tailscale ยังไง?
:::

:::ne7shii
Headscale คือ **control server ของ Tailscale ที่ open-source และ self-host ได้** — ใช้ client ของ Tailscale ตัวจริง แต่ไม่ต้องพึ่ง coordination server ของบริษัท Tailscale เลย เดี๋ยวเล่าให้ฟังว่าทำไมถึงเหมาะกับงานผมกว่า
:::

## ทบทวนก่อน — ทำไมตอนแรกเลือก NetBird

ในโพสต์ก่อนผมเล่าว่า NetBird ตอบโจทย์เรื่อง **open-source ทั้ง client และ server** ซึ่งยังจริงอยู่ และ UI สำหรับจัดการ access control ก็ใช้ง่ายมาก เหมาะกับทีมที่อยากให้คนที่ไม่ใช่ dev จัดการ policy ได้

แต่พอใช้ไปสักพักในงานจริง ผมเริ่มเจอความต้องการที่ต่างออกไป:

- ผมอยากให้ **network policy อยู่ใน git** เป็น source of truth เดียว ไม่ใช่คลิกผ่าน UI แล้วไม่มี history
- ผมอยากให้ **automation / AI** มาช่วย generate และ review policy ได้ — ซึ่งต้องเป็น declarative file
- ผมอยากใช้ **Tailscale client ตัวจริง** เพราะ ecosystem มันโตกว่า ทั้งแอป iOS/Android, exit node, MagicDNS, SSH

:::note
นี่เป็นธีมเดียวกับตอนที่ผมเลือก **Keycloak** แทน ZITADEL ในโพสต์เรื่อง OIDC — สุดท้ายผมให้น้ำหนักกับ **config แบบ declarative ที่ automation จัดการได้** มากกว่า UI ที่สวยแต่ทำ as-code ไม่ได้
:::

นี่ไม่ได้แปลว่า NetBird แย่นะครับ — มันเป็นเรื่องของ **trade-off ที่ตรงกับ workflow ของผม** มากกว่า

## Headscale คืออะไร

[Headscale](https://headscale.net/) เป็น **open-source implementation ของ Tailscale control server** เขียนด้วย Go เป็น single binary ตัวเดียว หน้าที่ของมันคือทำ **coordination** — เก็บ registry ของ node, แจก key, กระจาย ACL policy และช่วย peer หากันเพื่อสร้าง WireGuard tunnel แบบ P2P

จุดสำคัญคือ Headscale **ใช้ client ของ Tailscale ตัวจริง** — คุณติดตั้ง `tailscale` ตามปกติ แค่ชี้ `--login-server` มาที่ Headscale ของคุณเองแทนที่จะเป็น cloud ของ Tailscale

```bash title="ชี้ client มาที่ Headscale ของเราเอง"
tailscale up --login-server https://headscale.example.com
```

| | **Headscale** | **NetBird** | **Tailscale (SaaS)** |
|---|---|---|---|
| **Client** | Tailscale ตัวจริง | NetBird client | Tailscale ตัวจริง |
| **Control plane** | Self-host (Go binary) | Self-host | Proprietary cloud |
| **Open-source server** | Yes (BSD-3) | Yes (AGPLv3) | No |
| **ACL** | HuJSON as-code | UI Dashboard | HuJSON as-code |
| **UI ในตัว** | ไม่มี (CLI) | มี Dashboard | มี Dashboard |
| **เหมาะกับ** | GitOps / automation | ทีมที่ชอบ UI | คนที่ไม่อยาก self-host |

:::important
Headscale ครอบคลุม "control plane" ของ Tailscale แต่ **ไม่มี Dashboard UI** มาในตัว — ทุกอย่างจัดการผ่าน CLI (`headscale`) และไฟล์ config นี่แหละคือเหตุผลที่มันเหมาะกับ as-code และเป็นข้อด้อยถ้าคุณอยากได้ UI
:::

## Deploy Headscale บน Cloud

ผม deploy Headscale ด้วย Docker แล้ววางไว้หลัง nginx (TLS) บน domain ของตัวเอง — สมมติว่าเป็น `headscale.example.com`

```yaml title="docker-compose.yml (ตัวอย่าง)"
services:
  headscale:
    image: headscale/headscale:latest
    command: serve
    volumes:
      - ./config:/etc/headscale
      - ./data:/var/lib/headscale
    ports:
      - '127.0.0.1:8080:8080'
    restart: unless-stopped
```

ตัว nginx ทำหน้าที่ terminate TLS แล้ว reverse proxy เข้า `127.0.0.1:8080` — ข้อควรระวังคือ Headscale ใช้ทั้ง HTTP ปกติและ long-lived connection สำหรับ control channel เพราะฉะนั้นอย่าลืม config nginx ให้ไม่ตัด connection ทิ้งเร็วเกินไป

จากนั้นสร้าง user (namespace) และ pre-auth key สำหรับ enroll เครื่อง:

```bash title="สร้าง user + pre-auth key"
headscale users create homelab
headscale preauthkeys create --user homelab --reusable --expiration 24h
```

:::tip
เก็บ knowledge base ของ deploy ไว้ตั้งแต่วันแรกเลยครับ — ผมจดทั้ง runbook, ขั้นตอน cutover, install guide และ ACL policy ไว้ใน vault เพราะตอน enroll เครื่องหลายๆ ตัวแล้วเจอปัญหา การมี runbook ช่วยได้มาก
:::

## Subnet Router — เชื่อมทั้ง LAN เข้า mesh

หัวใจของ setup ผมคือ **subnet router** — แทนที่จะลง client บนทุกเครื่องใน LAN ผมให้เครื่องตัวหนึ่งทำหน้าที่ advertise subnet ของ LAN ทั้งวงเข้าไปใน mesh เครื่องอื่นใน Tailnet ก็จะ route หา subnet นั้นผ่าน router ตัวนั้นได้

```bash title="advertise subnet จากเครื่อง subnet router"
tailscale up \
  --login-server https://headscale.example.com \
  --advertise-routes=192.168.0.0/24 \
  --accept-routes
```

ฝั่ง Headscale ต้อง **approve route** ที่ถูก advertise มาก่อน ถึงจะใช้งานได้จริง:

```bash title="approve advertised routes"
headscale routes list
headscale routes enable -r <route-id>
```

ด้วยวิธีนี้เราสามารถมี subnet router หลายตัวเพื่อเชื่อมหลาย site เข้าด้วยกัน เช่น site สำนักงาน, สาขาอื่น, หรือ VPC บน cloud — แต่ละ site วาง router หนึ่งตัว advertise subnet ของตัวเองเข้า mesh เดียวกัน

## ACL เป็น code — จุดที่ผมตามหา

นี่คือเหตุผลหลักที่ย้ายมา Headscale ครับ — ACL policy เป็นไฟล์ **HuJSON** (JSON ที่ใส่ comment ได้) ที่ผมเอาไปอยู่ใน git ได้เลย

สมมติผมต้องการ **one-way access** — ให้ฝั่ง site A เข้าถึง subnet ของ site B ได้ แต่ไม่ให้ย้อนกลับ ตัวอย่าง policy แบบง่ายๆ:

```json title="acl.hujson"
{
  "tagOwners": {
    "tag:site-a": ["admin"],
    "tag:site-b": ["admin"],
  },
  "acls": [
    // site A -> site B (ทางเดียว)
    {
      "action": "accept",
      "src":    ["tag:site-a"],
      "dst":    ["10.0.20.0/24:*"],
    },
  ],
}
```

เพราะไม่มี rule ให้ `tag:site-b` เป็น `src` ที่วิ่งกลับมาหา site A การเข้าถึงจึงเป็น **one-way** ตามที่ออกแบบ — และทั้งหมดนี้อยู่ในไฟล์เดียวที่ review ผ่าน merge request ได้

:::tip
ผม verify ทุก path ด้วยมือหลัง enroll เสร็จ — ทดสอบทีละเส้นว่า route ที่ควรเข้าได้เข้าได้ และที่ควรถูกบล็อกก็ถูกบล็อกจริง อย่าเชื่อว่า ACL ถูกแค่เพราะมันไม่ error ครับ ต้อง ping/curl ทดสอบจริง
:::

## ใช้งานหลักของผม — Site-to-Site VPN

จริงๆ แล้ว use case หลักที่ผมใช้ Headscale ไม่ใช่การให้ user แต่ละคนลง client เข้า network — แต่เป็น **site-to-site VPN** เชื่อม network ของหลาย site (สำนักงานใหญ่, สาขา, VPC บน cloud) ให้คุยกันได้เหมือนอยู่วงเดียวกัน

วิธีคิดง่ายๆ คือ **แต่ละ site วาง subnet router หนึ่งตัว** ที่ advertise subnet ของ site นั้นเข้า mesh จากนั้น subnet router ของแต่ละ site จะสร้าง **WireGuard tunnel แบบ P2P ตรงถึงกัน** — traffic ระหว่าง site วิ่งตรง ไม่ต้องวนผ่าน VPN gateway กลางเหมือน hub-and-spoke แบบเดิม

![Headscale Site-to-Site Architecture](/blog/headscale-site-to-site.svg)

จากภาพจะเห็น 2 ระนาบที่แยกกันชัดเจน:

- **Control plane (เส้นประ)** — subnet router ทุกตัวคุยกับ Headscale เพื่อรับ config, key และ ACL policy เท่านั้น
- **Data plane (เส้นเขียว)** — traffic จริงวิ่งเป็น **WireGuard tunnel ตรงระหว่าง site** ที่เข้ารหัส ไม่ผ่าน Headscale และไม่ผ่าน gateway กลาง

ข้อดีของการทำ site-to-site แบบนี้:

- **ไม่มีคอขวดตรงกลาง** — traffic ระหว่าง site วิ่งตรง latency ต่ำ ไม่ต้องวนผ่าน server กลางเหมือน OpenVPN hub-and-spoke
- **เพิ่ม site ใหม่ง่าย** — แค่ deploy subnet router อีกตัว advertise subnet เข้ามา แล้ว approve route ก็เชื่อมเข้า mesh ได้เลย
- **คุม access ได้ละเอียด** — จะให้ site ไหนเข้าถึง site ไหนได้บ้างก็เขียนใน ACL (as-code) อย่างเดียว เช่นที่ทำ one-way access ไว้ด้านบน

:::important
อย่าลืมว่า subnet router ต้องเปิด **IP forwarding** บนเครื่อง (`net.ipv4.ip_forward=1`) ถึงจะ route traffic ของทั้ง subnet เข้า tunnel ได้ — ไม่งั้นจะต่อ tunnel ติดแต่เครื่องหลัง router เข้าไม่ถึงกัน
:::

## สรุป — เลือกตัวไหนดี

ถ้าให้สรุปตรงๆ จากที่ใช้มาทั้งสองตัว:

- **เลือก NetBird** ถ้าอยากได้ open-source เต็มตัวทั้ง client+server, อยากได้ **UI จัดการ access control** และทีมไม่ได้อยากทำทุกอย่างเป็น code
- **เลือก Headscale** ถ้าอยากใช้ **Tailscale client ตัวจริง** + ecosystem ของมัน และอยากได้ **ACL as-code** ที่อยู่ใน git ให้ automation จัดการ — แลกกับการไม่มี UI ในตัว

สำหรับผมในจังหวะนี้ Headscale ตอบโจทย์กว่า เพราะ workflow ผมเป็น GitOps + automation หมด แต่ถ้าวันหนึ่งทีมโตขึ้นและต้องการ UI ให้คนอื่นจัดการ policy NetBird ก็ยังเป็นตัวเลือกที่ดีอยู่เสมอ

:::guy1
สรุปคือใช้ client เดียวกับ Tailscale แต่ server เป็นของเราเอง แถม ACL อยู่ใน git ใช่มั้ย?
:::

:::ne7shii
ใช่เลยครับ จุดขายคือ **as-code ทั้งหมด** — policy review ผ่าน MR ได้ rollback ได้ มี history ครบ แล้วถ้าอยากเชื่อมหลาย site เข้าด้วยกันก็แค่วาง subnet router หนึ่งตัวต่อ site ตามที่เล่าไปครับ
:::

::github{repo="juanfont/headscale"}
