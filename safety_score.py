import sys
import json
import random

# 1. GET INPUTS
try:
    lat = float(sys.argv[1])
    lng = float(sys.argv[2])
except Exception:
    lat, lng = 0.0, 0.0

# 2. THE LOGIC (Your "AI")
def calculate_score(lat, lng):
    score = 75
    # Simulate "Danger Zones" (e.g., near City Center)
    if 6.90 < lat < 6.95:
        score -= random.randint(15, 30)
    else:
        score += random.randint(5, 10)
    return max(0, min(100, score))

# 3. RETURN JSON
print(
    json.dumps(
        {
            "score": calculate_score(lat, lng),
            "latitude": lat,
            "longitude": lng,
            "status": "success",
        }
    )
)
sys.stdout.flush()
