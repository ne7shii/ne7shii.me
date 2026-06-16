---
title: 'ผมจัดโครงสร้าง OTel Collector ยังไง — collector + backend ของแต่ละโปรเจกต์ แล้ว forward เข้าส่วนกลาง'
published: 2026-06-21
draft: false
description: 'เล่าวิธีจัด topology ของ OpenTelemetry Collector ที่ผมใช้ — แต่ละโปรเจกต์ (ของลูกค้าคนละราย) มี collector และ backend ของตัวเอง ที่ทำงานได้ครบแม้ส่วนกลางจะล่ม แล้ว fan-out forward telemetry เข้า collector ส่วนกลางอีกชุดเพื่อรวมเป็น single pane of glass'
tags: ['opentelemetry', 'observability', 'otel-collector', 'architecture', 'platform-engineering', 'clickhouse']
toc: true
---

:::guy1
ตอนนี้ทุกโปรเจกต์ยิง telemetry เข้า collector กลางตัวเดียวหมดเลย พอตัวกลางมีปัญหาทีนึง ทุกทีมมืดหมด แถมทีมอยากดู trace ของตัวเองก็ต้องมาขอสิทธิ์ที่ส่วนกลาง วุ่นมาก มีวิธีจัดดีกว่านี้มั้ย?
:::

:::ne7shii
ผมเจอปัญหานี้เลยครับ เลยจัดเป็น **2 ชั้น** — ให้แต่ละโปรเจกต์มี **OTel collector + backend ของตัวเอง** แล้วทุก collector ก็ **forward telemetry เข้า collector ส่วนกลาง** อีกชุดเพื่อให้ผมเห็นภาพรวมทั้งหมด สำคัญสำหรับผมเป็นพิเศษเพราะ **แต่ละโปรเจกต์เป็นของลูกค้าคนละราย** — monitoring stack ของลูกค้าต้องทำงานได้เองครบ ไม่ผูกชะตากับส่วนกลางของผม
:::

:::guy2
แล้วมันไม่ซ้ำซ้อนเหรอ? ส่งสองที่เลย
:::

:::ne7shii
ดูเหมือนซ้ำ แต่จริงๆ มันแก้ปัญหาคนละเรื่องครับ — **backend ของทีม** ไว้ให้ทีมใช้งานประจำวัน ส่วน **ส่วนกลาง** ไว้ทำ single pane of glass ข้ามโปรเจกต์ ข้อดีคือสองอย่างนี้ไม่ผูกกัน เดี๋ยวเล่าให้ฟังว่าทำไมถึงคุ้ม
:::

## ปัญหาของ 2 สุดขั้ว

เวลาจัด OTel collector คนมักไปสุดทางใดทางหนึ่ง แล้วเจ็บทั้งคู่:

- **Collector กลางตัวเดียว รับทุกอย่าง** — ง่ายตอนเริ่ม แต่กลายเป็น single point of failure, เป็นคอขวด, และทีมจะดู telemetry ตัวเองทีก็ต้องไปขอสิทธิ์ที่ส่วนกลาง
- **แต่ละทีมแยกขาดกันเอง** — ทีมตั้ง backend ของตัวเองหมด เห็นของตัวเองชัดดี แต่ **platform team ไม่มีทางเห็นภาพรวม** ข้ามโปรเจกต์เลย เวลา incident ข้ามทีมก็ไล่ไม่ได้

สิ่งที่ผมอยากได้คือ **ทั้งสองอย่างพร้อมกัน** — ทีมเป็นเจ้าของ pipeline + backend ของตัวเอง แต่ส่วนกลางก็ยังเห็นทุกอย่างรวมที่เดียว

## โครงสร้างที่ผมใช้ — collector 2 ชั้น

ทางออกคือจัด collector เป็น **2 ชั้น (layered / fan-out)**:

![OTel collector topology: per-project collector + backend, forward เข้าส่วนกลาง](/blog/otel-collector-topology.svg)

ไล่จากภาพ:

1. **แต่ละโปรเจกต์มี OTel Collector ของตัวเอง** — apps/services ในโปรเจกต์ยิง OTLP เข้า collector ของโปรเจกต์นั้น
2. Collector ของโปรเจกต์ **export ออกเป็น 2 ทาง (fan-out)**:
   - เข้า **backend ของทีมเอง** (เส้นเขียว) — ทีมดู telemetry ตัวเองได้ทันที
   - **forward เข้า collector ส่วนกลาง** (เส้นม่วง) — ส่งต่อให้ platform team
3. **Collector ส่วนกลาง** รวม telemetry จากทุกโปรเจกต์ แล้วเขียนลง **store กลาง** (ClickStack — ClickHouse + HyperDX + Portal)

