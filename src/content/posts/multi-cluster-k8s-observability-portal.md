---
title: 'สร้าง Internal Portal ดู Observability หลาย K8s Cluster ด้วย Next.js + OTel'
published: 2026-06-12
draft: false
description: 'high-level architecture ของ internal portal ที่รวม observability ของ Kubernetes หลาย cluster ไว้ที่เดียว — ทุก cluster push telemetry ผ่าน OpenTelemetry เข้า ClickHouse ส่วนกลาง แล้ว Next.js portal (หลัง OIDC) อ่านมาแสดงแบบ single pane of glass'
tags: ['kubernetes', 'observability', 'nextjs', 'opentelemetry', 'clickhouse', 'platform-engineering', 'architecture', 'oidc']
toc: true
---

:::guy1
ตอนนี้บริษัทมี K8s หลาย cluster ทั้งบน cloud หลาย account แล้วก็ on-prem ทีมต้องสลับ kubectl context ไปมา ดู metric แต่ละที่แยกกัน ปวดหัวมาก มีวิธีรวมหน้าจอเดียวมั้ย?
:::

:::ne7shii
ผมเจอปัญหาเดียวกันเลยครับ เลยสร้าง **internal portal** ขึ้นมา — รวม dashboard ของทุก cluster ไว้ที่เดียว เลือก cluster จาก UI ได้เลย ข้างหลังใช้ **OpenTelemetry** push telemetry เข้า **ClickHouse** ส่วนกลาง แล้วหน้าบ้านเป็น **Next.js** ที่ล็อกอินผ่าน SSO โพสต์นี้จะเล่าแค่ระดับ **architecture design** ไม่ลงโค้ดลึก
:::

:::guy2
แล้วทำไมไม่ใช้ Grafana ไปเลยล่ะ? มี dashboard k8s สำเร็จเยอะแยะ
:::

:::ne7shii
Grafana ดีครับ แต่ผมอยากได้ portal ที่เป็น **มากกว่า dashboard** — รวมทั้ง observability, software version ของแต่ละ env, skill registry, security findings ไว้ที่เดียวเป็น "บ้านของ platform team" เดี๋ยวเล่าให้ฟังว่าวาง architecture ยังไง
:::

## โจทย์ — fleet ของ cluster ที่กระจัดกระจาย

สถานการณ์จริงคือเรามี Kubernetes หลาย cluster ที่อยู่คนละที่ — กระจายทั้งบน cloud หลาย account และ on-prem (ในโพสต์นี้ขอเรียกรวมๆ ว่า **Cluster A / B / C**)

ปัญหาคลาสสิกของ multi-cluster:

- สลับ `kubectl` context ไปมา ดู resource ทีละ cluster
- metric แต่ละที่อยู่คนละระบบ ไม่มีหน้ารวม
- คนใหม่เข้ามาไม่รู้ว่ามี cluster อะไรบ้าง env ไหนรันเวอร์ชันอะไร

เป้าหมายคือทำ **single pane of glass** — หน้าจอเดียวที่เห็นทุก cluster, drill ลงไปดู namespace / pod / node ได้ และต่อยอดเป็น internal platform portal ในระยะยาว

## High-level Architecture

หัวใจของ design มีหลักเดียว — **อย่าให้ portal ไปยิง kube-apiserver ของแต่ละ cluster ตรงๆ** เพราะมันช้า, ต้องถือ credential หลายชุด และ coupling สูง (portal ผูกกับทุก cluster โดยตรง) แทนที่จะทำแบบนั้น ให้ทุก cluster **push telemetry มาที่ส่วนกลาง** แล้ว portal อ่านจากที่เดียว

![High-level architecture ของ multi-cluster observability portal](/blog/multi-cluster-portal-architecture.svg)

ไล่จากซ้ายไปขวา:

1. **ทุก K8s cluster** ติดตั้ง OpenTelemetry แล้ว push telemetry ออกมาแบบ OTLP/TLS
2. **OTel Collector ส่วนกลาง** รับ telemetry จากทุก cluster มารวมที่เดียว
3. **ClickHouse** เก็บ logs / metrics / traces ทั้งหมด (columnar store ที่ query ปริมาณมหาศาลได้เร็ว)
4. **Next.js Portal** อ่านจาก ClickHouse แบบ **read-only** มาแสดงผล
5. **ผู้ใช้** เข้าถึง portal หลัง **SSO/OIDC** แล้วเลือก cluster ที่อยากดูจาก UI

