# SafePath Nav -> feat01 Merge Report

## Purpose

This report summarizes the likely merge issues between `safepath-nav` and `feat01`, using the corrected architecture decision:

- `index.js` must remain the main backend entry point
- `server.js` from `safepath-nav` must be adapted into the existing `index.js` structure

The goal is to merge the SafePath Nav feature into `feat01` without ending up with two separate backend bootstraps.

## Branch Comparison Summary

### Compared branches

- `feat01`
- `origin/safepath-nav`
- `dev`

### Shared base commit

- `374f7fcdaded71c89cce81adc373880bf9f3c08b`

### Main finding

The core merge problem is structural.

- `feat01` already has a full backend app built around `index.js`
- `safepath-nav` introduces a second startup file, `server.js`

If the branches are merged as-is, the project risks ending up with:

- two competing startup files
- duplicated middleware setup
- duplicate route-registration logic
- conflicting `package.json` startup behavior

The SafePath Nav feature files themselves are mostly self-contained.  
The major risk comes from the fact that `safepath-nav` was developed like a small standalone backend instead of a feature module inside the main backend.

## Conflict Risk Assessment

### High-risk areas

1. `index.js`
   This is already the active backend startup file in `feat01`. It contains the real app structure that must be preserved.

2. `server.js`
   This creates a second Express app bootstrap and must not stay as a parallel runtime entry.

3. `package.json`
   Both branches expect different startup behavior:
   - `feat01`: `"start": "nodemon index.js"`
   - `safepath-nav`: `"start": "node server.js"`

4. `package-lock.json`
   Both branches changed dependencies independently, so this file is very likely to conflict.

5. `.gitignore`
   This is already a direct conflict between the branches.

6. `node_modules/`
   Both branches contain committed dependencies, which creates very large and unnecessary merge noise.

### Lower-risk areas

These SafePath Nav feature files should merge much more cleanly once the server-entry issue is resolved:

- `Controller/safeRouteController.js`
- `Routers/safeRouteRouter.js`
- `utils/circlePolygon.js`
- `utils/distance.js`
- `utils/zoneChecker.js`

## Root Cause

`feat01` already has a working backend shell in `index.js`.

That file currently handles:

- environment loading
- Express app creation
- middleware setup
- route registration
- Stripe webhook setup
- Notify.lk balance check
- database initialization

`safepath-nav` adds another startup layer through `server.js`, but that is not how the project should grow.  
The nav feature should be integrated into the existing backend, not run beside it.

Because of that, `server.js` should not become the new standard.  
Instead, its useful parts must be absorbed into the `index.js`-based backend.

## Required Target Structure

The final merged backend should follow this model:

- `index.js` remains the only backend entry point
- all common middleware stays centralized in `index.js`
- all route registration stays centralized in `index.js`
- SafePath Nav is added as another feature route inside `index.js`
- `server.js` is either removed or reduced to a non-runtime helper role
- `package.json` keeps `index.js` as the startup direction

## Exact Adaptation Needed

### 1. Keep `index.js` as the single backend entry point

`index.js` is already the real application shell in `feat01`.

Required decision:

- keep `index.js` as the only startup file
- do not keep `server.js` as a second runnable backend entry

### 2. Adapt `server.js` functionality into `index.js`

The current `server.js` from `safepath-nav` is small and mainly provides:

- `dotenv` loading
- Express app creation
- `cors` middleware
- `body-parser` middleware
- `safeRouteRouter` mounting
- port binding

All of that must be folded into the existing `index.js` app, not preserved as a separate app.

### 3. Register SafePath Nav inside the existing app

The SafePath Nav route should be mounted from `index.js`, for example:

- `app.use("/", safeRouteRouter);`

The feature should behave like the rest of the backend modules already mounted in `feat01`.

### 4. Keep `feat01` startup responsibilities intact

The following `index.js` behavior must remain active after merge:

- `dotenv.config()`
- `express()` app creation
- `cors` setup
- `express.json()` setup
- JSON response wrapper
- `/health` route
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
- `/safety-score` compatibility routes
- Stripe webhook route
- Notify.lk balance check
- `AppDataSource.initialize()`

The nav integration must not break or replace any of the above.

### 5. Align `package.json` to the existing `index.js` direction

Because `index.js` remains the main backend entry point, `package.json` should continue to point there.

Expected direction:

- keep startup script based on `index.js`
- do not switch the runtime entry to `server.js`

### 6. Remove unused dependency churn

From the SafePath Nav files that were inspected:

- `axios` is used
- `express` is used through the router
- `dotenv` is used
- `cors` is relevant if middleware stays in the main backend
- `@turf/circle` does not appear to be used by the committed nav implementation

The current SafePath Nav code uses:

- `utils/circlePolygon.js`
- `utils/distance.js`
- `utils/zoneChecker.js`

So if `@turf/circle` is not actually used anywhere, it should be removed before the merge to reduce `package-lock.json` conflict surface.

### 7. Remove committed dependencies from version control

Before merge:

- remove `node_modules/` from Git
- keep `node_modules` in `.gitignore`

