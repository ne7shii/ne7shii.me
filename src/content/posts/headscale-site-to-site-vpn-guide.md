---
title: 'คู่มือทำ Site-to-Site VPN ด้วย Headscale แบบ step-by-step'
published: 2026-06-17
draft: false
description: 'คู่มือ hands-on ทำ site-to-site VPN ด้วย Headscale ตั้งแต่ deploy control server, ตั้ง subnet router แต่ละ site, advertise + approve route, เปิด IP forwarding, เขียน ACL as-code และ verify ให้ครบทุกขั้น'
tags: ['headscale', 'tailscale', 'wireguard', 'site-to-site', 'vpn', 'networking', 'tutorial', 'open-source']
toc: true
---

:::guy1
อ่านโพสต์ก่อนเรื่อง Headscale แล้ว อยากลองทำ site-to-site VPN เชื่อมออฟฟิศกับ cloud บ้าง มีคู่มือแบบทำตามได้ทีละขั้นมั้ย?
:::

:::ne7shii
มีครับ โพสต์นี้ผมจะลงรายละเอียดแบบ **ทำตามได้จริง** ตั้งแต่ deploy Headscale, ตั้ง subnet router แต่ละ site, advertise route, เปิด IP forwarding ไปจนถึงเขียน ACL — จบแล้วสอง site คุยกันได้เหมือนอยู่วงเดียวกันเลย
:::

:::guy2
ต้องมีอะไรเตรียมก่อนบ้าง?
:::

:::ne7shii
แค่ server หนึ่งตัวที่มี public IP + domain สำหรับวาง Headscale แล้วก็เครื่อง Linux ตัวเล็กๆ ที่แต่ละ site ไว้ทำ subnet router เดี๋ยวไล่ให้ดูทีละขั้นครับ
:::

## ภาพรวมก่อนเริ่ม

เป้าหมายของคู่มือนี้คือเชื่อม subnet ของหลาย site เข้า mesh เดียวกัน โดย traffic ระหว่าง site วิ่งเป็น **WireGuard P2P ตรงถึงกัน** ไม่ผ่าน gateway กลาง

![Headscale Site-to-Site Architecture](/blog/headscale-site-to-site.svg)

ในคู่มือนี้ผมจะใช้ค่าตัวอย่างดังนี้ (เปลี่ยนเป็นของคุณได้เลย):

| ส่วนประกอบ | ค่าตัวอย่าง |
|---|---|
| Headscale control server | `headscale.example.com` |
| Site A (สำนักงาน) subnet | `192.168.10.0/24` |
| Site B (cloud VPC) subnet | `10.0.0.0/16` |
| OS ของ subnet router | Linux (Debian/Ubuntu) |

:::note
แต่ละ site ต้องมีเครื่อง Linux หนึ่งตัวทำหน้าที่ **subnet router** — ไม่ต้องแรงมาก เครื่องเล็กๆ หรือ VM ก็พอ ขอแค่อยู่ใน LAN ของ site นั้นและออกเน็ตได้
:::

## ขั้นที่ 1 — Deploy Headscale Control Server

วาง Headscale ด้วย Docker บน server ที่มี public IP แล้วเอา nginx มา terminate TLS ข้างหน้า

```yaml title="docker-compose.yml"
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

ในไฟล์ config หลัก ตั้ง `server_url` ให้ตรงกับ domain ที่จะใช้:

```yaml title="config/config.yaml (ส่วนสำคัญ)"
server_url: https://headscale.example.com
listen_addr: 0.0.0.0:8080

prefixes:
  v4: 100.64.0.0/10   # IP range ของ Tailnet

dns:
  base_domain: example-net.internal
