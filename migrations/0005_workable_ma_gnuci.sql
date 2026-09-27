ALTER TABLE `song` ADD `isPublic` integer DEFAULT false NOT NULL;
--> statement-breakpoint
UPDATE `song` SET `isPublic` = 1 WHERE EXISTS (
  SELECT 1 FROM `audio_file` a WHERE a.`songId` = `song`.`id`
  AND a.`provider` = 'supabase' AND a.`status` = 'ready' AND a.`contentType` = 'audio/mpeg'
);
--> statement-breakpoint
UPDATE `search_doc` SET `isPublic` = 1 WHERE `kind` = 'song'
  AND `refId` IN (SELECT `id` FROM `song` WHERE `isPublic` = 1);
--> statement-breakpoint
UPDATE `search_doc` SET `isPublic` = 1 WHERE `kind` = 'artist'
  AND EXISTS (SELECT 1 FROM `song_artist` sa JOIN `song` s ON s.`id` = sa.`songId`
    WHERE sa.`artistId` = `search_doc`.`refId` AND s.`isPublic` = 1);