หัวใจอยู่ที่ข้อ 2 — collector ของแต่ละโปรเจกต์ **ส่ง telemetry ชุดเดียวออกไปสองปลายทางพร้อมกัน** ไม่ใช่เลือกอย่างใดอย่างหนึ่ง

## ทำไมแต่ละโปรเจกต์ต้องมี collector ของตัวเอง

- **Autonomy** — ทีมปรับ pipeline ของตัวเองได้ (เพิ่ม processor, ทำ filter, redact ข้อมูล sensitive) โดยไม่กระทบทีมอื่น
- **Sampling ที่ใกล้ต้นทาง** — อยาก sample trace หรือ drop log ที่ไม่จำเป็น ทำตั้งแต่ collector ของโปรเจกต์ ก่อนส่งต่อ ลดทั้ง noise และ cost ปลายทาง
- **Blast radius เล็กลง** — collector โปรเจกต์ไหนมีปัญหา ก็กระทบแค่โปรเจกต์นั้น ไม่ลามทั้งองค์กร

## ทำไมแต่ละโปรเจกต์ต้องมี backend ของตัวเอง

นี่คือเหตุผล **อันดับหนึ่ง** ของผม — เพราะแต่ละโปรเจกต์เป็นของ **ลูกค้าคนละราย** และ monitoring stack นั้นถือเป็น **ของลูกค้า**:

- **monitoring ของลูกค้าต้องยืนได้ด้วยตัวเอง** — ถ้าส่วนกลางของผมล่ม ลูกค้าก็ยังมี collector + backend ของเขาเองที่ทำงานเต็มรูปแบบ ระบบ monitoring ของเขา **ไม่ดับตามส่วนกลาง** นี่คือข้อที่สำคัญที่สุด ส่วนกลางเป็นแค่ "ส่วนเสริม" สำหรับภาพรวมฝั่งผม ไม่ใช่ของที่ลูกค้าต้องพึ่ง
- **data ของลูกค้าอยู่กับลูกค้า** — เรื่อง data ownership, privacy และ access control ชัดเจน ไม่ปนกับลูกค้ารายอื่น
- **ทีมลูกค้าเห็น telemetry ของตัวเองทันที** — debug ประจำวันได้เลย ไม่ต้องขอสิทธิ์หรือ query รวมกับของรายอื่นที่ส่วนกลาง

:::important
หลักที่ผมยึดคือ — stack ของลูกค้าต้อง **self-contained** ส่วนกลางล่มเมื่อไหร่ ต้องไม่กระทบ monitoring ของลูกค้าแม้แต่นิดเดียว การ forward เข้าส่วนกลางเป็นแบบ "ส่งสำเนาออกไป" เฉยๆ ถ้าปลายทางส่วนกลางมีปัญหา ก็แค่ส่วนกลางไม่ได้ข้อมูลช่วงนั้น แต่ฝั่งลูกค้ายังครบทุกอย่าง
:::

## ทำไมต้อง forward เข้าส่วนกลาง

- **Single pane of glass** — platform team เห็น telemetry ของทุกโปรเจกต์รวมที่เดียว ทำ dashboard ข้ามโปรเจกต์ได้
- **Incident ข้ามทีม** — เวลาปัญหาลามข้ามหลายโปรเจกต์ การมี store รวมช่วยไล่ root cause ได้เร็วกว่ามานั่งต่อจิ๊กซอว์จาก backend แต่ละทีม
- **Governance / capacity planning** — ดู usage รวมทั้งองค์กรจากที่เดียว

## ทำยังไง — fan-out ที่ exporter

ของจริงทำง่ายกว่าที่คิด — OTel collector รองรับการมี **exporter หลายตัวใน pipeline เดียว** เพราะฉะนั้นแค่ใส่ทั้ง backend ของทีมและ collector ส่วนกลางเข้าไปใน `exporters` ของ pipeline เดียวกัน telemetry ก็ไหลออกทั้งสองทางเอง

```yaml title="collector ของโปรเจกต์ A — fan-out 2 ปลายทาง"
receivers:
  otlp:
    protocols:
      grpc: { endpoint: 0.0.0.0:4317 }

processors:
  batch: {}
  resource:
    attributes:
      # tag ให้รู้ว่ามาจากโปรเจกต์ไหน — สำคัญมากตอนรวมที่ส่วนกลาง
      - { key: service.namespace, value: project-a, action: upsert }

exporters:
  # 1) backend ของทีม A เอง
  otlp/local:
    endpoint: backend-a.internal:4317
  # 2) forward เข้า collector ส่วนกลาง
  otlp/central:
    endpoint: otel-central.example.com:443

service:
  pipelines:
    traces:  { receivers: [otlp], processors: [batch, resource], exporters: [otlp/local, otlp/central] }
    metrics: { receivers: [otlp], processors: [batch, resource], exporters: [otlp/local, otlp/central] }
    logs:    { receivers: [otlp], processors: [batch, resource], exporters: [otlp/local, otlp/central] }
```

