CREATE VIRTUAL TABLE `search_fts` USING fts5(`text`, tokenize='trigram');
--> statement-breakpoint
INSERT INTO `site_stats` (`id`, `tapeCount`, `publishedTapeCount`, `songCount`, `userCount`, `imageBytes`, `reindexRowsWritten`, `updatedAt`)
VALUES (1, 0, 0, 0, 0, 0, 0, CAST(unixepoch('now') * 1000 AS integer));
--> statement-breakpoint
PRAGMA optimize;
