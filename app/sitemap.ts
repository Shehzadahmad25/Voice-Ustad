import type { MetadataRoute } from 'next'

const BASE_URL = 'https://www.voiceustad.pk'

/**
 * XML sitemap for search engines (served at /sitemap.xml).
 * Public, non-authenticated pages only — authenticated app pages
 * (/chat, /dashboard, /quiz, /settings, /profile) are deliberately
 * excluded and disallowed in robots.ts.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  return [
    {
      url: `${BASE_URL}/`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${BASE_URL}/pricing`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/privacy`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.3,
    },
    {
      url: `${BASE_URL}/terms`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.3,
    },
  ]
}
