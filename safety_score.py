import json
import math
from concurrent.futures import ThreadPoolExecutor
import os
import sys
import time
import urllib.parse
import urllib.request

# External data sources used for live safety scoring (no API key required).
OVERPASS_URL = "https://overpass-api.de/api/interpreter"
WORLDPPOP_STATS_URL = "https://api.worldpop.org/v1/services/stats"
WORLDPOP_TASK_URL = "https://api.worldpop.org/v1/tasks/{task_id}"


def to_float(value, default=0.0):
    try:
        return float(value)
    except Exception:
        return default


def now_iso():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def clamp(value, lower, upper):
    return max(lower, min(upper, value))


def haversine_km(lat1, lon1, lat2, lon2):
    r = 6371.0
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = math.sin(d_lat / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(d_lon / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return r * c


def http_post_text(url, body, timeout=2.8):
    data = body.encode("utf-8")
    request = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read().decode("utf-8")


def http_get_json(url, timeout=2.8):
    request = urllib.request.Request(url, headers={"Accept": "application/json"}, method="GET")
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def extract_element_lat_lng(element):
    if "lat" in element and "lon" in element:
        return to_float(element.get("lat")), to_float(element.get("lon"))

    center = element.get("center")
    if isinstance(center, dict) and "lat" in center and "lon" in center:
        return to_float(center.get("lat")), to_float(center.get("lon"))

    return None, None


def nearest_google_place_distance_km(lat, lon, place_type, radii_meters=(3000, 7000, 15000)):
    # Optional Google Places fallback (requires GOOGLE_MAPS_API_KEY / GOOGLE_PLACES_API_KEY).
    api_key = (os.environ.get("GOOGLE_MAPS_API_KEY") or os.environ.get("GOOGLE_PLACES_API_KEY") or "").strip()
    if not api_key:
        return None

    for radius in radii_meters:
        params = {
            "location": f"{lat},{lon}",
            "radius": str(radius),
            "type": place_type,
            "key": api_key,
        }
        url = "https://maps.googleapis.com/maps/api/place/nearbysearch/json?" + urllib.parse.urlencode(params)

        try:
            payload = http_get_json(url, timeout=2.8)
            results = payload.get("results", [])
            if not results:
                continue

            best_distance = None
            for item in results:
                loc = item.get("geometry", {}).get("location", {})
                p_lat = to_float(loc.get("lat"), default=float("nan"))
                p_lon = to_float(loc.get("lng"), default=float("nan"))
                if not (math.isfinite(p_lat) and math.isfinite(p_lon)):
                    continue

                distance = haversine_km(lat, lon, p_lat, p_lon)
                if best_distance is None or distance < best_distance:
                    best_distance = distance

            if best_distance is not None:
                return round(best_distance, 2)
        except Exception:
            continue

    return None


def nearest_amenity_distance_km(lat, lon, amenity, radii_meters=(4000, 10000)):
    # Primary source: Overpass (OpenStreetMap) for nearby hospitals/police.
    for radius in radii_meters:
        query = f"""
[out:json][timeout:10];
(
  node[\"amenity\"=\"{amenity}\"](around:{radius},{lat},{lon});
  way[\"amenity\"=\"{amenity}\"](around:{radius},{lat},{lon});
  relation[\"amenity\"=\"{amenity}\"](around:{radius},{lat},{lon});
);
out center;
""".strip()

        try:
            body = "data=" + urllib.parse.quote_plus(query)
            payload = json.loads(http_post_text(OVERPASS_URL, body, timeout=2.8))
            elements = payload.get("elements", [])
            if not elements:
                continue

            best_distance = None
            for element in elements:
                e_lat, e_lon = extract_element_lat_lng(element)
                if e_lat is None or e_lon is None:
                    continue

                distance = haversine_km(lat, lon, e_lat, e_lon)
                if best_distance is None or distance < best_distance:
                    best_distance = distance

            if best_distance is not None:
                return round(best_distance, 2)
        except Exception:
            continue

    # Fallback to Google Places if Overpass fails.
    google_type = "police" if amenity == "police" else "hospital"
    return nearest_google_place_distance_km(lat, lon, google_type)


def road_density_count(lat, lon, radius_meters=500):
    query = f"""
[out:json][timeout:10];
way[\"highway\"](around:{radius_meters},{lat},{lon});
out count;
""".strip()

    try:
        body = "data=" + urllib.parse.quote_plus(query)
        payload = json.loads(http_post_text(OVERPASS_URL, body, timeout=2.8))
        count_elem = next((e for e in payload.get("elements", []) if e.get("type") == "count"), None)
        if not count_elem:
            return None

        tags = count_elem.get("tags", {})
        return int(tags.get("total", "0"))
    except Exception:
        return None


def make_square_geojson(lat, lon, half_side_km=0.5):
    lat_delta = half_side_km / 111.32
    lon_delta_den = max(0.1, 111.32 * math.cos(math.radians(lat)))
    lon_delta = half_side_km / lon_delta_den

    return {
        "type": "Polygon",
        "coordinates": [[
            [lon - lon_delta, lat - lat_delta],
            [lon + lon_delta, lat - lat_delta],
            [lon + lon_delta, lat + lat_delta],
            [lon - lon_delta, lat + lat_delta],
            [lon - lon_delta, lat - lat_delta],
        ]],
    }


def worldpop_density_per_km2(lat, lon, year=None):
    # WorldPop public API provides population density around the location.
    # Public WorldPop datasets listed by this API currently go up to 2020.
    year_value = year or min(2020, time.gmtime().tm_year)
    geojson = make_square_geojson(lat, lon, half_side_km=0.5)

    params = {
        "dataset": "wpgppop",
        "year": str(year_value),
        "geojson": json.dumps(geojson, separators=(",", ":")),
    }
    encoded = urllib.parse.urlencode(params)
    url = f"{WORLDPPOP_STATS_URL}?{encoded}"

    try:
        created = http_get_json(url, timeout=3.2)
    except Exception:
        return None

    task_id = created.get("taskid")
    if not task_id:
        return None

    for _ in range(8):
        try:
            task_url = WORLDPOP_TASK_URL.format(task_id=urllib.parse.quote(task_id))
            task_data = http_get_json(task_url, timeout=2.5)
            status = str(task_data.get("status", "")).lower()
            if status == "finished":
                total = to_float(task_data.get("data", {}).get("total_population"), default=float("nan"))
                if math.isfinite(total):
                    # The sampled polygon is approximately 1 square kilometer.
                    return int(round(max(total, 0.0)))
                return None
            if status in ("failed", "error"):
                return None
        except Exception:
            return None

        time.sleep(0.25)

    return None


def time_of_day_label(epoch_seconds=None):
    local_time = time.localtime(epoch_seconds or time.time())
    hour = local_time.tm_hour
    if 5 <= hour < 12:
        return "Morning"
    if 12 <= hour < 17:
        return "Afternoon"
    if 17 <= hour < 21:
        return "Evening"
    return "Night"


def traffic_level_from_road_density(road_count, time_of_day):
    if road_count is None:
        # Fallback when road API is unavailable.
        return "Medium" if time_of_day in ("Morning", "Evening") else "Low"

    # Baseline from road density around current location.
    if road_count >= 90:
        level = "High"
    elif road_count >= 45:
        level = "Medium"
    else:
        level = "Low"

    # Rush-hour adjustment.
    if time_of_day in ("Morning", "Evening"):
        if level == "Low":
            level = "Medium"
        elif level == "Medium":
            level = "High"

    return level


def calculate_score(hospital_km, police_km, population_density, traffic_level, time_of_day):
    score = 72

    if hospital_km is not None:
        if hospital_km <= 1.0:
            score += 8
        elif hospital_km <= 3.0:
            score += 3
        elif hospital_km <= 8.0:
            score -= 3
        else:
            score -= 8

    if police_km is not None:
        if police_km <= 1.0:
            score += 10
        elif police_km <= 3.0:
            score += 4
        elif police_km <= 8.0:
            score -= 4
        else:
            score -= 10

    if population_density is not None:
        if population_density >= 12000:
            score -= 10
        elif population_density >= 7000:
            score -= 6
        elif population_density >= 3000:
            score -= 2
        else:
            score += 2

    if traffic_level == "High":
        score -= 8
    elif traffic_level == "Medium":
        score -= 4
    elif traffic_level == "Low":
        score += 1

    if time_of_day == "Night":
        score -= 10
    elif time_of_day == "Evening":
        score -= 4

    return int(clamp(round(score), 0, 100))


def main():
    lat = to_float(sys.argv[1], default=0.0) if len(sys.argv) > 1 else 0.0
    lng = to_float(sys.argv[2], default=0.0) if len(sys.argv) > 2 else 0.0

    period = time_of_day_label()

    def safe_future_result(future, default=None, timeout=6.5):
        try:
            return future.result(timeout=timeout)
        except Exception:
            return default

    with ThreadPoolExecutor(max_workers=4) as pool:
        hospital_future = pool.submit(nearest_amenity_distance_km, lat, lng, "hospital")
        police_future = pool.submit(nearest_amenity_distance_km, lat, lng, "police")
        population_future = pool.submit(worldpop_density_per_km2, lat, lng)
        roads_future = pool.submit(road_density_count, lat, lng)

        closest_hospital_km = safe_future_result(hospital_future)
        closest_police_km = safe_future_result(police_future)
        population_density_per_km2 = safe_future_result(population_future)
        roads_nearby_count = safe_future_result(roads_future)

    traffic_level = traffic_level_from_road_density(roads_nearby_count, period)

    score = calculate_score(
        hospital_km=closest_hospital_km,
        police_km=closest_police_km,
        population_density=population_density_per_km2,
        traffic_level=traffic_level,
        time_of_day=period,
    )

    payload = {
        "score": score,
        "latitude": lat,
        "longitude": lng,
        "status": "success",
        "generatedAt": now_iso(),
        "closestHospitalKm": closest_hospital_km,
        "closestPoliceStationKm": closest_police_km,
        "timeOfDay": period,
        "populationDensityPerKm2": population_density_per_km2,
        "trafficLevel": traffic_level,
        "roadsNearbyCount": roads_nearby_count,
        # Backward-compatible aliases for different frontend field conventions.
        "closest_hospital_km": closest_hospital_km,
        "closest_police_station_km": closest_police_km,
        "population_density_per_km2": population_density_per_km2,
        "traffic_level": traffic_level,
        "time_of_day": period,
    }

    print(json.dumps(payload))
    sys.stdout.flush()


if __name__ == "__main__":
    main()
