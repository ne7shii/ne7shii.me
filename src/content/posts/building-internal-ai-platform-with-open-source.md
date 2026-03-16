---
title: 'สร้าง AI Platform ภายในองค์กรด้วย Open Source'
published: 2026-03-17
draft: false
description: 'POC ออกแบบ AI Platform สำหรับองค์กร — MCP Gateway เป็นศูนย์กลาง, ZITADEL จัดการ SSO + role, AgentGateway คุม access control, internal MCP catalog ให้พนักงานเลือกใช้ได้เลย'
tags: ['ai', 'platform-engineering', 'open-source', 'kubernetes', 'mcp']
toc: true
---

:::guy1
บริษัทเราต้องมี AI ใช้งานแล้วนะ ทำยังไงดี?
:::

:::guy2
ก็แค่แจก ChatGPT ให้ทุกคนไปเลยสิ หรือจะ Claude ก็ได้
:::

:::guy3
แล้วพวกข้อมูลภายในองค์กรล่ะ? ระบบที่มีอยู่ล่ะ? จะเอา AI มาเชื่อมต่อยังไง? audit trail ใครดูแล?
:::

:::ne7shii
สร้าง MCP Gateway ให้เป็นศูนย์กลางเลยดีกว่า — ต่อ SSO ขององค์กร คุม access control ด้วย policy แล้วเปิดเป็น internal MCP catalog ให้ทุกคนเลือก shopping ใช้ได้เลย
:::

## เรื่องมันเป็นยังไง

โพสต์นี้เป็น POC ที่ผมกำลังลองอยู่นะครับ ยังไม่ได้ขึ้น production แต่ research มาพอสมควรแล้ว เลยอยากมาแชร์ไอเดียกัน

หลายที่เริ่มด้วยการแจก ChatGPT หรือ Claude ให้พนักงาน ซึ่งก็โอเค แต่พอใช้จริงๆ จะเจอว่า:

- AI มันเข้าถึงข้อมูลในองค์กรไม่ได้
- ต่อกับระบบภายในก็ไม่ได้
- ไม่รู้เลยว่าใครใช้อะไร เท่าไหร่
- access control ไม่มี — ทุกคนได้เหมือนกันหมด

ผมเลยลองวาง architecture แบบนี้ — ใช้ **MCP Gateway เป็นศูนย์กลาง** แล้วเปิดเป็น **internal MCP catalog** ให้คนในองค์กรเลือกหยิบ tools ต่างๆ มาใช้ได้เลย แต่ทุกอย่างอยู่ภายใต้ access control กับ audit trail เรียบร้อย

## ภาพรวม Architecture

![AI Platform Architecture](/blog/ai-platform.jpg)

ง่ายๆ คือทุกอย่างวิ่งผ่าน AgentGateway หมด ไม่ว่าจะเป็น LLM หรือ MCP tools อะไรก็ตาม ส่วน ZITADEL คอยดูว่าใครมีสิทธิ์ใช้อะไร

## ZITADEL — ต่อ SSO องค์กร + จัดการ Role

ก่อนจะใช้อะไรได้ ทุกคนต้อง login ก่อน ตรงนี้ ZITADEL เป็น OIDC provider ที่เอาไปต่อกับ SSO ที่องค์กรมีอยู่แล้วได้ ไม่ว่าจะ Active Directory, Google Workspace หรืออะไรก็ตาม

ส่วนที่สำคัญคือ **role management** — กำหนดได้เลยว่า:

- ทีม Engineering เข้าถึงได้ทุก model + ทุก MCP tool
- ทีม Marketing ใช้ได้แค่ chat กับ knowledge base
- ทีม Finance เข้าถึง RAGFlow ได้เฉพาะเอกสารการเงิน
- Machine users สำหรับพวก automation ต่างๆ

```yaml title="zitadel-values.yaml"
zitadel:
  masterkey: "your-32-char-master-key"
  configmapConfig:
    ExternalSecure: true
    ExternalDomain: auth.internal.company.com
    ExternalPort: 443
    Database:
      Postgres:
        Host: postgres-cluster.db.svc
        Port: 5432
        Database: zitadel
```

:::tip
ZITADEL ต่อกับ SSO ที่มีอยู่แล้ว — พนักงาน login ด้วย account เดิมได้เลย ไม่ต้องสร้างใหม่ แล้ว role ที่กำหนดไว้จะถูกส่งต่อไปให้ AgentGateway เอาไป enforce policy
:::

## AgentGateway — MCP Gateway + Policy Engine

ตัวนี้คือหัวใจของระบบเลย AgentGateway นั่งอยู่ตรงกลาง รับ OIDC token จาก ZITADEL แล้วดูว่า user คนนี้มี role อะไร ใช้อะไรได้บ้าง

