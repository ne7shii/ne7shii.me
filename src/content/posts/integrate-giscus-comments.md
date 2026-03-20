---
title: 'เพิ่มระบบ Comment ด้วย Giscus — GitHub Discussions บน Astro Blog'
published: 2026-03-21
draft: false
description: 'วิธี integrate Giscus comment system เข้ากับ Astro blog พร้อม theme-aware styling ที่เปลี่ยนสีตาม site theme แบบ real-time'
tags: ['astro', 'giscus', 'github', 'blog', 'open-source']
toc: true
---

:::guy1
บล็อกเรามันเป็น static site ใช่มั้ย? อยากให้คนอ่านมา comment ได้บ้าง ทำยังไงดี?
:::

:::ne7shii
static site ไม่มี backend ก็จริง แต่เราใช้ Giscus ได้ — มันเอา GitHub Discussions มาเป็น comment system ให้เลย ไม่ต้อง host อะไรเอง
:::

:::guy1
GitHub Discussions? คนอ่านต้องมี GitHub account ด้วยเหรอ?
:::

:::ne7shii
ใช่ ต้อง sign in ด้วย GitHub ถึงจะ comment ได้ แต่สำหรับ developer blog มันเหมาะมาก เพราะ target audience ส่วนใหญ่มี GitHub อยู่แล้ว แถมได้ spam protection ฟรีด้วย
:::

## Giscus คืออะไร?

