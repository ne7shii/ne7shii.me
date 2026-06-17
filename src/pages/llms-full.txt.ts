import type { APIRoute } from 'astro'
import siteConfig from '~/site.config'
import { getSortedPosts, dateString } from '~/utils'

// https://llmstxt.org — full markdown source of every post, for LLMs/agents
// that want to ingest the entire site in one request.
export const GET: APIRoute = async ({ site }) => {
  const base = (site?.href ?? siteConfig.site).replace(/\/$/, '')
  const posts = (await getSortedPosts()).reverse() // newest first

  const parts: string[] = [
    `# ${siteConfig.title}`,
    '',
    `> ${siteConfig.description}`,
    '',
    `Author: ${siteConfig.author}. Full text of all posts (written in Thai).`,
    '',
  ]

  for (const post of posts) {
    const url = `${base}/posts/${post.id}`
    parts.push(
      '',
      '---',
      '',
      `# ${post.data.title}`,
      '',
      `Source: ${url}`,
      `Published: ${dateString(post.data.published)}`,
      ...(post.data.updated ? [`Updated: ${dateString(post.data.updated)}`] : []),
      ...(post.data.tags && post.data.tags.length > 0
        ? [`Tags: ${post.data.tags.join(', ')}`]
        : []),
      '',
      post.body ?? '',
    )
  }

  return new Response(parts.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
