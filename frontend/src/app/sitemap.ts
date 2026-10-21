import { MetadataRoute } from "next";
import { BLOG_POSTS } from "@/lib/blogs";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://labelcropper.in";
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: `${baseUrl}/crop-labels`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.95,
    },
    {
      url: `${baseUrl}/meesho`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.95,
    },
    {
      url: `${baseUrl}/flipkart`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.85,
    },
    {
      url: `${baseUrl}/amazon`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.85,
    },
    {
      url: `${baseUrl}/myntra`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.75,
    },
    {
      url: `${baseUrl}/snapdeal`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.75,
    },
    {
      url: `${baseUrl}/blogs`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/how-it-works`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/features`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${baseUrl}/about`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${baseUrl}/contact`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${baseUrl}/privacy-policy`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${baseUrl}/terms-of-service`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.5,
    },
  ];

  const blogRoutes: MetadataRoute.Sitemap = BLOG_POSTS.map((post) => ({
    url: `${baseUrl}/blogs/${post.slug}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.85,
  }));

  return [...staticRoutes, ...blogRoutes];
}
