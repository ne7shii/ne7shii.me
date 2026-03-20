---
title: 'เปรียบเทียบ OIDC Open Source — จาก ZITADEL สู่ Keycloak'
published: 2026-03-20
draft: false
description: 'เปรียบเทียบ ZITADEL, Keycloak, Authentik, Casdoor, Ory Hydra — สุดท้ายเลือก Keycloak เพราะ config ด้วย YAML ได้ เหมาะกับ AI และ automation ที่สุด'
tags: ['oidc', 'keycloak', 'platform-engineering', 'open-source', 'kubernetes']
toc: true
---

:::ne7shii
โพสต์ก่อนหน้าผมแนะนำ ZITADEL เป็น OIDC provider — แต่พอลง config จริงๆ ถึงรู้ว่า... มันเจ็บปวดมาก ทุกอย่างต้องผ่าน API กับ script หมดเลย declarative config ไม่มี ถ้าจะให้ AI หรือ automation มาช่วย setup ก็ทำได้ยาก สุดท้ายต้องกลับมา research ใหม่ทั้งหมด
:::

## ทำไมต้องเปลี่ยนจาก ZITADEL

ZITADEL เป็น OIDC provider ที่ UX ดีมาก UI สวย API ครบ แต่ปัญหาคือ **ทุกอย่างต้อง config ผ่าน API หรือ script เท่านั้น**

พอลองใช้จริง เจอว่า:

- ไม่มี declarative YAML/JSON config — สร้าง realm, client, role ต้องเขียน script เรียก API ทีละ step
- Terraform provider มีแต่ยังไม่ครบ feature และ maintain ไม่ค่อยทัน
- ให้ AI ช่วย generate config ก็ยาก เพราะต้องเข้าใจ flow ของ API calls ไม่ใช่แค่เขียน YAML แล้วจบ
- reproduce environment ใหม่ต้อง run script ใหม่ทุกครั้ง ไม่ได้แค่ apply config file

:::important
ถ้าทำ platform engineering และต้องการ GitOps workflow — config ที่เป็น declarative file สำคัญมาก เพราะ review ได้, version control ได้, AI generate ได้, reproduce ได้
:::

## ตารางเปรียบเทียบ 5 ตัวเลือก

| | ZITADEL | Keycloak | Authentik | Casdoor | Ory Hydra |
|---|---|---|---|---|---|
| **วิธี Config** | API/Script only | YAML realm import/export | YAML blueprints | Web UI + API | YAML + CLI |
| **CNCF Status** | ไม่ | Graduated :rocket: | ไม่ | ไม่ | Incubating |
| **Reverse Proxy** | ไม่มี built-in | oidc-proxy | Outpost (built-in) | ไม่มี built-in | Oathkeeper |
| **User/Role Mapping** | Projects + Roles | Realm roles, Client roles, Group mapping | Groups + Roles | Organizations + Roles | ต้อง DIY |
| **Kubernetes** | Helm chart | Helm + Operator | Helm chart | Helm chart | Helm chart |
| **Community** | เล็ก | ใหญ่มาก | กลาง | เล็ก | กลาง |
| **Language** | Go | Java (Quarkus) | Python (Django) | Go | Go |
| **License** | Apache 2.0 | Apache 2.0 | MIT (แต่มี Enterprise) | Apache 2.0 | Apache 2.0 |

## แต่ละตัวสั้นๆ

### ZITADEL — UX ดี แต่ script-only config

ZITADEL ออกแบบมาดี UX สวย API เป็น gRPC + REST ครบ ระบบ project-based role management ทำได้ละเอียด แต่ปัญหาเดียวที่ทำให้ต้องเปลี่ยนคือ **ไม่มี declarative config** — ทุกอย่างต้องเขียน script เรียก API ทีละ step

ถ้าทีมไม่ได้เน้น automation หรือ AI-assisted config ก็ใช้ได้ดีมากนะ UI มันดีจริงๆ

### Keycloak — YAML config, CNCF, ecosystem ใหญ่

Keycloak เป็น battle-tested มานานมาก เป็น **CNCF Graduated** project มี ecosystem ที่ใหญ่ที่สุดในกลุ่มนี้

