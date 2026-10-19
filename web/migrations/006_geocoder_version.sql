-- Which naming rules (GEOCODER_VERSION in src/lib/processing/geocode.ts) a
-- place's geo_name came from. Places geocoded with older rules (NULL here) are
-- re-geocoded in the background; custom_name is never touched.
ALTER TABLE places ADD COLUMN geocoder_version smallint;
