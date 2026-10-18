-- The phone's own motion classification at the time of the fix (Android
-- Activity Recognition / iOS Core Motion), when the device sends one. It is
-- what tells a bike ride from a bus ride at the same speed.
ALTER TABLE points ADD COLUMN activity text
  CHECK (activity IN ('still', 'walking', 'running', 'on_bicycle', 'in_vehicle'));
