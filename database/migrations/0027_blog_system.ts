import { sql } from "drizzle-orm";

/**
 * Migration 0027: Educational Blog System.
 *
 * Adds tables for the AVANA public and admin blog system:
 * - `blog_categories`: Blog taxonomy categories (Pharmacology, Pharmacy, Exam Tips, etc.)
 * - `blog_tags`: Topic tags for cross-cutting article categorization
 * - `blog_posts`: Full articles with status ('draft' | 'published'), SEO metadata, reading time, view count
 * - `blog_post_tags`: Many-to-many relationship between posts and tags
 *
 * Creates indexes for performance on slug lookups, status/published_at sorting, and category filters.
 *
 * Safe and fully idempotent.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function up(db: any) {
  await db.execute(sql`
    -- 1. Create blog_categories table
    CREATE TABLE IF NOT EXISTS blog_categories (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) NOT NULL,
      slug VARCHAR(100) NOT NULL UNIQUE,
      description TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_blog_categories_slug ON blog_categories(slug);
    CREATE INDEX IF NOT EXISTS idx_blog_categories_sort ON blog_categories(sort_order, name);

    -- 2. Create blog_tags table
    CREATE TABLE IF NOT EXISTS blog_tags (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(100) NOT NULL UNIQUE,
      slug VARCHAR(100) NOT NULL UNIQUE,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_blog_tags_slug ON blog_tags(slug);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_blog_tags_name ON blog_tags(name);

    -- 3. Create blog_posts table
    CREATE TABLE IF NOT EXISTS blog_posts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title VARCHAR(500) NOT NULL,
      slug VARCHAR(255) NOT NULL UNIQUE,
      excerpt TEXT,
      content TEXT NOT NULL,
      featured_image TEXT,
      status VARCHAR(30) NOT NULL DEFAULT 'draft',
      author_id UUID REFERENCES users(id) ON DELETE SET NULL,
      category_id UUID REFERENCES blog_categories(id) ON DELETE SET NULL,
      view_count INTEGER NOT NULL DEFAULT 0,
      reading_time_minutes INTEGER NOT NULL DEFAULT 5,
      seo_title VARCHAR(255),
      seo_description TEXT,
      canonical_url VARCHAR(500),
      published_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_blog_posts_slug ON blog_posts(slug);
    CREATE INDEX IF NOT EXISTS idx_blog_posts_status_published ON blog_posts(status, published_at DESC);
    CREATE INDEX IF NOT EXISTS idx_blog_posts_category_status ON blog_posts(category_id, status);
    CREATE INDEX IF NOT EXISTS idx_blog_posts_author ON blog_posts(author_id);
    CREATE INDEX IF NOT EXISTS idx_blog_posts_created ON blog_posts(created_at DESC);

    -- 4. Create blog_post_tags table
    CREATE TABLE IF NOT EXISTS blog_post_tags (
      post_id UUID NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
      tag_id UUID NOT NULL REFERENCES blog_tags(id) ON DELETE CASCADE,
      PRIMARY KEY (post_id, tag_id)
    );

    CREATE INDEX IF NOT EXISTS idx_blog_post_tags_tag ON blog_post_tags(tag_id);
    CREATE INDEX IF NOT EXISTS idx_blog_post_tags_post ON blog_post_tags(post_id);
  `);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function down(db: any) {
  await db.execute(sql`
    DROP TABLE IF EXISTS blog_post_tags CASCADE;
    DROP TABLE IF EXISTS blog_posts CASCADE;
    DROP TABLE IF EXISTS blog_tags CASCADE;
    DROP TABLE IF EXISTS blog_categories CASCADE;
  `);
}
