-- Place search (lib/placeSearch.ts): matka_fold() folds case and accents
-- ("Café" → "cafe") without the unaccent extension, with the same map as
-- fold() in lib/search.ts (search.test.ts keeps the two in step). A trigram
-- index on the folded searchable text makes substring matches fast, when the
-- pg_trgm extension is there (postgis/postgis images ship it); without it,
-- search still works, just without the index.

CREATE OR REPLACE FUNCTION matka_fold(text) RETURNS text
  LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
  RETURN lower(translate($1,
    'ÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝàáâãäåçèéêëìíîïñòóôõöùúûüýÿĀāĂăĄąĆćĈĉĊċČčĎďĒēĔĕĖėĘęĚěĜĝĞğĠġĢģĤĥĨĩĪīĬĭĮįİĴĵĶķĹĺĻļĽľŃńŅņŇňŌōŎŏŐőŔŕŖŗŘřŚśŜŝŞşŠšŢţŤťŨũŪūŬŭŮůŰűŲųŴŵŶŷŸŹźŻżŽžƠơƯưǍǎǏǐǑǒǓǔǕǖǗǘǙǚǛǜǞǟǠǡǦǧǨǩǪǫǬǭǰǴǵǸǹǺǻȀȁȂȃȄȅȆȇȈȉȊȋȌȍȎȏȐȑȒȓȔȕȖȗȘșȚțȞȟȦȧȨȩȪȫȬȭȮȯȰȱȲȳØøĐđŁłĦħŦŧı',
    'AAAAAACEEEEIIIINOOOOOUUUUYaaaaaaceeeeiiiinooooouuuuyyAaAaAaCcCcCcCcDdEeEeEeEeEeGgGgGgGgHhIiIiIiIiIJjKkLlLlLlNnNnNnOoOoOoRrRrRrSsSsSsSsTtTtUuUuUuUuUuUuWwYyYZzZzZzOoUuAaIiOoUuUuUuUuUuAaAaGgKkOoOojGgNnAaAaAaEeEeIiIiOoOoRrRrUuUuSsTtHhAaEeOoOoOoOoYyOoDdLlHhTti'));

-- Everything a place can be found by. Keep in step with SEARCH_TEXT_SQL in
-- lib/placeSearch.ts (the index is only used for the identical expression).
CREATE OR REPLACE FUNCTION matka_place_search_text(p places) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE
  RETURN matka_fold(
    COALESCE(p.custom_name, '') || ' ' || COALESCE(p.geo_name, '') || ' ' ||
    COALESCE(p.geodata->>'street', '') || ' ' || COALESCE(p.kind, '') || ' ' ||
    COALESCE(replace(p.category, '_', ' '), '') || ' ' ||
    COALESCE(p.city, '') || ' ' || COALESCE(p.country, ''));

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
  CREATE INDEX IF NOT EXISTS places_search_trgm_idx ON places
    USING gin (matka_place_search_text(places) gin_trgm_ops);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'place search: no pg_trgm index (%)', SQLERRM;
END
$$;