This is one of the biggest practical steps for reducing merge pain.

## File-Specific Notes

### `index.js`

Current role:

- primary backend entry point
- must remain the main startup file

Required action:

- add SafePath Nav imports and route registration here
- keep all existing startup logic here

### `server.js`

Current role in `safepath-nav`:

- standalone Express startup for nav only

Required action:

- do not keep it as a second active backend entry
- extract any useful routing setup from it
- merge that setup into `index.js`
- remove it if it no longer serves a clear purpose

### `.gitignore`

This is a real merge conflict already.

Recommended final contents should include at least:

- `.env`
- `.env.*`
- `node_modules`

The `safepath-nav` entry `lala.txt` should not be kept unless it has a real project purpose.

### `package-lock.json`

This file will likely conflict because both branches changed dependencies.

Recommended approach:

- finalize the actual dependency list first
- regenerate the lockfile once the final package set is agreed

## Post-Merge Run Guide

After the pull request is merged, the backend should still be started from the `index.js`-based application.

### Expected startup direction

The project should have only one active backend entry point:

- `index.js`

Expected `package.json` direction:

- `"start": "nodemon index.js"`

If the team wants a non-watch mode as well, an additional script can be added separately, but the main application structure should still be built around `index.js`.

### What must be imported into `index.js`

After merging SafePath Nav, `index.js` must continue to import the existing backend modules and also import the new nav route.

That means `index.js` should include or preserve imports for:

- `dotenv`
- `express`
- `cors`
- `authMiddleware`
- `AppDataSource`
- `checkNotifyBalance`
- existing `feat01` routers
- `safeRouteRouter`
- `handleStripeWebhook`
- `getLiveSafetyScore`

### SafePath Nav-specific imports

The navigation feature requires these files to stay connected:

- `Controller/safeRouteController.js`
- `Routers/safeRouteRouter.js`
- `utils/circlePolygon.js`
- `utils/distance.js`
- `utils/zoneChecker.js`

In practice, `index.js` only needs to import the router:

- `safeRouteRouter`

The router and controller chain will load the related nav utilities.

### Environment variables required

After merge, verify that the `.env` file still contains everything required by the existing backend and the nav feature.

At minimum, confirm:

- `PORT`
- `MAPBOX_TOKEN`
- database connection variables used by `AppDataSource`
- Stripe keys required by payment routes
- Notify.lk credentials required by calling or SMS routes
- Supabase keys if they are used by the existing backend

### Dependencies to verify after merge

Before starting the backend, confirm that `package.json` includes the dependencies required by the final merged code.

Most likely required:

- `express`
- `cors`
- `dotenv`
- `axios`
- existing `feat01` dependencies such as:
  - `stripe`
  - `pg`
  - `typeorm`
  - `@supabase/supabase-js`
  - `nodemon`
  - communication/auth packages already used in `feat01`

`body-parser` should only remain if the final merged code still uses it directly.  
Since `feat01` already uses `express.json()`, keeping `body-parser` may be unnecessary unless there is a specific reason.

### Things to clean before running

After merge, verify:

- there is no second active startup file competing with `index.js`
- `package.json` still points to `index.js`
- `node_modules/` is not committed
- `.gitignore` includes `node_modules`, `.env`, and `.env.*`
- `package-lock.json` was resolved after dependency cleanup

### Basic run steps after merge

1. Pull the merged branch
2. Confirm `index.js` is still the single active backend entry
3. Confirm `.env` contains all required keys
4. Run `npm install`
5. Start the backend
6. Test at least:
   - `/health`
   - existing `feat01` routes
   - `/safe-route`
   - payment/webhook paths if needed in the environment

### Recommended smoke test checklist

After startup, confirm:

- the server starts without import errors
- there is only one port-binding path
- database initialization still works
- Notify.lk balance check does not crash startup
- Stripe webhook route still works
- `/safe-route` responds and reads `MAPBOX_TOKEN`
- existing `feat01` routes still behave normally

## Recommended Merge Plan

1. Clean `safepath-nav` before merge:
   - remove committed `node_modules`
   - remove unused dependencies
   - treat `server.js` as temporary branch structure, not final architecture

2. Move SafePath Nav into the `index.js` backend:
   - import `safeRouteRouter` into `index.js`
   - mount it in the existing app
   - preserve all current `feat01` middleware and startup logic

3. Keep `package.json` aligned to `index.js`

4. Resolve `.gitignore` using the backend-safe version

5. Regenerate `package-lock.json` only after the final dependency list is decided

6. Merge into `feat01`

7. After `feat01` is stable, merge `feat01` into `dev`

## Final Conclusion

Yes, a merge conflict is likely if `safepath-nav` is pulled into `feat01` as-is.

The main reason is architectural:

- `feat01` is built around `index.js`
- `safepath-nav` adds a second startup path through `server.js`

The correct integration direction is:

- keep `index.js` as the only backend entry point
- adapt the useful parts of `server.js` into `index.js`
- merge the SafePath Nav router, controller, and utilities into that existing backend

If that is done before or during the merge, the conflict risk drops significantly and the later merge into `dev` should be much smoother.
