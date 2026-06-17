import type { APIRoute } from 'astro'
import siteConfig from '~/site.config'
import { getSortedPosts, dateString } from '~/utils'

// https://llmstxt.org — a curated, LLM-friendly index of the site's content.
export const GET: APIRoute = async ({ site }) => {
  const base = (site?.href ?? siteConfig.site).replace(/\/$/, '')
  const posts = (await getSortedPosts()).reverse() // newest first

  const lines: string[] = [
    `# ${siteConfig.title}`,
    '',
    `> ${siteConfig.description}`,
    '',
    `Author: ${siteConfig.author}. Posts are written in Thai (technical blog on platform engineering, Kubernetes, DevOps, and applied AI).`,
    '',
    '## Posts',
    '',
  ]

  for (const post of posts) {
    const url = `${base}/posts/${post.id}`
    const date = dateString(post.data.published)
    const desc = post.data.description ? `: ${post.data.description}` : ''
    lines.push(`- [${post.data.title}](${url}) (${date})${desc}`)
  }

  lines.push(
    '',
    '## Resources',
    '',
    `- [Full text of all posts](${base}/llms-full.txt)`,
    `- [RSS feed](${base}/rss.xml)`,
    `- [Sitemap](${base}/sitemap-index.xml)`,
    '',
  )

  return new Response(lines.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