จุดแข็งที่สุดสำหรับ automation คือ **realm export/import เป็น YAML/JSON** — สร้าง realm, client, role, group mapping ทั้งหมดเป็นไฟล์เดียว apply ได้เลย

Built-in user role mapping ครบ:

- **Realm roles** — role กลางที่ใช้ข้ามทุก client
- **Client roles** — role เฉพาะแต่ละ application
- **Group mapping** — map group จาก LDAP/AD มาเป็น role อัตโนมัติ
- **Protocol mappers** — ใส่ custom claims เข้า token ได้ตามต้องการ

สำหรับ reverse proxy ใช้ **oidc-proxy** (หรือ oauth2-proxy) มาครอบหน้า app ที่ไม่มี OIDC ในตัว — ทำได้เหมือน Authentik outpost

### Authentik — Reverse proxy integration ดีมาก

Authentik เป็นตัวเลือกที่น่าสนใจมาก UI สวยมาก modern มาก จุดเด่นที่สุดคือ **Outpost** — reverse proxy authentication ที่ built-in มาเลย deploy แยก proxy ออกมาครอบหน้า app ที่ไม่มี auth ได้เลย ไม่ต้อง setup oauth2-proxy แยก

Config ใช้ YAML blueprints ได้ แต่ documentation ยังไม่เยอะเท่า Keycloak

:::tip
ถ้าใช้งานหลักคือครอบ app ภายในด้วย SSO — Authentik อาจจะ setup ง่ายกว่า Keycloak เพราะ outpost มัน integrated มาดีมาก
:::

### Casdoor — เรียบง่ายแต่ ecosystem น้อย

Casdoor เป็น Go-based, ใช้ resource น้อย, deploy ง่าย เหมาะกับทีมเล็กๆ ที่ต้องการ OIDC provider แบบ simple ไม่ซับซ้อน

แต่ community ยังเล็ก documentation ยังไม่ครบ enterprise features ก็ยังน้อยกว่าตัวอื่น

### Ory Hydra — Headless, flexible แต่ต้อง DIY เยอะ

Ory Hydra เป็น **CNCF Incubating** project ที่ออกแบบมาแบบ headless — มันทำแค่ OAuth2/OIDC flow เท่านั้น ส่วน user management, login UI, consent UI ต้องทำเอง

config เป็น YAML ได้ดี flexible มาก แต่ต้อง integrate กับ Ory Kratos (identity), Ory Keto (permissions), Ory Oathkeeper (reverse proxy) เองทั้งหมด — เหมาะกับทีมที่ต้องการ control ทุก layer จริงๆ

## ทำไมเลือก Keycloak

สุดท้ายเลือก Keycloak ด้วยเหตุผลหลักๆ คือ:

1. **YAML realm config** — export/import ทั้ง realm เป็นไฟล์เดียว AI generate ได้, Git version control ได้, reproduce environment ได้
2. **CNCF Graduated** — mature, long-term support, enterprise ไว้ใจ
3. **Built-in role mapping ครบ** — realm roles, client roles, group mapping, protocol mappers ทำได้หมดจาก config
4. **oidc-proxy** — ครอบหน้า app ที่ไม่มี OIDC ได้เหมือน Authentik outpost
5. **Community ใหญ่สุด** — หาคำตอบได้ง่าย, plugin ecosystem เยอะ, blog/tutorial ล้นหลาม

:::important
เหตุผลที่สำคัญที่สุดคือ **YAML config** — ในยุคที่ AI ช่วย generate config ได้ การที่ OIDC provider config เป็น declarative file ทำให้ workflow ง่ายขึ้นมาก: บอก AI ว่าต้องการอะไร → AI generate YAML → review → apply จบ
:::

## Authentik เป็นตัวเลือกรอง

ต้องบอกว่า Authentik เป็นตัวเลือกที่แข็งมาก ถ้าไม่ได้เลือก Keycloak ก็จะใช้ Authentik แน่นอน

จุดที่ Authentik เด่นกว่า:
- **Outpost** integrated มาดีกว่า ไม่ต้อง setup proxy แยก
- **UI/UX** สวยกว่า modern กว่า
- **Python-based** — customize ง่ายกว่าสำหรับทีมที่ถนัด Python

