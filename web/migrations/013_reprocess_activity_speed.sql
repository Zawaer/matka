-- Rebuild visits and trips once: the phone's walking/running/cycling label no
-- longer overrules a move's average speed (a 25 km/h metro ride with densely
-- sampled walks at either end was shown as a 12 km walk).
UPDATE processing_state SET dirty_from = '-infinity';