```

ฝั่ง nginx reverse proxy เข้า `127.0.0.1:8080` — สิ่งสำคัญคืออย่าตั้ง timeout สั้นเกินไป เพราะ Headscale ใช้ long-lived connection สำหรับ control channel:

```nginx title="nginx — headscale.example.com"
server {
    listen 443 ssl;
    server_name headscale.example.com;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $http_connection;
        proxy_set_header Host $host;
        proxy_read_timeout 86400s;   # กัน control channel หลุด
    }
}
```

ยิง compose ขึ้นแล้วเช็คว่า server ตอบ:

```bash title="start + healthcheck"
docker compose up -d
curl -fsSL https://headscale.example.com/health   # ควรได้ 200
```

## ขั้นที่ 2 — สร้าง User และ Pre-auth Key

Headscale จัดกลุ่ม node ด้วย **user** (เดิมเรียก namespace) สร้าง user แล้วออก pre-auth key สำหรับ enroll subnet router แต่ละตัว

```bash title="รันบน server (ใน container)"
headscale users create corp
headscale preauthkeys create --user corp --reusable --expiration 1h
```

:::tip
ใช้ `--reusable` กับ `--expiration` สั้นๆ ตอน enroll หลายเครื่องในรอบเดียว จะสะดวกกว่าออก key ทีละใบ — แต่พอ enroll เสร็จแล้วอย่าทิ้ง key ที่ยัง valid ไว้ลอยๆ ครับ
:::

เก็บค่า key ที่ได้ (`hskey-...`) ไว้ใช้ในขั้นถัดไป

## ขั้นที่ 3 — ตั้ง Subnet Router ที่ Site A

ไปที่เครื่อง subnet router ของ Site A ติดตั้ง Tailscale client ตามปกติ:

```bash title="ติดตั้ง tailscale client"
curl -fsSL https://tailscale.com/install.sh | sh
```

จากนั้น **เปิด IP forwarding** ในระดับ kernel — ขั้นนี้ห้ามลืม ไม่งั้น tunnel ติดแต่เครื่องหลัง router เข้าไม่ถึงกัน:

```bash title="เปิด IP forwarding ให้ถาวร"
echo 'net.ipv4.ip_forward = 1' | sudo tee /etc/sysctl.d/99-tailscale.conf
echo 'net.ipv6.conf.all.forwarding = 1' | sudo tee -a /etc/sysctl.d/99-tailscale.conf
sudo sysctl -p /etc/sysctl.d/99-tailscale.conf
```

แล้ว `up` โดยชี้ไปที่ Headscale ของเรา พร้อม advertise subnet ของ Site A:

```bash title="enroll Site A พร้อม advertise subnet"
sudo tailscale up \
  --login-server https://headscale.example.com \
  --authkey hskey-xxxxxxxxxxxx \
  --advertise-routes=192.168.10.0/24 \
  --accept-routes
```

:::important
`--advertise-routes` บอกว่า "เครื่องนี้เป็นทางเข้าไปสู่ subnet นี้" ส่วน `--accept-routes` บอกว่า "เครื่องนี้ยอมรับ route ที่ site อื่น advertise มา" — สำหรับ site-to-site ต้องใส่ **ทั้งสองตัว** บน subnet router ทุก site
:::

## ขั้นที่ 4 — ตั้ง Subnet Router ที่ Site B

ทำแบบเดียวกันที่เครื่อง subnet router ของ Site B (cloud VPC) — ติดตั้ง client, เปิด IP forwarding เหมือนขั้นที่ 3 แล้ว `up` โดย advertise subnet ของ Site B แทน:

```bash title="enroll Site B พร้อม advertise subnet"
sudo tailscale up \
  --login-server https://headscale.example.com \
  --authkey hskey-xxxxxxxxxxxx \
  --advertise-routes=10.0.0.0/16 \
  --accept-routes