ข้อดีของการ decouple แบบนี้คือ — portal ไม่ต้องรู้จัก credential ของ cluster ไหนเลย, เพิ่ม cluster ใหม่ก็แค่ให้มัน push เข้ามา และ query ทุกอย่างวิ่งบน store เดียวที่เร็วอยู่แล้ว

:::note
เพราะ telemetry เข้ามาเป็น **OTLP มาตรฐาน** ทั้งหมด ถ้าวันหนึ่งอยากเปลี่ยน backend หรือเสริม tool อื่น ก็ทำได้ที่ชั้น collector โดยไม่ต้องไปแก้ทุก cluster
:::

## ในแต่ละ cluster — แยก collector เป็น 2 บทบาท

จุดที่ผมอยากเน้นในเชิง design คือ ในแต่ละ cluster ผมแยก OTel ออกเป็น **2 บทบาท** เพื่อให้เก็บ metric ได้ครบทั้งสองระดับ:

- **Cluster collector (Deployment)** — เก็บภาพระดับ cluster เช่น จำนวน deployment, replica desired/available ต่อ namespace (จาก kube-state-metrics)
- **Agent collector (DaemonSet)** — รันทุก node เก็บ resource usage ระดับ node/pod (cpu/mem/fs) และ log จาก container

แล้ว **tag ทุก stream ด้วย `k8s.cluster.name`** — นี่คือกุญแจที่ทำให้ portal ทำ cluster-aware ได้ คือ data ของทุก cluster อยู่รวมใน ClickHouse เดียว แต่แยกแยะได้ว่ามาจาก cluster ไหนด้วย tag ตัวนี้

:::tip
การแยก cluster-level กับ node-level ออกจากกันตั้งแต่ design ช่วยให้ภายหลังทำ view ได้ทั้งสองมุม — มองภาพรวม fleet ก็ได้ จะ drill ลงไปดู usage ราย node/pod ก็ได้ โดยไม่ต้องรื้อ pipeline
:::

## หน้าบ้าน — Next.js with OIDC

หน้าบ้านเป็น **Next.js** ที่ query ClickHouse แล้วแสดงเป็น dashboard หลาย view (overview, workloads, capacity, nodes, software versions ฯลฯ) เลือก cluster จาก UI ได้ การ auth ใช้ **OIDC (SSO)** gate ทุก route

:::note
ผม **reuse identity provider ที่มีอยู่แล้ว** — ไม่ต้องสร้าง IdP ใหม่ นี่คือข้อดีของการ standardize เรื่อง SSO ไว้ก่อน (ตามธีมโพสต์ OIDC ของผม) พอจะทำ internal tool ใหม่ ก็เสียบ OIDC เดิมได้เลย ทุกเครื่องมือของ platform team อยู่หลัง login เดียวกัน
:::

เรื่องที่ผมยึดในเชิง design ของหน้าบ้านคือ — portal **อ่านอย่างเดียว** จาก ClickHouse ไม่ได้ถือ state ของ cluster เอง ทำให้มันเบา, ปลอดภัย (อ่านอย่างเดียว) และ scale ตามจำนวน cluster ได้โดยไม่ต้องแก้อะไรมาก

## Dashboard อะไรบ้างที่ build ได้จาก data นี้

พอ telemetry ของทุก cluster มารวมใน ClickHouse เดียว + tag ด้วย `k8s.cluster.name` + มีทั้งระดับ cluster และ node แล้ว มันเปิดทางให้ build dashboard ได้หลายมุม โดยแต่ละ view ตอบคำถามคนละแบบ:

- **Fleet Overview / Health** — สุขภาพรวมของทุก cluster ในหน้าเดียว: cluster ไหนมีปัญหา, มี pod/deployment ที่ไม่ healthy กี่ตัว — ตอบคำถาม *"ตอนนี้ทั้ง fleet โอเคมั้ย?"* ได้ในแว่บเดียว
- **Workloads & Pods** — deployment, replica desired vs available, pod ที่ crash/restart บ่อย — ตอบ *"workload ไหนกำลังมีปัญหา?"*
- **Capacity & Resource Usage** — cpu/mem/storage ต่อ node และต่อ namespace — ตอบ *"ใครกิน resource เยอะ, ใกล้เต็มตรงไหน, ควร scale ตรงไหน?"*
- **Nodes & Topology** — node ในแต่ละ cluster และความสัมพันธ์ของ workload — ตอบ *"อะไรรันอยู่บน node ไหน?"*
- **Software Versions per Env** — image เวอร์ชันที่รันจริงต่อ env — ตอบ *"dev/uat/prod เวอร์ชันตรงกันมั้ย, มี version drift หรือเปล่า?"*

