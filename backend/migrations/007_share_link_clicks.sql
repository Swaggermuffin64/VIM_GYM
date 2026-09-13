-- 007: click counter for daily share links.
--
-- Incremented by the backend (db/daily.ts incrementShareLinkClicks) when a
-- non-crawler request resolves GET /s/:slug, so it approximates human clicks
-- on the link rather than chat-app unfurl fetches.

BEGIN;

ALTER TABLE daily_share_links
  ADD COLUMN IF NOT EXISTS click_count INTEGER NOT NULL DEFAULT 0;

COMMIT;
