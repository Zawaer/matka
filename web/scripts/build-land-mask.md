# Rebuilding data/land-mask.bin

The land/water mask behind ferry detection (`src/lib/water.ts`) is a 1-bit raster of
OpenStreetMap's land polygons for 9–32°E, 53–71°N at 0.004° × 0.002° (~220 m), about
270 KB compressed. Rebuild it when the coverage should change (needs GDAL, Python 3,
NumPy, and ~3 GB of scratch space):

```bash
curl -O https://osmdata.openstreetmap.de/download/land-polygons-split-4326.zip
python3 -m zipfile -e land-polygons-split-4326.zip .
ogr2ogr -spat 9 53 32 71 -f GPKG baltic.gpkg land-polygons-split-4326/land_polygons.shp
gdal_rasterize -burn 1 -init 0 -te 9 53 32 71 -tr 0.004 0.002 -ot Byte -of ENVI \
  -l land_polygons baltic.gpkg mask.bin
python3 scripts/pack-land-mask.py mask.bin data/land-mask.bin
```

If you change the extent or resolution, update `W, H` and the metadata in
`pack-land-mask.py` to match. Data © OpenStreetMap contributors, ODbL.
