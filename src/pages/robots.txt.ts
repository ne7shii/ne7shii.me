import type { APIRoute } from 'astro'

// AI crawlers and assistant user-agents we explicitly welcome. The content is
// freely shared, so we opt these in by name (rather than relying on the
// wildcard) to make the policy intentional and easy to adjust later.
const aiAgents = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-User',
  'anthropic-ai',
  'PerplexityBot',
  'Perplexity-User',
  'Google-Extended',
  'Applebot-Extended',
  'CCBot',
  'Bytespider',
  'Amazonbot',
  'Meta-ExternalAgent',
  'cohere-ai',
]

const getRobotsTxt = (sitemapURL: URL, llmsURL: URL) => `\
User-agent: *
Allow: /

${aiAgents.map((ua) => `User-agent: ${ua}\nAllow: /`).join('\n\n')}

Sitemap: ${sitemapURL.href}

# LLM-friendly content index: ${llmsURL.href}
`

export const GET: APIRoute = ({ site }) => {
  const sitemapURL = new URL('sitemap-index.xml', site)
  const llmsURL = new URL('llms.txt', site)
  return new Response(getRobotsTxt(sitemapURL, llmsURL))
}
