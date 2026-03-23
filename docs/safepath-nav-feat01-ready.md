# SafePath Nav Feature Branch Ready for `feat01`

## What changed

This branch has been prepared to merge into `feat01` as a feature module instead of a standalone backend.

### Changes applied

- Removed standalone `server.js`
- Kept SafePath Nav logic isolated in:
  - `Routers/safeRouteRouter.js`
  - `Controller/safeRouteController.js`
  - `utils/circlePolygon.js`
  - `utils/distance.js`
  - `utils/zoneChecker.js`
- Updated `safeRouteController` so it no longer depends on hardcoded coordinates or hardcoded danger zones
- Added support for both `GET /safe-route` and `POST /safe-route`
- Simplified `package.json` so it describes a feature module, not a full backend app
- Cleaned `.gitignore` to remove branch-specific junk entries

## Expected integration in `feat01`

`feat01` should keep `index.js` as the only app entry point.

The SafePath Nav feature should be integrated by:

1. copying the SafePath Nav feature files into `feat01`
2. importing `safeRouteRouter` into `feat01/index.js`
3. mounting it with `app.use(...)`

Example integration shape:

```js
import safeRouteRouter from "./Routers/safeRouteRouter.js";
app.use("/", safeRouteRouter);
```

## Request contract

The SafePath Nav controller now expects dynamic request inputs.

### Supported endpoint methods

- `GET /safe-route`
- `POST /safe-route`

### Required inputs

- `startLat`
- `startLon`
- `endLat`
- `endLon`
- `redZones`

### `redZones` shape

```json
[
  {
    "lat": 6.8398,
    "lon": 79.8847,
    "radius": 50
  }
]
```

### Example POST body

```json
{
  "startLat": 6.8391,
  "startLon": 79.8817,
  "endLat": 6.8425,
  "endLon": 79.8846,
  "redZones": [
    {
      "lat": 6.8398,
      "lon": 79.8847,
      "radius": 50
    }
  ]
}
```

## Environment requirement

The feature requires:

- `MAPBOX_TOKEN`

This should be supplied through the existing `feat01` environment configuration.

## Notes

- This branch is no longer intended to run as a standalone backend
- The merge target is the existing `feat01/index.js` application shell
- Dependency cleanup and final lockfile regeneration should happen after merge resolution in the target branch
