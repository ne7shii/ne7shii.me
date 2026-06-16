---
title: 'Self-host Observability ด้วย ClickStack (ClickHouse + HyperDX + OTel)'
published: 2026-06-11
draft: false
description: 'สร้าง observability stack แบบ self-host ด้วย ClickStack บน AWS — ClickHouse เก็บ logs/metrics/traces, HyperDX เป็นหน้า UI, OTel collector รวม telemetry จากหลาย cluster พร้อมบทเรียนเรื่องบิล S3 ที่บานปลายตอนใช้ S3 เป็น backend อย่างเดียว และการแก้ด้วย hot/cold tiered storage'
tags: ['observability', 'clickhouse', 'hyperdx', 'opentelemetry', 'clickstack', 'kubernetes', 'aws', 'open-source']
toc: true
---

:::guy1
อยากได้ logs + metrics + traces รวมที่เดียว แต่ Grafana LGTM stack มันหลายตัวมาก (Loki, Mimir, Tempo, Grafana) ดูแลเหนื่อย มีตัวที่เบากว่านี้มั้ย?
:::

:::ne7shii
ลอง **ClickStack** ดูครับ — มันเอา **ClickHouse** ตัวเดียวเก็บทั้ง logs, metrics และ traces แล้วใช้ **HyperDX** เป็นหน้า UI ค้นหา ส่วนการเก็บ telemetry ก็ใช้ **OpenTelemetry collector** มาตรฐาน
:::

:::guy2
ClickHouse ตัวเดียวเก็บได้หมดเลยเหรอ? แล้วมันไม่แพงเหรอ
:::

:::ne7shii
เก็บได้หมดครับ และเร็วมากด้วย — แต่เรื่อง "ค่าใช้จ่าย" เนี่ย ผมเจอบทเรียนราคาแพงมาแล้ว เดี๋ยวเล่าให้ฟังตอนท้าย ว่าบิล S3 มันบานปลายได้ยังไงและแก้ยังไง
:::

## ทำไมต้อง ClickStack

โดยปกติถ้าจะทำ observability ครบ 3 อย่าง (logs / metrics / traces) เรามักจบที่ Grafana LGTM stack ซึ่งดีมาก แต่ก็มี component เยอะ — Loki สำหรับ log, Mimir สำหรับ metric, Tempo สำหรับ trace, แล้วก็ Grafana เป็นหน้าจอ ทุกตัวต้องดูแล scale และ tune แยกกัน