### Internal MCP Catalog

ไอเดียคือเปิด AgentGateway เป็น **internal MCP catalog** — ให้พนักงานหรือ agent มา shopping เลือกใช้ MCP tools ที่องค์กรเตรียมไว้ได้เลย:

- **LLM APIs** — GPT-4o, Claude, Ollama (local model)
- **RAGFlow** — ถามตอบจากเอกสารองค์กร (แต่ละ collection เป็น MCP tool แยกกัน)
- **Internal APIs** — ระบบ HR, ระบบบัญชี, ระบบ ticket ที่ wrap เป็น MCP tool
- **Custom tools** — ทีม dev สร้าง MCP tool ใหม่แล้ว register เข้า catalog ได้

ข้อดีคือทุกอย่างเป็น **standard MCP protocol** — ไม่ว่าจะเรียกจาก LibreChat, Dify, Claude Desktop หรือ custom agent ก็ใช้ endpoint เดียวกันหมด

### Policy-based Access Control

AgentGateway อ่าน role จาก OIDC token แล้ว enforce policy:

```yaml title="agentgateway-config.yaml"
listeners:
  - name: main
    protocol: http
    address: 0.0.0.0:8080
    routes:
      - path: /v1/chat/completions
        target:
          provider: openai
          model: gpt-4o
        fallback:
          provider: anthropic
          model: claude-sonnet-4-20250514
```

- **Access control** — role A ใช้ได้ tool X, Y แต่ไม่ได้ tool Z
- **Rate limiting & budget** — แต่ละทีมมี quota กันไม่ให้เผา budget หมด
- **Audit trail** — ทุก request ถูกบันทึกหมด ใคร ใช้อะไร เมื่อไหร่ กี่ token
- **Fallback chains** — provider ไหนล่ม ก็ route ไปอีกตัวอัตโนมัติ

:::important
AgentGateway ไม่ได้แค่ proxy LLM requests นะ — มันเป็น **MCP Gateway** ที่ทำให้ทุก tool ในองค์กรถูก govern ด้วย policy ชุดเดียวกัน ทุก request มี audit trail หมด
:::

## RAGFlow — Knowledge Base แบบ MCP

RAGFlow ไม่ได้เป็นแค่ RAG engine ธรรมดา ในสถาปัตยกรรมนี้มันเป็น **MCP tool** ที่ AI หรือ agent เรียกใช้ได้ผ่าน catalog

ที่เจ๋งคือ RAGFlow รองรับ MCP server แบบ native เลย — และสามารถแยก collection แต่ละอันเป็น **MCP tool คนละตัว** ได้ เช่น:

- `ragflow-hr` → เข้าถึงได้เฉพาะเอกสาร HR (policy, สวัสดิการ, วันลา)
- `ragflow-tech` → เอกสาร technical (architecture, runbook, API spec)
- `ragflow-legal` → สัญญาและข้อกำหนดต่างๆ

แต่ละ MCP tool ใช้ API key คนละตัว scope ไปที่ dataset เฉพาะ แล้ว AgentGateway ก็คุมอีกชั้นว่า role ไหนเข้าถึง tool ไหนได้ — เท่ากับ access control สองชั้นเลย

RAGFlow จัดการ pipeline ให้ทั้งหมด:

1. **Document ingestion** — PDF, DOCX, Excel, รูปภาพผ่าน OCR
2. **Smart chunking** — parse ตาม structure ของเอกสาร เข้าใจ table, header, hierarchy
3. **Hybrid search** — ผสม vector similarity กับ keyword matching
4. **Citation tracking** — ทุกคำตอบอ้างอิงกลับไปที่ต้นทาง

พนักงานถามเรื่อง policy ก็ได้คำตอบจากเอกสาร HR จริงๆ ไม่ใช่ LLM มโนเอง

## Dify — AI Automation สำหรับทีมต่างๆ

Dify คือ layer ที่ให้ทีม non-technical สร้าง AI workflow ได้เอง ไม่ต้องรอ dev:

- **Chatbot** พร้อม custom system prompt + knowledge base จาก RAGFlow
- **Agent workflow** ที่ chain MCP tools หลายตัวเข้าด้วยกัน
- **API endpoints** — ทุก workflow กลายเป็น API อัตโนมัติ
- **Prompt management** — version control สำหรับ prompts

HR อยากได้ bot ตอบคำถาม policy? สร้างใน Dify ได้เลย มันจะไปเรียก RAGFlow ผ่าน AgentGateway ให้เอง Finance อยากได้ตัว parse invoice? ก็ลาก workflow ต่อ MCP tools ได้เลย ไม่ต้องส่ง ticket มาให้ dev

## LibreChat — Chat UI สำหรับคนทั่วไป

