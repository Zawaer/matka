-- Rebuild visits and trips once: the detector no longer lets a stay's end
-- run past the next stay's start (overlapping visits).
UPDATE processing_state SET dirty_from = '-infinity';