แต่ Keycloak ชนะตรงที่:
- CNCF Graduated vs ไม่มี CNCF status
- YAML realm config ครบกว่า
- Community ใหญ่กว่ามาก
- oidc-proxy ทดแทน outpost ได้

## ตัวอย่าง Keycloak Realm Config

```yaml title="keycloak-realm.yaml"
realm: internal-platform
enabled: true
sslRequired: external
registrationAllowed: false

# Identity Provider — ต่อ SSO ขององค์กร
identityProviders:
  - alias: corporate-sso
    providerId: oidc
    enabled: true
    config:
      authorizationUrl: https://sso.company.com/authorize
      tokenUrl: https://sso.company.com/token
      clientId: keycloak-client
      clientSecret: "${CORPORATE_SSO_SECRET}"

# Client สำหรับ AgentGateway
clients:
  - clientId: agentgateway
    enabled: true
    protocol: openid-connect
    publicClient: false
    secret: "${AGENTGATEWAY_SECRET}"
    redirectUris:
      - "https://gateway.internal.company.com/*"
    defaultClientScopes:
      - profile
      - email
      - roles

# Realm Roles
roles:
  realm:
    - name: ai-admin
      description: "Full access to all AI tools and models"
    - name: ai-user
      description: "Basic access to chat and knowledge base"
    - name: ai-developer
      description: "Access to all models + MCP tools"

# Groups — map จาก corporate LDAP/AD
groups:
  - name: engineering
    realmRoles:
      - ai-developer
  - name: marketing
    realmRoles:
      - ai-user
  - name: platform-team
    realmRoles:
      - ai-admin
```

ไฟล์เดียว ได้ทั้ง SSO integration, client config, roles, group mapping — เอาไปใส่ Git, ให้ AI generate, ให้ ArgoCD sync ได้หมด

## อัพเดทคำแนะนำ

จาก[โพสต์ก่อนหน้า](/posts/building-internal-ai-platform-with-open-source)ที่แนะนำ ZITADEL — ตอนนี้ขอเปลี่ยนเป็น **Keycloak** ครับ

stack ที่แนะนำตอนนี้:

| Component | เดิม | ใหม่ | เหตุผล |
|---|---|---|---|
| OIDC Provider | ZITADEL | **Keycloak** | YAML config, CNCF Graduated, ecosystem ใหญ่กว่า |
| MCP Gateway | AgentGateway | AgentGateway | ไม่เปลี่ยน — ยังดีที่สุด |
| Knowledge Base | RAGFlow | RAGFlow | ไม่เปลี่ยน |
| AI Workflow | Dify | Dify | ไม่เปลี่ยน |
| Chat UI | LibreChat | LibreChat | ไม่เปลี่ยน |

:::tip
ถ้าจะเริ่ม เริ่มจากแค่ 3 ตัว: **Keycloak + AgentGateway + LibreChat** — แค่นี้ได้ SSO, access control, audit trail, multi-model chat ครบ เหมือนเดิม แค่เปลี่ยนจาก ZITADEL เป็น Keycloak
:::

## สรุป

การเลือก OIDC provider ในยุคนี้ต้องคิดเรื่อง **automation-friendliness** ด้วย — ไม่ใช่แค่ feature เยอะ UI สวย แต่ config ต้อง declarative, version control ได้, AI generate ได้

**Keycloak** ตอบโจทย์นี้ดีที่สุด: YAML realm config ครบ, CNCF Graduated, community ใหญ่, oidc-proxy สำหรับ reverse proxy, built-in role mapping ทำได้ละเอียด

ถ้าต้องการ reverse proxy integration ที่ดีกว่าและ UI สวยกว่า **Authentik** ก็เป็นตัวเลือกที่ดีมาก แต่สำหรับ platform engineering ที่เน้น GitOps + AI-assisted config — Keycloak ยังคงเป็นตัวเลือกที่ดีที่สุดในตอนนี้

::github{repo="keycloak/keycloak"}

::github{repo="goauthentik/authentik"}

::github{repo="zitadel/zitadel"}

::github{repo="casdoor/casdoor"}

::github{repo="ory/hydra"}