สำหรับพนักงานที่แค่อยากคุยกับ AI เฉยๆ — LibreChat ให้ UX แบบ ChatGPT เป๊ะ แต่ข้างหลังวิ่งผ่าน AgentGateway ทั้งหมด:

- **Multi-model** — เลือกใช้ GPT-4, Claude, local model ได้ (ตาม role ที่มีสิทธิ์)
- **MCP tools** — เรียกใช้ tools จาก catalog ได้ในหน้า chat เลย
- **Conversation history** — เก็บบน server ขององค์กร ไม่ได้ไปอยู่ที่ OpenAI
- **OIDC login** — กดปุ่มเดียว login ด้วย account องค์กรที่มีอยู่แล้ว

## Stack ทั้งหมด

| Component | Tool | หน้าที่ |
|-----------|------|---------|
| SSO + Role Management | ZITADEL | ต่อ company IdP, จัดการ role, ออก OIDC token |
| MCP Gateway | AgentGateway | Policy engine, access control, audit trail, rate limit, MCP catalog |
| Knowledge Base (MCP) | RAGFlow | Document ingestion, RAG pipeline, แต่ละ collection เป็น MCP tool แยก |
| AI Workflow | Dify | Low-code AI automation, ต่อ MCP tools ผ่าน AgentGateway |
| Chat UI | LibreChat | Chat interface สำหรับ end user |

ทุกอย่างรันบน Kubernetes — Helm charts, Traefik ingress, ArgoCD sync จาก git

## สิ่งที่ต้องระวัง

**ลง auth ก่อนเสมอ** — ZITADEL ต้องต่อกับ company SSO ให้เสร็จก่อน ทุกอย่าง integrate ตั้งแต่วันแรก ถ้ามาเพิ่มทีหลังจะปวดหัวมาก

**เขียน policy ให้ชัดก่อนเปิดใช้** — กำหนดให้ชัดว่า role ไหนใช้ tool อะไรได้ rate limit เท่าไหร่ เรื่อง budget alert สำคัญมาก dev เขียน loop ลืมปิดนี่เผา $500 ในชั่วโมงเดียวได้ เห็นคนโดนกันเยอะ

**Audit trail สำคัญกว่าที่คิด** — เวลาผู้บริหารถามว่า "ใครใช้ AI ทำอะไรบ้าง ใช้เท่าไหร่" ถ้ามี log พร้อมตอบได้เลย ไม่มีก็จบ

**MCP catalog ค่อยๆ เพิ่ม** — เริ่มจาก LLM APIs กับ RAGFlow ก่อน แล้วค่อยเพิ่ม internal tools เข้า catalog ทีม dev สร้าง MCP tool ใหม่? ก็แค่ register เข้า AgentGateway ไม่ต้องตั้ง infra ใหม่

**เริ่มจาก LibreChat ก่อน** — อย่ารีบเปิด Dify ให้ทุกคน เริ่มจาก chat ง่ายๆ ให้คนคุ้นกับ AI ก่อน แล้วค่อยเปิด feature เพิ่มทีหลัง

:::caution
Self-host LLM ด้วย Ollama ฟังดูดี แต่ต้องมี GPU infrastructure จริงจัง ใน POC นี้ผมเริ่มจาก API providers ผ่าน AgentGateway ก่อน แล้วค่อยเพิ่ม local model ตอนที่ validate use case แล้วและ justify ค่า hardware ได้
:::

## สรุป

แกนหลักคือ **ZITADEL + AgentGateway**:

- **ZITADEL** ต่อ SSO องค์กร จัดการ role → กำหนดว่าใครใช้อะไรได้
- **AgentGateway** เป็น MCP Gateway + policy engine → enforce สิทธิ์ + audit ทุก request

ที่เหลือเป็น **MCP catalog** ที่ถอดเปลี่ยนได้หมด:
- อยากเพิ่ม knowledge base? เพิ่ม RAGFlow เข้า catalog
- อยากให้ทีม non-tech สร้าง workflow? เพิ่ม Dify
- อยาก wrap internal API เป็น MCP tool? ทีม dev register ได้เลย
- อยากเปลี่ยน LibreChat เป็น Open WebUI? แก้ deployment เดียว

ถ้าจะเริ่ม เริ่มจากแค่ 3 ตัว: **ZITADEL + AgentGateway + LibreChat** — แค่นี้ได้ SSO, access control, audit trail, multi-model chat ครบ แล้วค่อยเพิ่ม RAGFlow กับ Dify ตอนที่มี demand

::github{repo="zitadel/zitadel"}

::github{repo="agentgateway/agentgateway"}

::github{repo="infiniflow/ragflow"}

::github{repo="langgenius/dify"}

::github{repo="danny-avila/LibreChat"}