ฝั่ง collector ส่วนกลางก็เป็น OTLP receiver ธรรมดา (มี auth ด้วย bearer token ต่อโปรเจกต์) แล้ว export เข้า ClickHouse:

```yaml title="collector ส่วนกลาง (ตัดให้สั้น)"
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
        auth: { authenticator: bearertokenauth }   # token ต่อโปรเจกต์

exporters:
  clickhouse:
    endpoint: tcp://clickhouse:9000
    database: otel

service:
  pipelines:
    traces:  { receivers: [otlp], exporters: [clickhouse] }
    metrics: { receivers: [otlp], exporters: [clickhouse] }
    logs:    { receivers: [otlp], exporters: [clickhouse] }
```

:::tip
อย่าลืม **tag ที่ต้นทาง** — ผมใส่ `service.namespace` (และ `k8s.cluster.name` ถ้าอยู่บน k8s) ที่ collector ของแต่ละโปรเจกต์ก่อน forward เพราะพอ telemetry ไปกองรวมที่ส่วนกลาง tag พวกนี้คือสิ่งเดียวที่แยกได้ว่า data มาจากโปรเจกต์ไหน
:::

## ข้อควรระวัง

- **Tag consistency** — ถ้าแต่ละทีม tag ไม่เหมือนกัน ข้อมูลที่ส่วนกลางจะรวมยาก ควรมี convention ของ resource attribute ที่ทุกทีมใช้ตรงกัน
- **Sampling ทำที่ไหน** — ถ้า sample/filter ที่ collector โปรเจกต์ ส่วนกลางจะได้ข้อมูลที่ถูก sample แล้ว ต้องตัดสินใจว่าอยากให้ส่วนกลางเห็นเต็มหรือเห็นเท่าที่ทีมส่ง
- **Cost ปลายทาง** — telemetry ไป 2 ที่ก็ใช้ทรัพยากร 2 ที่ ส่วนกลางควรเก็บแบบ retention สั้นหรือ tiered (ผมใช้ hot/cold บน ClickHouse — เล่าไว้ในโพสต์ ClickStack)
- **เพิ่ม hop** — มี collector คั่นกลางเพิ่มหนึ่งชั้น แลกมากับ autonomy + decoupling ซึ่งผมว่าคุ้ม

## เชื่อมกับภาพใหญ่

โครงสร้างนี้คือชั้น "ingest" ที่อยู่ก่อนหน้าสองโพสต์ก่อนของผม — collector ส่วนกลางเขียนลง [ClickStack](/posts/self-host-observability-clickstack) (ClickHouse + HyperDX) แล้ว [internal portal](/posts/multi-cluster-k8s-observability-portal) ก็อ่าน store เดียวกันไปทำ dashboard ของทีม พอวาง topology ของ collector ให้ดีตั้งแต่ต้นทาง ปลายทางก็ต่อยอดได้สบาย

## สรุป

ถ้าต้องดูแล observability หลายโปรเจกต์ ลองจัด collector เป็น **2 ชั้น**:

- **แต่ละโปรเจกต์มี collector + backend ของตัวเอง** — เหตุผลหลักคือถ้าเป็นของลูกค้า monitoring ของลูกค้าต้องยืนได้เองแม้ส่วนกลางล่ม (พ่วงด้วย autonomy + sampling ใกล้ต้นทาง)
- **fan-out ที่ exporter** — ส่ง telemetry ชุดเดียวออกทั้ง backend ทีม + collector ส่วนกลางพร้อมกัน
- **collector ส่วนกลางรวมทุกอย่าง** ลง store เดียว เพื่อ single pane of glass ข้ามโปรเจกต์
- **tag ที่ต้นทางให้ครบ** เพื่อแยกแยะ data ตอนรวมที่ส่วนกลาง

ได้ทั้งความเป็นเจ้าของของทีม และภาพรวมของ platform team โดยไม่ต้องเลือกอย่างใดอย่างหนึ่ง

:::guy1
สรุปคือทีมมี collector + backend ของตัวเอง แล้วก็ forward เข้าส่วนกลางด้วย ใช่มั้ย?
:::

:::ne7shii
ใช่ครับ — **fan-out ที่ exporter** ทำให้ได้ทั้งสองอย่างจาก telemetry ชุดเดียว ทีม autonomy เต็มที่ ส่วนกลางก็เห็นครบ ขอแค่ tag ให้ดีตั้งแต่ต้นทางก็พอครับ
:::

::github{repo="open-telemetry/opentelemetry-collector"}
