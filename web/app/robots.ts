import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/admin/',
          '/api/',
          '/account/',
          '/track/',
          '/devices/',
          '/activate/',
          '/share/',
          '/login/',
          '/register/',
        ],
      },
    ],
    sitemap: 'https://www.roogps.com/sitemap.xml',
    host: 'https://www.roogps.com',
  };
}