:::tip
มุมที่ผมว่ามีค่าที่สุดของการรวมไว้ที่เดียวคือ **cross-cluster comparison** — เพราะ data ของทุก cluster อยู่ใน store เดียวและ tag ด้วย `k8s.cluster.name` การเทียบ resource usage หรือเวอร์ชันข้าม cluster ในหน้าเดียวจึงเป็นแค่ query เดียว ไม่ต้องไปไล่ดูทีละที่แล้วเทียบเอง
:::

และเพราะ ClickHouse เก็บครบทั้ง **logs / metrics / traces** อยู่แล้ว ในอนาคตก็ต่อยอดเป็น view สำหรับ drill ลง log หรือ trace ของ pod ที่สงสัยได้ — โดยไม่ต้องเพิ่ม backend ใหม่

## Deploy — pattern ที่ใช้ซ้ำทั้งทีม

ตัว portal deploy ด้วย flow เดียวกับ service อื่นในทีม — push เข้า main แล้ว CI build image, push เข้า registry, แล้ว deploy ขึ้น VM ที่มี **shared reverse proxy + wildcard cert** เป็น front door ร่วมกัน

ประเด็น design ตรงนี้ไม่ใช่ตัว tool แต่เป็นเรื่องของการ **standardize**: ทุก internal service ใช้ pipeline แบบเดียวกัน, อยู่หลัง proxy + cert เดียวกัน, และ login ด้วย SSO เดียวกัน — คนใหม่เข้ามาดูแลก็เข้าใจได้เร็วเพราะทุกอย่างหน้าตาเหมือนกันหมด

## ทำไมถึงคุ้มที่จะสร้างเอง

หลายคนถามว่าทำไมไม่ใช้ Grafana — คำตอบคือ portal ตัวนี้ออกแบบมาให้เป็น **บ้านของ platform team** ไม่ใช่แค่ดู metric ตอนนี้มันรวม:

- **Observability** หลาย cluster (หัวข้อหลักของโพสต์นี้)
- **Software Versions** — เวอร์ชัน image ต่อ env
- **Skills registry** — catalog ของ CI component / skill ที่ทีมใช้ร่วมกัน
- **Security findings** — ผล scan จาก CI — เดี๋ยวมีโพสต์แยกเรื่องนี้

เพราะมันเป็นแอปของเราเอง การ extend แต่ละ feature เลยทำได้อิสระ ไม่ติดกรอบของ dashboard tool และทุกอย่างอยู่หลัง SSO เดียวกัน

## สรุป

ถ้าต้องดูแล Kubernetes หลาย cluster การมี **single pane of glass** ช่วยลดภาระทีมมาก หลักการ architecture ที่ผมใช้สรุปสั้นๆ:

- อย่าให้ portal ยิง apiserver ตรงๆ — ให้ทุก cluster **push telemetry** เข้า collector ส่วนกลาง แล้วอ่านจาก ClickHouse ที่เดียว
- ในแต่ละ cluster แยก collector เป็น **Deployment (cluster-level)** + **DaemonSet (node-level)** เก็บ metric ครบทั้งสองมุม
- **tag `k8s.cluster.name`** ทุก stream เพื่อทำ cluster-aware query บน store เดียว
- หน้าบ้าน **อ่านอย่างเดียว** หลัง **OIDC** ที่ reuse ของเดิม + deploy ด้วย pattern ที่ standardize ทั้งทีม

:::guy1
สรุปคือ push telemetry เข้าที่เดียว แล้วหน้าบ้าน query cluster ไหนก็ได้ ใช่มั้ย?
:::

:::ne7shii
ใช่ครับ — pattern คือ **collect แบบ push, store ที่ ClickHouse, อ่านอย่างเดียวจาก portal** พอวางรากนี้แล้ว จะเติม feature อื่น (version, security, skill registry) บนบ้านเดียวกันได้สบายเลย
:::