[ClickStack](https://clickhouse.com/use-cases/observability) เลือกอีกแนวทางหนึ่ง — ใช้ **ClickHouse** เป็น storage engine เดียวสำหรับทั้ง 3 signal เพราะ ClickHouse เป็น columnar database ที่ query ข้อมูลปริมาณมหาศาลได้เร็วมาก เหมาะกับ telemetry ที่เป็น append-heavy และต้อง aggregate บ่อย

Stack ที่ผม deploy ประกอบด้วย 3 ส่วนหลัก:

- **ClickHouse** — เก็บ logs, metrics, traces ทั้งหมด (columnar storage)
- **HyperDX** — UI สำหรับ search / explore / dashboard / alert บน ClickHouse
- **OpenTelemetry Collector** — รับ telemetry จากทุกที่แล้วเขียนลง ClickHouse

ภาพรวมทั้งระบบ — telemetry ไหลจากซ้ายเข้า ClickHouse แล้วมีสอง UI อ่านออกไป ส่วนข้างใน ClickHouse เองก็แบ่ง storage เป็น hot/cold (จุดที่เป็นบทเรียนของโพสต์นี้):

![ClickStack architecture: ingest → ClickHouse (hot/cold) → HyperDX + Portal](/blog/clickstack-architecture.svg)

:::note
จุดที่ผมชอบคือ telemetry เข้ามาเป็น **OTLP มาตรฐาน** ทั้งหมด เพราะฉะนั้นถ้าวันหนึ่งอยากเปลี่ยน backend ก็แค่เปลี่ยนปลายทางที่ collector ไม่ต้องไปแก้ instrumentation ในแอปทุกตัว
:::

## Deploy บน AWS — เริ่มด้วย S3 อย่างเดียว

ผม deploy ClickStack ไว้บน **AWS** โดยตอนแรกตั้งใจให้ ClickHouse ใช้ **S3 เป็น storage backend อย่างเดียว** — ไม่เก็บ data ลง local disk เลย คิดว่าจะได้ไม่ต้องห่วงเรื่อง disk เต็มและ scale พื้นที่ได้ไม่จำกัด (สปอยล์: นี่แหละจุดที่ผมพลาด เดี๋ยวเล่าตอนท้าย)

```yaml title="docker-compose.yml (ตัดให้สั้น)"
services:
  clickhouse:
    image: clickhouse/clickhouse-server:24.8
    volumes:
      - ./clickhouse/config.d:/etc/clickhouse-server/config.d  # storage policy ชี้ไป S3
    ulimits:
      nofile: { soft: 262144, hard: 262144 }

  hyperdx:
    image: hyperdx/hyperdx:latest
    depends_on: [clickhouse, mongo]
    ports:
      - '8080:8080'

  otel-collector:
    image: otel/opentelemetry-collector-contrib:latest
    command: ['--config=/etc/otel/config.yaml']
    volumes:
      - ./otel-config.yaml:/etc/otel/config.yaml
    ports:
      - '4317:4317' # OTLP gRPC
      - '4318:4318' # OTLP HTTP

  mongo:
    image: mongo:4.4 # HyperDX ใช้เก็บ config/dashboard
```

storage policy ตอนแรกของผมหน้าตาประมาณนี้ — มี disk เดียวคือ S3 แล้วให้ทุก table เขียนลงตรงนั้นเลย:

```xml title="ตอนแรก: S3 เป็น disk เดียว (config.d/storage.xml)"
<storage_configuration>
  <disks>
    <s3>
      <type>s3</type>
      <endpoint>https://s3.&lt;region&gt;.amazonaws.com/&lt;bucket&gt;/clickhouse/</endpoint>
    </s3>
  </disks>
  <policies>
    <s3_only>
      <volumes><main><disk>s3</disk></main></volumes>
    </s3_only>
  </policies>
</storage_configuration>
```

ฝั่ง OTel collector ก็เป็น pipeline มาตรฐาน — รับ OTLP เข้ามา, batch, แล้ว export เข้า ClickHouse:

```yaml title="otel-config.yaml (ตัดให้สั้น)"
receivers:
  otlp:
    protocols:
      grpc: { endpoint: 0.0.0.0:4317 }
      http: { endpoint: 0.0.0.0:4318 }

processors:
  batch: {}

exporters:
  clickhouse:
    endpoint: tcp://clickhouse:9000
    database: otel

service:
  pipelines:
    logs:    { receivers: [otlp], processors: [batch], exporters: [clickhouse] }
    metrics: { receivers: [otlp], processors: [batch], exporters: [clickhouse] }
    traces:  { receivers: [otlp], processors: [batch], exporters: [clickhouse] }
```

## รับ telemetry จากหลาย cluster

พอมี collector กลางแล้ว ก็เหลือแค่ทำให้แต่ละ Kubernetes cluster ส่ง logs / metrics / traces มาที่นี่ ผมใช้ OTel collector แบบ **DaemonSet** ลงทุก node ในแต่ละ cluster เพื่อเก็บ:

- **logs** จาก container ทุกตัวบน node
- **metrics** จาก kubelet / node
- **traces** ที่แอป export ออกมาเป็น OTLP

แล้ว tag ทุกอย่างด้วย `k8s.cluster.name` (แต่ละ cluster ตั้งค่าของตัวเอง) เพื่อให้แยกได้ว่า data มาจาก cluster ไหนตอน query รวมที่เดียว:

```yaml title="DaemonSet collector — ใส่ resource attribute"
processors:
  resource:
    attributes:
      - key: k8s.cluster.name
        value: <cluster-name>   # แต่ละ cluster ใส่ชื่อตัวเอง
        action: upsert
```

:::important
ClickHouse store ตัวนี้แหละที่อยู่เบื้องหลัง [internal portal ดู observability หลาย cluster](/posts/multi-cluster-k8s-observability-portal) ในโพสต์ก่อน — telemetry ที่ทุก cluster push เข้ามากองรวมที่ ClickHouse เดียว แล้ว **HyperDX** ใช้สำหรับ search/explore แบบ ad-hoc ส่วน **portal (Next.js)** ก็อ่าน store เดียวกันไปทำ dashboard ของทีม สอง UI คนละบทบาท แต่ใช้ data หลังบ้านชุดเดียวกัน
:::

:::tip
เวลา instrument แอปเอง ผมห่อแต่ละ stage ของ pipeline ด้วย span — เช่นใน service หนึ่งของผมมี span `transcode -> save_audio -> transcribe -> file` พอ request ไหน fail ก็เห็นใน HyperDX ทันทีว่าพังที่ stage ไหน พร้อม exception detail ไม่ต้องไปไล่ log ทีละบรรทัด
:::

## บทเรียนราคาแพง — บิล S3 บานปลาย

มาถึงเรื่องที่สัญญาไว้ตอนต้นครับ :sweat_smile:

อย่างที่เล่าไปในตอน deploy — ผมให้ ClickHouse เก็บ **data ทั้งหมดบน S3 อย่างเดียว** (policy `s3_only` ด้านบน) เพราะคิดว่าถูกและไม่ต้องห่วงเรื่อง disk เต็ม ฟังดูดีใช่มั้ยครับ — แต่พอบิลมา ผมถึงรู้ว่าพลาด

ปัญหาไม่ได้อยู่ที่ "ปริมาณข้อมูล" แต่อยู่ที่ **"จำนวน request"**:

- ClickHouse เขียน data เป็น **part** เล็กๆ จำนวนมหาศาล
- พอเก็บทุกอย่างบน S3 ทุก part = object บน S3
- สุดท้ายมี object เล็กๆ ราว **103,000 ชิ้น** และทุกครั้งที่ query/merge ก็ยิง request หา S3 รัวๆ
- บิล S3 ไม่ได้แพงเพราะ storage แต่แพงเพราะ **request count**

:::caution
กับ object storage แบบ S3 — **ค่า request (GET/PUT/LIST) มักแพงกว่าค่า storage** ถ้า workload ของคุณสร้าง object เล็กๆ จำนวนมาก (อย่าง ClickHouse part) คุณจะโดนบิลจาก request ไม่ใช่จากพื้นที่ เช็ค pattern การเขียนก่อนเอา hot data ไปไว้บน S3 ตรงๆ
:::

## ทางแก้ — Hot/Cold Tiered Storage

วิธีแก้ที่ผมใช้คือ **tiered storage** — เพิ่ม local disk บน instance (EBS) กลับเข้ามาเป็น tier `hot` ให้ข้อมูลใหม่อยู่บนนั้นที่เร็วและไม่มีค่า request ส่วนข้อมูลเก่า (cold) ค่อย move ไป S3 ทีหลัง

หลักการ 3 ส่วน:

1. **Storage policy** — แบ่ง disk เป็น 2 tier: `hot` (local EBS) กับ `cold` (S3)
2. **Compact parts** — tune ให้ ClickHouse เขียน part ใหญ่ขึ้น/merge บ่อยขึ้น ลดจำนวน object เล็กๆ
3. **TTL move** — ตั้ง TTL ให้ data ที่เก่ากว่า 3 วัน ย้ายจาก hot ไป cold อัตโนมัติ

```xml title="storage policy (config.d/storage.xml)"
<storage_configuration>
  <disks>
    <hot><type>local</type><path>/var/lib/clickhouse/hot/</path></hot>
    <cold>
      <type>s3</type>
      <endpoint>https://s3.&lt;region&gt;.amazonaws.com/&lt;bucket&gt;/clickhouse/</endpoint>
    </cold>
  </disks>
  <policies>
    <hot_cold>
      <volumes>
        <hot><disk>hot</disk></hot>
        <cold><disk>cold</disk></cold>
      </volumes>
    </hot_cold>
  </policies>
</storage_configuration>
```

```sql title="ตั้ง TTL move บน table — 3 วันแล้วย้ายไป cold"
ALTER TABLE otel_logs
  MODIFY TTL toDateTime(timestamp) + INTERVAL 3 DAY TO VOLUME 'cold';
```

ผม apply policy นี้กับ otel table ทั้ง 8 ตัวบน production — ข้อมูลใหม่จะ insert ลง local hot tier เป็น compact part ส่วน query ที่ดู data ล่าสุด (ซึ่งคือส่วนใหญ่) ก็วิ่งบน local disk ไม่แตะ S3 เลย ทำให้ทั้ง request ที่ยิงหา S3 และบิลลดลงอย่างเห็นได้ชัด

:::important
ตอน apply ผมเจอ ClickHouse ที่ recover จาก unclean shutdown แล้ว system-log table มี part เสีย — ต้อง move part ที่ corrupt ไป `detached/` ก่อน server ถึงจะขึ้น **เพราะฉะนั้นทำตอน maintenance window และ backup ก่อนเสมอ** การเปลี่ยน storage policy บน production ไม่ใช่เรื่องเล่นๆ
:::

## สรุป

ClickStack เป็น observability stack ที่ "เบากว่า" ในแง่จำนวน component — ClickHouse ตัวเดียวจบทั้ง logs/metrics/traces, HyperDX เป็น UI, OTel collector รวม telemetry ทั้ง cluster เข้ามา และเพราะทุกอย่างเป็น OTLP มาตรฐาน การย้าย backend ในอนาคตก็ไม่เจ็บ

แต่บทเรียนที่อยากฝากไว้คือ — **อย่าเอา hot data ไปวางบน object storage ตรงๆ** ถ้า workload สร้าง object เล็กๆ เยอะ ทำ hot/cold tiered storage ตั้งแต่แรก แล้วค่อย move data เก่าไป S3 จะประหยัดกว่ามาก ผมจ่ายค่าเรียนรู้ตรงนี้ไปแล้ว เลยอยากให้คุณไม่ต้องจ่าย :grin:

:::guy1
สรุปคือ self-host observability ได้ด้วย ClickHouse ตัวเดียว แต่ต้องระวังเรื่อง storage tier ใช่มั้ย?
:::

:::ne7shii
ใช่ครับ — stack เบา query เร็ว แต่ key takeaway คือ **อย่าใช้ S3 เป็น backend อย่างเดียว** ทำ hot บน local disk, cold บน S3, ตั้ง TTL ให้มัน move เอง และจำไว้ว่าบิล object storage มันมาจาก request ไม่ใช่แค่พื้นที่ครับ
:::

::github{repo="hyperdxio/hyperdx"}
