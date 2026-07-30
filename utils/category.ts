import type { Domain } from '@/utils/types';

export type Category = 'Social' | 'Work' | 'News' | 'Other';

export const CATEGORY_COLORS: Record<Category, string> = {
  Social: 'var(--color-category-social)',
  Work: 'var(--color-category-work)',
  News: 'var(--color-category-news)',
  Other: 'var(--color-category-other)',
};

// A small, best-effort static lookup for the Summary tab's category breakdown. This is
// display-only — it never touches the stored DailyUsage/UsageStore schema, so it can be edited,
// expanded, or swapped for something smarter without a migration.
const CATEGORY_BY_DOMAIN: Record<string, Category> = {
  'facebook.com': 'Social',
  'instagram.com': 'Social',
  'x.com': 'Social',
  'twitter.com': 'Social',
  'reddit.com': 'Social',
  'tiktok.com': 'Social',
  'linkedin.com': 'Social',
  'threads.net': 'Social',
  'snapchat.com': 'Social',
  'pinterest.com': 'Social',

  'github.com': 'Work',
  'gitlab.com': 'Work',
  'figma.com': 'Work',
  'notion.so': 'Work',
  'slack.com': 'Work',
  'atlassian.net': 'Work',
  'jira.com': 'Work',
  'docs.google.com': 'Work',
  'drive.google.com': 'Work',
  'calendar.google.com': 'Work',
  'mail.google.com': 'Work',
  'outlook.com': 'Work',
  'notion.site': 'Work',
  'linear.app': 'Work',
  'asana.com': 'Work',
  'trello.com': 'Work',

  'nytimes.com': 'News',
  'bbc.com': 'News',
  'cnn.com': 'News',
  'theguardian.com': 'News',
  'news.ycombinator.com': 'News',
  'bloomberg.com': 'News',
  'reuters.com': 'News',
};

export function categoryFor(domain: Domain): Category {
  return CATEGORY_BY_DOMAIN[domain] ?? 'Other';
}