```

## ขั้นที่ 5 — Approve Routes บน Headscale

ตอนนี้ subnet router ทั้งสอง advertise route เข้ามาแล้ว แต่ Headscale **ยังไม่เปิดใช้จนกว่าเราจะ approve** — ดู route ที่ค้างอยู่:

```bash title="ดู route ที่ถูก advertise เข้ามา"
headscale nodes list
headscale routes list
```

จะเห็น route ของแต่ละ site พร้อม id แล้ว enable ทีละอัน:

```bash title="approve route ทั้งสอง site"
headscale routes enable -r 1   # 192.168.10.0/24 (Site A)
headscale routes enable -r 2   # 10.0.0.0/16   (Site B)
```

:::caution
route จะ **ไม่ทำงานจนกว่าจะ enable บน Headscale** — เป็นจุดที่คนงงบ่อยว่า "ทำไม advertise แล้วยังเข้าไม่ได้" เพราะลืม approve ขั้นนี้ครับ
:::

## ขั้นที่ 6 — เขียน ACL as-code

มาถึงจุดที่ผมชอบที่สุด — กำหนดว่า site ไหนคุยกับ site ไหนได้ ผ่านไฟล์ ACL (HuJSON) ที่เก็บใน git ได้

สมมติเราต้องการให้ **สอง site คุยกันได้สองทาง** ก็เขียนแบบนี้:

```json title="acl.hujson"
{
  "tagOwners": {
    "tag:site-a": ["corp"],
    "tag:site-b": ["corp"],
  },
  "acls": [
    // Site A <-> Site B คุยกันได้ทั้งสองทาง
    {
      "action": "accept",
      "src":    ["tag:site-a", "tag:site-b"],
      "dst":    ["192.168.10.0/24:*", "10.0.0.0/16:*"],
    },
  ],
}
```

ถ้าอยากได้ **one-way** (เช่นให้ Site A เข้า Site B ได้ แต่ไม่ให้ย้อนกลับ) ก็แยก `src`/`dst` ให้ชัด:

```json title="acl.hujson — one-way A เข้า B"
"acls": [
  {
    "action": "accept",
    "src":    ["tag:site-a"],
    "dst":    ["10.0.0.0/16:*"],
  },
]
```

โหลด policy เข้า Headscale แล้ว tag node ให้ตรง:

```bash title="apply policy + tag node"
headscale policy set -f acl.hujson
headscale nodes tag -i 1 -t tag:site-a
headscale nodes tag -i 2 -t tag:site-b
```

## ขั้นที่ 7 — Verify ให้ครบทุกเส้น

อย่าเพิ่งวางใจว่าเสร็จ — ทดสอบจริงทีละเส้น จากเครื่อง **ที่อยู่ใน LAN หลัง subnet router** (ไม่ใช่ตัว router เอง) เพื่อพิสูจน์ว่า routing ทะลุถึงเครื่องปลายทางจริง

```bash title="ทดสอบจาก host ใน Site A ไปยัง host ใน Site B"
ping 10.0.0.5
curl http://10.0.0.5:8080/health
traceroute 10.0.0.5    # ดูว่า traffic วิ่งผ่าน tunnel จริง
```

แล้วเช็คฝั่ง tunnel ว่าต่อแบบ P2P หรือ relay:

```bash title="ดูสถานะ peer"
tailscale status
tailscale ping site-b   # บอกว่า direct หรือ via relay
```

:::tip
ถ้า `tailscale ping` ขึ้น `via DERP` (relay) แทน `direct` แปลว่า NAT traversal ไม่สำเร็จ — ลองเปิด UDP port ให้ออกได้ หรือตั้ง DERP/relay ไว้ใกล้ๆ ก็จะช่วยเรื่อง latency ครับ
:::

## checklist สรุป

ก่อนปิดงาน ไล่เช็คให้ครบ:

- [ ] Headscale ขึ้น + `/health` ตอบ 200, nginx timeout ยาวพอ
- [ ] สร้าง user + pre-auth key แล้ว
- [ ] subnet router ทุก site เปิด **IP forwarding** ถาวร
- [ ] ทุก site `up` ด้วย `--advertise-routes` + `--accept-routes`
- [ ] **approve route** ทุกอันบน Headscale แล้ว
- [ ] ACL apply + tag node ตรง
- [ ] ทดสอบจาก **host ใน LAN** (ไม่ใช่ตัว router) ผ่านทุกเส้น
- [ ] `tailscale ping` ขึ้น `direct` (ถ้าได้)

## สรุป

หัวใจของการทำ site-to-site VPN ด้วย Headscale มีแค่ไม่กี่จุด — **advertise + approve + accept routes** ให้ครบทั้งสองฝั่ง, เปิด **IP forwarding** บน subnet router, แล้วคุม access ด้วย **ACL as-code** จุดที่คนพลาดบ่อยที่สุดคือลืม approve route บน Headscale กับลืมเปิด IP forwarding — ถ้าจำสองอย่างนี้ได้ ที่เหลือก็ตรงไปตรงมาครับ

:::guy1
สรุปคือ advertise + approve + accept route, เปิด forwarding, แล้วเขียน ACL ใช่มั้ย?
:::

:::ne7shii
ใช่เลยครับ จำ 3 คำนี้ไว้ — **advertise, approve, accept** ครบสองฝั่งเมื่อไหร่ tunnel ก็ทะลุถึงกัน เหลือแค่ ACL คุมว่าใครเข้าใครได้ ลองทำตามดูครับ ไม่ยากอย่างที่คิด
:::

::github{repo="juanfont/headscale"}
