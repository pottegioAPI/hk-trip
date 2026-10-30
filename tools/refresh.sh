#!/usr/bin/env bash
# Downloads current MTR, Transport Department (GTFS) and OpenStreetMap exit data,
# rebuilds bus.json + the MTR block in hk-trip.html, and only swaps them in if every check passes.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
T="$ROOT/tools"; C="$ROOT/data-cache"; N="$C/new"
rm -rf "$N"; mkdir -p "$N/mtr" "$N/gtfs" "$N/osm"
UA="hk-trip-planner/1.0 (personal trip app)"
curl -fsSL --retry 3 --retry-delay 10 -o "$N/mtr/stations.csv" https://opendata.mtr.com.hk/data/mtr_lines_and_stations.csv
curl -fsSL --retry 3 --retry-delay 10 -o "$N/mtr/fares.csv"    https://opendata.mtr.com.hk/data/mtr_lines_fares.csv
curl -fsSL --retry 3 --retry-delay 10 -o "$N/gtfs/gtfs.zip"    https://static.data.gov.hk/td/pt-headway-en/gtfs.zip
unzip -o -q "$N/gtfs/gtfs.zip" -d "$N/gtfs/x"
# OpenStreetMap exits: try several Overpass servers, else fall back to the last good copy
Q_EXITS='data=[out:json][timeout:120];area["ISO3166-1"="HK"]->.a;node["railway"="subway_entrance"](area.a);out body;'
Q_STATIONS='data=[out:json][timeout:90];nwr["railway"="station"]["station"="subway"](22.15,113.83,22.57,114.44);out center tags;'
osm(){
  for s in https://overpass-api.de/api/interpreter https://overpass.kumi.systems/api/interpreter https://lz4.overpass-api.de/api/interpreter; do
    for i in 1 2; do
      curl -fsS -m 180 -A "$UA" -H "Accept: application/json" -o "$1" --data-urlencode "$2" "$s" && grep -q '"elements"' "$1" && return 0
      sleep 20
    done
  done
  return 1
}
if osm "$N/osm/exits.json" "$Q_EXITS" && osm "$N/osm/stations.json" "$Q_STATIONS"; then
  mkdir -p "$C/last-osm"; cp "$N"/osm/*.json "$C/last-osm/"
elif [ -f "$C/last-osm/exits.json" ]; then
  echo "OSM unavailable - using last good exit data"; cp "$C"/last-osm/*.json "$N/osm/"
else
  echo "OSM unavailable and no saved copy" >&2; exit 1
fi
node "$T/build-mtr.js" "$N/mtr" "$N/mtr-data.js"
node --max-old-space-size=4096 "$T/build-bus.js" "$N/gtfs/x" "$N/bus.json" "$N/mtr-data.js" "$N/osm"
node "$T/check-bus.js" "$N/bus.json"
cp "$ROOT/hk-trip.html" "$N/hk-trip.html"
node "$T/embed-mtr.js" "$N/hk-trip.html" "$N/mtr-data.js"
node "$T/build-places.js" "$C/last-osm" "$N/places.json"
# Hong Kong Observatory 9-day forecast; keep the previous copy if it fails
if curl -fsSL --retry 3 -o "$N/fnd.json" "https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=fnd&lang=en" \
   && node "$T/build-weather.js" "$N/fnd.json" "$N/weather.json"; then cp "$N/weather.json" "$ROOT/weather.json"; else echo "weather unavailable - keeping previous"; fi
# government water dispensers; keep the previous copy if either download fails
mkdir -p "$N/water"
if curl -fsSL --retry 3 -o "$N/water/lcsd.csv" https://www.lcsd.gov.hk/datagovhk/fac-wd/lcsd_wd_en.csv \
   && curl -fsSL --retry 3 -o "$N/water/fehd.csv" https://www.fehd.gov.hk/datagovhk/water_dispenser/english/waterdispenser.csv \
   && node "$T/build-water.js" "$N/water" "$N/water.json"; then cp "$N/water.json" "$ROOT/water.json"; else echo "water data unavailable - keeping previous"; fi
# all checks passed: swap in
cp "$N/bus.json" "$ROOT/bus.json"
cp "$N/places.json" "$ROOT/places.json"
cp "$N/hk-trip.html" "$ROOT/hk-trip.html"
node "$T/build-web.js" "$ROOT"
echo "REFRESH_OK $(date '+%Y-%m-%d %H:%M')"
