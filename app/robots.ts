import type { MetadataRoute } from 'next'

const BASE_URL = 'https://www.voiceustad.pk'

/** robots.txt (served at /robots.txt) — keep crawlers out of the
 *  authenticated app and API; point them at the sitemap. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/chat',
          '/dashboard',
          '/quiz',
          '/settings',
          '/profile',
          '/api/',
        ],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
  }
}
