-- Add image/video attachment support to messages.
-- content becomes nullable so a user can send a bare photo/video with no caption.
-- A CHECK enforces that every row has either content or media_url.
-- media_type is constrained to 'image' | 'video' (extensible to 'file' later).

ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_url TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_type VARCHAR(20);
ALTER TABLE messages ALTER COLUMN content DROP NOT NULL;

ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_content_or_media_chk;
ALTER TABLE messages ADD CONSTRAINT messages_content_or_media_chk
  CHECK (content IS NOT NULL OR media_url IS NOT NULL);

ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_media_type_chk;
ALTER TABLE messages ADD CONSTRAINT messages_media_type_chk
  CHECK (media_type IS NULL OR media_type IN ('image','video'));
