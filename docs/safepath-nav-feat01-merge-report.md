# SafePath Nav -> feat01 Merge Report

## Purpose

This report summarizes the likely merge issues between `safepath-nav` and `feat01`, with the agreed direction that `server.js` is the standard backend entry point.  
That means the final integrated backend should follow the `server.js` structure, and the existing `feat01` `index.js` implementation must be adapted instead of keeping two separate app bootstraps.

## Branch Comparison Summary

### Compared branches

- `feat01`
- `origin/safepath-nav`
- `dev`

### Shared base commit

- `374f7fcdaded71c89cce81adc373880bf9f3c08b`

### Main finding

The biggest integration issue is not the route logic itself.  
The main problem is that both branches introduce different application entry structures:

- `feat01` uses `index.js` as the main Express startup file
- `safepath-nav` uses `server.js` as the main Express startup file

If both are merged as-is, the project will end up with two competing server bootstraps, which creates confusion and raises the chance of integration mistakes.

## Conflict Risk Assessment

### High-risk areas

1. `index.js`
   `feat01` contains the full backend startup flow, route registration, middleware setup, DB initialization, and webhook handling.

2. `server.js`
   `safepath-nav` introduces a second standalone server entry with its own middleware and route mounting.

3. `package.json`
   Both branches define different startup expectations:
   - `feat01`: `"start": "nodemon index.js"`
   - `safepath-nav`: `"start": "node server.js"`

4. `package-lock.json`
   This will almost certainly conflict because both branches changed dependencies independently.

5. `.gitignore`
   Both branches added this file differently, so Git already reports it as a real content conflict.

6. `node_modules/`
   Both branches contain committed dependencies, which creates a huge amount of unnecessary merge noise.

### Lower-risk areas

These feature files from `safepath-nav` are relatively self-contained and should integrate cleanly once the server-entry issue is resolved:

- `Controller/safeRouteController.js`
- `Routers/safeRouteRouter.js`
- `utils/circlePolygon.js`
- `utils/distance.js`
- `utils/zoneChecker.js`

## Root Cause

`safepath-nav` was built as a standalone backend slice instead of a feature module that plugs into the existing backend.

That means it currently includes:

- its own `server.js`
- its own startup script direction in `package.json`
- its own middleware boot sequence

But `feat01` already has an active backend application shell in `index.js`.

Since the team decision is to standardize on `server.js`, the merge should not keep both startup files active.  
Instead, `index.js` functionality should be moved or adapted into the `server.js` structure.

## Required Target Structure

The final merged backend should use this model:

- `server.js` is the only backend entry point
- all route registration happens from `server.js`
- all common middleware is initialized in `server.js`
- existing `feat01` features are mounted into `server.js`
- `safeRouteRouter` is mounted into `server.js`
- startup behavior in `package.json` points to `server.js`

## Exact Adaptation Needed

### 1. Treat `server.js` as the final entry point

Keep one server bootstrap only:

- keep `server.js`
- do not keep parallel startup logic in `index.js`

### 2. Move `feat01` startup responsibilities into `server.js`

The current `index.js` includes important behavior that must not be lost:

- environment loading
- `express` app creation
- `cors` setup
- `express.json()` setup
- JSON response header wrapper
- `/health` endpoint
- existing routers:
  - `callRouter`
  - `smsRouter`
  - `bulkSmsRouter`
  - `notifyLkBulkSmsRouter`
  - `Userrouter`
  - `contactRouter`
  - `communityReportRouter`
  - `tripRouter`
  - `emergencyRouter`
  - `silentCallRouter`
  - `stripeRouter`
- direct `/safety-score` compatibility routes
- Stripe webhook setup
- Notify.lk balance check
- `AppDataSource.initialize()`

These must be integrated into the `server.js` app instead of remaining only inside `index.js`.

### 3. Add `safepath-nav` as a feature route, not as a separate backend

`safeRouteRouter` should be mounted inside the final `server.js` application, for example:

- `app.use("/", safeRouteRouter);`

Its controller and utility files can remain modular, but they should run inside the same shared Express app as the rest of the backend.

### 4. Align `package.json` with the chosen standard

Because the project is standardizing on `server.js`, `package.json` should reflect that.

Expected direction:

- replace startup script based on `index.js`
- use `server.js` as the main run target

### 5. Reduce dependency noise before merge

From the current branch contents:

- `axios`, `express`, `cors`, `dotenv`, and `body-parser` are already compatible with the backend direction
- `@turf/circle` appears unnecessary based on the committed `safepath-nav` code, because the branch uses its own `circlePolygon.js`

If `@turf/circle` is not used anywhere, it should be removed before merge to reduce lockfile churn.

### 6. Remove committed dependencies from Git

Both branches currently include committed `node_modules/`, which should not be merged as source.

Required action:

- remove `node_modules/` from version control
- keep it ignored in `.gitignore`

This will significantly reduce merge conflicts.

## File-Specific Notes

### `index.js`

Current role:

- contains the active backend setup for `feat01`

Required change:

- its logic should be migrated into `server.js`, or `index.js` should become a very thin wrapper that delegates to `server.js`

Recommended outcome:

- do not keep two full startup files in parallel

### `server.js`

Current role in `safepath-nav`:

- minimal Express startup for nav routes only

Required change:

- expand it to become the single integrated backend entry point

### `.gitignore`

