# ne7shii.me

Terminal-inspired personal blog built with **Astro** (MultiTerm theme). Posts are
technical articles **written in Thai** on platform engineering, Kubernetes, DevOps,
and applied AI. UI chrome is English; article content is Thai.

## Key paths

- `src/site.config.ts` — site-wide config (title, author, nav, themes, social links).
- `src/layouts/Layout.astro` — the single source of truth for `<head>`: meta tags,
  Open Graph, Twitter cards, and JSON-LD structured data.
- `src/content/posts/*.md(x)` — posts. Frontmatter schema in `src/content.config.ts`.
- `src/pages/` — routes, including the SEO/agent endpoints below.

## Build & verify

- `npm run dev` — local dev (search/llms endpoints behave; Pagefind only in prod).
- `npm run build` — production build (`postbuild` runs Pagefind indexing).
- `npm run preview` — serve `dist/` to inspect the real output.

## SEO & AI-agent conventions — keep these intact

The site is tuned for both search engines and LLM/AI agents. When changing pages,
content, or metadata, preserve the following. **Re-check this list whenever you add a
page type, change the post schema, or touch `Layout.astro`.**

### Language

- Content language is **Thai** → `Layout.astro` sets `<html lang="th">` and
  `og:locale="th_TH"` via the `siteLang` / `ogLocale` constants, and JSON-LD uses
  `inLanguage: "th"`. If the content language ever changes, update those constants.

### Per-page metadata (`Layout.astro`)

Every page must keep emitting: `title`, `description`, `canonical`, `og:*`
(including `og:site_name`, `og:locale`, `og:image:alt`), `twitter:*` (incl.
`twitter:image:alt`), and JSON-LD. New page types should pass appropriate props so
these stay populated — don't let a new route render with only the site defaults.

### Structured data (JSON-LD)

- `WebSite` + `BreadcrumbList` on every page; `ProfilePage` (author `Person` with
  `sameAs` from `socialLinks`) on the home page; `BlogPosting` on posts.
- `BlogPosting` must include `inLanguage`, `keywords` (tags), `mainEntityOfPage`,
  `datePublished`, `dateModified`, an `Organization` `publisher` (with `logo`), and a
  `Person` `author`. The shared `personEntity` / `publisherEntity` objects drive this.

### Post frontmatter (drives SEO automatically)

- Always set `title`, `published`, and a `description` (good descriptions feed meta
  tags, RSS, JSON-LD, and `llms.txt`). Add relevant `tags`.
- Set `updated:` when meaningfully revising a post — it drives `dateModified`,
  `article:modified_time`, and the sitemap `<lastmod>`.

### Sitemap

- `astro.config.mjs` reads post frontmatter into `postLastmod` and injects accurate
  `<lastmod>` via the sitemap `serialize` hook. If post file naming or location
  changes, update that reader.

### AI-agent endpoints

- `src/pages/llms.txt.ts` → `/llms.txt`: curated index (title, date, description,
  URL) of all posts per the llmstxt.org convention.
- `src/pages/llms-full.txt.ts` → `/llms-full.txt`: full markdown of every post.
- `src/pages/robots.txt.ts` → `/robots.txt`: allows all crawlers, explicitly opts in
  named AI agents (GPTBot, ClaudeBot, PerplexityBot, Google-Extended, …), and points
  to the sitemap + `llms.txt`.
- These regenerate from the posts collection automatically — **no per-post action
  needed**. Only touch them if the post schema or desired output format changes.

### RSS

- `src/pages/rss.xml.ts` emits full post content. Keep `description`/`title` accurate.

## Activity logging

Per the user's global instructions, notable completions are logged to the Life OS
activity log under the `ne7shii.me` project name.
