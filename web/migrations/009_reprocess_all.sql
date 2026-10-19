-- Rebuild every user's visits and trips once with the new detector
-- (waits at stops, recording gaps, accuracy-weighted stays).
UPDATE processing_state SET dirty_from = '-infinity';