Conflict already exists.

Recommended final contents should include at least:

- `.env`
- `.env.*`
- `node_modules`

The `safepath-nav` entry `lala.txt` should not be kept unless there is a real project reason.

### `package-lock.json`

This is a likely conflict file because both branches changed packages independently.

Recommended approach:

- resolve dependency decisions first
- regenerate the lockfile once the final dependency list is agreed

## Recommended Merge Plan

1. Clean `safepath-nav` before merge:
   - remove committed `node_modules`
   - remove unused dependencies
   - keep only feature files plus the chosen `server.js` direction

2. Adapt backend startup toward one final `server.js`:
   - merge the useful startup logic from `feat01/index.js`
   - mount existing `feat01` routes into `server.js`
   - mount `safeRouteRouter` into `server.js`

3. Update `package.json` to point to `server.js`

4. Resolve `.gitignore` using the shared backend-safe version

5. Regenerate `package-lock.json` after dependency cleanup

6. Merge into `feat01`

7. After `feat01` is stable, merge `feat01` into `dev`

## Post-Merge Run Guide

After the pull request is merged, the backend should be run using the final `server.js`-based structure.

### Expected startup direction

The project should have only one active backend entry point:

- `server.js`

The startup script in `package.json` should point to `server.js`.

Example direction:

- `"start": "node server.js"`

If the team wants hot reload during development, it can be:

- `"start": "nodemon server.js"`

### What must be imported into `server.js`

If `server.js` becomes the final entry point, it must include the imports that are currently required by the working backend in `feat01`.

That means `server.js` should include or preserve imports for:

- `dotenv`
- `express`
- `cors`
- `body-parser` only if the team still wants it
- `AppDataSource`
- `checkNotifyBalance`
- all active routers already used by `feat01`
- `safeRouteRouter`
- `handleStripeWebhook`
- `authMiddleware`
- `getLiveSafetyScore`

### Feature routes that must still be mounted

After merge, `server.js` should still mount the existing backend routes from `feat01`, plus the new nav route.

This includes:

- call routes
- SMS routes
- bulk SMS routes
- user routes
- contact routes
- community report routes
- emergency routes
- silent call routes
- trip routes
- payment routes
- safety score routes
- safe path navigation route

### SafePath Nav-specific imports

The navigation feature requires these files to remain connected:

- `Controller/safeRouteController.js`
- `Routers/safeRouteRouter.js`
- `utils/circlePolygon.js`
- `utils/distance.js`
- `utils/zoneChecker.js`

`server.js` itself only needs to import `safeRouteRouter`, because the router and controller chain will load the rest.

### Environment variables required

After merge, the backend will likely need the same environment variables already used by `feat01`, plus the Mapbox token required by SafePath Nav.

At minimum, verify:

- `PORT`
- `MAPBOX_TOKEN`
- database connection variables used by `AppDataSource`
- any Stripe keys already required by payment routes
- any Notify.lk credentials already required by calling or SMS routes
- any Supabase keys already required by the existing backend

### Dependencies to verify after merge

Before starting the backend, confirm that `package.json` includes the dependencies required by the final merged code.

Most likely required:

- `express`
- `cors`
- `dotenv`
- `axios`
- `body-parser` only if still used in final `server.js`
- existing `feat01` dependencies such as:
  - `stripe`
  - `pg`
  - `typeorm`
  - `@supabase/supabase-js`
  - `nodemon`
  - other current communication/auth packages already used in `feat01`

### Things to clean before running

After merge, verify these cleanup points before starting the server:

- there is no second active startup file competing with `server.js`
- `package.json` no longer points to `index.js` as the main runtime entry
- `node_modules/` is not committed
- `.gitignore` includes `node_modules`, `.env`, and `.env.*`
- `package-lock.json` has been regenerated only after final dependency decisions

### Basic run steps after merge

1. Pull the merged branch
2. Confirm `server.js` is the single active backend entry
3. Confirm `.env` contains all required keys
4. Run `npm install`
5. Run the backend with the project start script
6. Test at least:
   - `/health`
   - existing `feat01` core routes
   - `/safe-route`
   - payment/webhook paths if they are part of the environment

### Recommended smoke test checklist

After startup, check:

- server starts without import errors
- no duplicate port-binding logic exists
- database initialization still works
- Notify.lk balance check does not crash startup
- Stripe webhook route still loads correctly
- `/safe-route` responds and reads `MAPBOX_TOKEN`
- existing `feat01` routes still behave normally

### Final note for the PR

The pull request should not only merge the nav feature files.  
It should also leave the project in a runnable state with:

- one backend entry point
- one startup command
- all required imports present
- all required environment variables documented
- no dependency noise from committed `node_modules`

## Final Conclusion

Yes, a merge conflict is likely if `safepath-nav` is pulled into `feat01` as-is.

The main reason is not the safe-route feature files themselves.  
The real issue is that the two branches define different backend entry structures:

- `feat01` is centered on `index.js`
- `safepath-nav` is centered on `server.js`

Since the agreed standard is now `server.js`, the correct approach is:

- keep `server.js` as the single backend entry
- adapt or migrate the important `index.js` logic into `server.js`
- merge `safeRouteRouter` and related nav utilities into that shared backend

If this structure is followed before the merge, the conflict risk will drop significantly and the later merge into `dev` should be much smoother.