[Giscus](https://giscus.app/) เป็น open-source comment system ที่ใช้ **GitHub Discussions** เป็น backend สำหรับเก็บ comment ทุกอย่างถูกเก็บใน GitHub repo ของเราเอง — searchable, linkable, และเราเป็นเจ้าของข้อมูลทั้งหมด

ข้อดีเมื่อเทียบกับ Disqus หรือ comment system อื่น:

| | Giscus | Disqus |
|---|---|---|
| **Privacy** | ไม่มี tracking, ไม่เก็บ data ของ user | มี tracking, เก็บ data, แสดง ads |
| **ขนาด** | Lightweight, โหลดเร็ว | JS bundle ใหญ่ ทำให้ page ช้า |
| **ราคา** | ฟรี 100% | ฟรีแต่มี ads, ต้องจ่ายถ้าจะเอาออก |
| **Data ownership** | อยู่ใน GitHub repo ของเรา | อยู่ใน Disqus server |
| **Theme** | Custom ได้เต็มที่ด้วย CSS | จำกัด |

สำหรับ developer blog แล้ว Giscus เป็นตัวเลือกที่ลงตัวมาก

## สิ่งที่ต้องเตรียม

ก่อน integrate Giscus เราต้องเตรียมของพวกนี้ให้พร้อม:

1. **Public GitHub repository** — repo ต้องเป็น public เพราะ Giscus ใช้ GitHub API ซึ่งอ่านได้เฉพาะ public repo
2. **เปิด Discussions** — ไปที่ repo Settings → General → Features แล้วติ๊ก ✅ Discussions
3. **สร้าง Category สำหรับ Comments** — เข้า Discussions tab แล้วสร้าง category ใหม่ชื่อ "Comments"
4. **ติดตั้ง Giscus GitHub App** — ไปที่ [github.com/apps/giscus](https://github.com/apps/giscus) แล้ว install ให้ repo ของเรา

:::important
ตอนสร้าง category "Comments" ให้เลือก format เป็น **Announcement** — จะได้มีแค่ Giscus bot กับเจ้าของ repo เท่านั้นที่สร้าง discussion ใหม่ได้ ป้องกันคนมาสร้าง discussion มัวซั่วเอง
:::

## ดึง Config Values จาก Giscus

เข้าไปที่ [giscus.app](https://giscus.app/) แล้วกรอกข้อมูล:

1. ใส่ชื่อ repo เช่น `ne7shii/ne7shii.me`
2. เลือก **Discussion Category** เป็น "Comments"
3. เลือก mapping เป็น `pathname`
4. เลือก features ตามต้องการ (reactions, lazy loading ฯลฯ)

Giscus จะ generate `<script>` tag ให้หน้าตาประมาณนี้:

```html title="Generated script tag"
<script src="https://giscus.app/client.js"
  data-repo="ne7shii/ne7shii.me"
  data-repo-id="R_kgDORo1ibQ"
  data-category="Comments"
  data-category-id="DIC_kwDORo1ibc4C434a"
  data-mapping="pathname"
  data-strict="0"
  data-reactions-enabled="1"
  data-emit-metadata="0"
  data-input-position="top"
  data-theme="preferred_color_scheme"
  data-lang="en"
  crossorigin="anonymous"
  async>
</script>
```

ค่าที่เราต้องเอาไปใช้คือ `data-repo-id`, `data-category`, และ `data-category-id` — ค่าพวกนี้ unique ต่อ repo ของเรา

## Implementation ใน Astro

### Config

เอา config values ที่ได้มาใส่ไว้ใน `site.config.ts` รวมกับ config อื่นของ site:

```typescript title="src/site.config.ts"
giscus: {
  repo: 'ne7shii/ne7shii.me',
  repoId: 'R_kgDORo1ibQ',
  category: 'Comments',
  categoryId: 'DIC_kwDORo1ibc4C434a',
  reactionsEnabled: true,
},
```

### Origin Config

สร้างไฟล์ `giscus.json` ที่ root ของ project เพื่อบอก Giscus ว่า origin ไหนที่อนุญาตให้ใช้:

```json title="giscus.json"
{
  "origins": ["https://ne7shii.me", "http://localhost:4321"]
}
```

:::tip
ใส่ `http://localhost:4321` ไว้ด้วยจะได้ test Giscus ตอน local dev ได้เลย ไม่ต้อง deploy ขึ้นไปดูทุกครั้ง
:::

### GiscusLoader Component

หัวใจของ integration คือ `GiscusLoader.astro` — component นี้ทำหน้าที่โหลด Giscus script แบบ lazy loading และจัดการ theme switching:

```astro title="src/components/GiscusLoader.astro"
---
import siteConfig from '~/site.config'
const origin = Astro.url.origin
const giscusConfig = siteConfig.giscus
if (!giscusConfig) {
  throw new Error('Giscus configuration is missing in site.config.ts')
}
const repo = giscusConfig.repo
const repoId = giscusConfig.repoId
const category = giscusConfig.category
const categoryId = giscusConfig.categoryId
const reactionsEnabled = giscusConfig.reactionsEnabled ? '1' : '0'
---

<div
  class="giscus"
  data-origin={origin}
  data-repo={repo}
  data-repo-id={repoId}
  data-category={category}
  data-category-id={categoryId}
  data-reactions-enabled={reactionsEnabled}
>
</div>
```

ส่วน client-side script จะอ่าน data attributes แล้วสร้าง `<script>` tag ของ Giscus แบบ dynamic:

```javascript title="Client-side script (ใน GiscusLoader.astro)"
function loadGiscus() {
  const giscusDiv = document.querySelector('.giscus')
  const origin = giscusDiv.getAttribute('data-origin')
  const repo = giscusDiv.getAttribute('data-repo')
  const repoId = giscusDiv.getAttribute('data-repo-id')
  const category = giscusDiv.getAttribute('data-category')
  const categoryId = giscusDiv.getAttribute('data-category-id')
  const reactionsEnabled = giscusDiv.getAttribute('data-reactions-enabled')
  const theme = document.documentElement.getAttribute('data-theme')

  const script = document.createElement('script')
  script.src = 'https://giscus.app/client.js'
  script.setAttribute('data-repo', repo)
  script.setAttribute('data-repo-id', repoId)
  script.setAttribute('data-category', category)
  script.setAttribute('data-category-id', categoryId)
  script.setAttribute('data-mapping', 'pathname')
  script.setAttribute('data-strict', '0')
  script.setAttribute('data-reactions-enabled', reactionsEnabled)
  script.setAttribute('data-emit-metadata', '0')
  script.setAttribute('data-input-position', 'top')
  script.setAttribute('data-theme', `${origin}/giscus/${theme}.css`)
  script.setAttribute('data-lang', 'en')
  script.setAttribute('loading', 'lazy')
  script.crossOrigin = 'anonymous'
  script.async = true
  document.body.appendChild(script)
}
```

วิธีนี้ทำให้เราส่ง config จาก server-side (Astro frontmatter) ไปให้ client-side ผ่าน data attributes ได้แบบ clean ไม่ต้อง hardcode ค่าในหลายที่

### แสดงใน Post Page

เพิ่ม component เข้าไปในหน้า post:

```astro title="src/pages/posts/[slug].astro"
{
  siteConfig.giscus && (
    <section>
      <DividerText text="Comments" />
      <GiscusLoader />
    </section>
  )
}
```

ใช้ conditional render `siteConfig.giscus &&` เพื่อให้ปิด comment ได้ง่ายๆ แค่ลบ giscus config ออกจาก `site.config.ts`

## Theme-Aware Styling

ส่วนนี้คือจุดที่น่าสนใจที่สุด — ทำให้ Giscus เปลี่ยน theme ตาม site ของเราแบบ real-time โดยไม่ต้อง reload หน้า

### Custom CSS Endpoint

แทนที่จะใช้ built-in theme ของ Giscus เราสร้าง dynamic CSS endpoint ที่ `/giscus/[theme].css` เพื่อ generate CSS ที่ตรงกับ theme ของ site:

```typescript title="src/pages/giscus/[theme].css.ts"
// Dynamic route ที่ generate CSS ตาม theme name
// เช่น /giscus/catppuccin-mocha.css, /giscus/github-dark.css
// Map สี theme ของ site ไปเป็น CSS variables ที่ Giscus ใช้
```

Endpoint นี้จะ return CSS พร้อม CORS header ที่อนุญาต `https://giscus.app` ให้โหลดได้ — เพราะ Giscus render ใน iframe ที่ origin เป็น giscus.app

### MutationObserver สำหรับ Theme Change

เมื่อ user เปลี่ยน theme บน site เราใช้ **MutationObserver** คอย watch attribute `data-theme` บน `<html>` element:

```javascript title="Theme change listener"
function listenForThemeChange() {
  const observer = new MutationObserver((mutations) => {
    mutations.forEach(async (mutation) => {
      if (
        mutation.type === 'attributes' &&
        mutation.attributeName === 'data-theme'
      ) {
        const newTheme = document.documentElement.getAttribute('data-theme')
        if (newTheme) {
          await updateTheme(newTheme)
        }
      }
    })
  })
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  })
}
```

### PostMessage API อัปเดต Theme

เมื่อจับ theme change ได้ เราใช้ **PostMessage API** ส่ง message ไปให้ Giscus iframe เปลี่ยน theme โดยไม่ต้อง reload:

```javascript title="Update Giscus theme via PostMessage"
async function updateTheme(theme) {
  const giscusFrame = document.querySelector('iframe.giscus-frame')
  if (!giscusFrame) return

  giscusFrame.contentWindow?.postMessage(
    {
      giscus: {
        setConfig: {
          theme: `${origin}/giscus/${theme}.css`,
        },
      },
    },
    'https://giscus.app',
  )
}
```

flow ทั้งหมด:

1. User คลิกเปลี่ยน theme → `data-theme` attribute บน `<html>` เปลี่ยน
2. MutationObserver จับ change ได้ → เรียก `updateTheme()`
3. PostMessage ส่ง URL ของ CSS ใหม่ไปให้ Giscus iframe
4. Giscus โหลด CSS จาก `/giscus/[theme].css` → สีเปลี่ยนทันที

:::caution
Giscus iframe อาจโหลดไม่ทัน ถ้า user เปลี่ยน theme เร็วมาก — ใน implementation จริงมี retry logic รอ iframe โหลดก่อน ถ้าหาไม่เจอจะ retry สูงสุด 3 ครั้ง
:::

## ผลลัพธ์

หลัง integrate เสร็จ ผลที่ได้คือ:

- **Comment box** แสดงอยู่ท้ายทุก blog post พร้อม reactions
- **Theme switching** ทำงานแบบ seamless — เปลี่ยน theme บน site แล้ว Giscus เปลี่ยนสีตามทันที
- **Comment ทุกอัน** ถูกเก็บใน GitHub Discussions ของ repo — เข้าไปดู ตอบ หรือ moderate ได้โดยตรง
- **Lazy loading** ทำให้ไม่กระทบ performance ตอนโหลดหน้า — Giscus script จะโหลดเมื่อ user scroll ลงมาถึง

:::ne7shii
เท่านี้ก็มีระบบ comment บน static blog แล้ว ไม่ต้อง host backend เอง ไม่มี database ให้ดูแล แถมได้ GitHub authentication มาช่วยกรอง spam ด้วย
:::

:::guy1
แล้วถ้าไม่อยาก lock-in กับ GitHub ล่ะ? มี alternative อื่นมั้ย?
:::

:::ne7shii
มีนะ เช่น [utterances](https://utteranc.es/) ที่ใช้ GitHub Issues แทน Discussions หรือจะ self-host แบบ [Commento](https://commento.io/) ก็ได้ แต่สำหรับ developer blog ที่ audience ใช้ GitHub อยู่แล้ว — Giscus เป็นตัวเลือกที่ลงตัวที่สุด ทั้ง feature set, privacy, และ developer experience
:::

::github{repo="giscus/giscus"}
