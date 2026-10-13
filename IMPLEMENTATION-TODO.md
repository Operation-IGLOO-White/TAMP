# TAMP implementation roadmap

This roadmap keeps TAMP as a modular monolith: one React/Vite frontend, one
FastAPI backend, PostgreSQL/PostGIS, and the existing worker process. No
microservices are planned at this stage.

## Chosen free map stack

- **Map renderer:** MapLibre GL JS (already installed).
- **Base-map tiles for the initial release:** OpenFreeMap, using
  `https://tiles.openfreemap.org/styles/liberty` (already used by `NavMap`). It
  requires no API key and currently charges no usage fee.
- **Routing:** self-hosted Valhalla inside the backend deployment. Use its
  `truck` costing model so routes can consider truck access, width, height and
  weight restrictions where OpenStreetMap has that data.
- **Address autocomplete and reverse geocoding:** self-hosted Photon with a
  South Africa OpenStreetMap extract.
- **Geospatial storage:** PostgreSQL with PostGIS.
- **Live positions:** browser/mobile GPS -> FastAPI -> Redis latest-position
  cache -> PostgreSQL/PostGIS history -> authenticated WebSocket subscribers.

OpenFreeMap's public tiles are suitable for local development and an initial
release. Because it is an external, best-effort service, the map provider URL
must remain configurable. At higher traffic, self-host the OpenFreeMap tiles or
another compatible OpenStreetMap tile set. Public Nominatim and OSRM demo
servers must not be treated as production infrastructure.

The free stack has no per-request map bill, but production self-hosting still
has server, storage, bandwidth and operations costs. It also does not include a
commercial live-traffic feed. Initial ETAs will use road speeds and observed
trip history; traffic-aware ETAs can be added later if the business chooses a
traffic-data provider.

## Phase 0 - map provider cleanup

- [x] Add backend configuration:
  - `VITE_MAP_STYLE_URL=https://tiles.openfreemap.org/styles/liberty`
  - `ROUTING_PROVIDER=valhalla`
  - `VALHALLA_URL=https://valhalla1.openstreetmap.de` for development
  - `GEOCODING_PROVIDER=photon`
  - `PHOTON_URL=https://photon.komoot.io` for development
- [x] Add matching frontend variables to `.env.example`, exposing only the tile
      style URL to the browser.
- [ ] Create provider interfaces inside the FastAPI monolith for routing and
      geocoding; do not create network services for TAMP application logic.
- [x] Replace synchronous map HTTP calls with `httpx.AsyncClient`.
- [x] Replace Google Places calls with Photon autocomplete, place lookup and
      reverse geocoding.
- [x] Replace Google Routes calls with Valhalla route requests. Vehicle dimension
      inputs will follow when those fields are added to truck postings.
- [x] Return GeoJSON route geometry instead of Google encoded polylines.
- [ ] Convert `TripRouteMap` and `FleetMap` from Leaflet/public OSM raster tiles
      to the shared MapLibre/OpenFreeMap component.
- [x] Remove Google-specific comments, response types and environment settings.
- [x] Keep mandatory map-data attribution visible.
- [ ] Add graceful UI states for routing unavailable, location not found and
      incomplete vehicle dimensions.

**Done when:** all TAMP maps, address search and route calculations work locally
without a Google key or another paid API account.

## Phase 1 - route quote before agreement

- [x] Add `route_quotes` with origin, destination, truck-to-pickup leg,
      pickup-to-destination leg, distance, estimated duration, route geometry,
      vehicle constraints, provider, creation time and expiry time.
- [x] Add a backend command that recalculates the quote when pickup,
      destination, truck, dimensions or departure time changes.
- [x] Display a required match-review dialog before either party can accept.
- [x] Show on the same screen:
  - pickup and destination;
  - truck location and distance to pickup;
  - route line;
  - distance and estimated duration;
  - truck/cargo compatibility;
  - rate and pickup window.
- [ ] Add alternative-route selection, platform fees, transporter payout and
      persisted quote expiry to the review screen.
- [x] Disable acceptance while the route is loading or unavailable. Quote expiry
      will be enforced when persisted route quotes are added.
- [x] Warn when OpenStreetMap lacks enough restriction data to guarantee truck
      clearance.

**Done when:** freight owner and transporter see the same current route and
commercial terms before giving consent.

## Phase 2 - two-party agreement

- [x] Add versioned `match_offers` containing the selected route quote,
      commercial terms, vehicle, cargo, time window and SHA-256 terms hash.
- [x] Add one consent record per party and offer revision.
- [ ] Allow either party to accept first. The current workflow intentionally
      starts with owner approval and then carrier confirmation.
- [x] Confirm the match atomically only when both parties accept the same,
      unexpired revision.
- [x] On a material change, create a new revision and invalidate prior consents.
- [x] Record actor, party, timestamp, IP/request metadata and acceptance receipt.
- [x] Make agreement state transitions backend-controlled and transactionally serialized.
- [ ] Notify the other party of acceptance, rejection, expiry and counteroffer.

**Done when:** no route, vehicle, price or schedule can change after one party
accepts without requiring both parties to agree again.

## Phase 3 - real driver tracking

- [ ] Add driver location permission and clear foreground/background tracking
      states in the driver PWA.
- [ ] Send latitude, longitude, accuracy, heading, speed and captured time every
      5-10 seconds during an active trip, with slower updates while stationary.
- [ ] Authenticate every location update against the assigned driver and trip.
- [ ] Store the latest position in Redis and durable samples in PostGIS.
- [ ] Add authenticated WebSocket channels scoped to the trip's parties and
      authorized administrators.
- [ ] Replace `simulatedPosition` and progress interpolation with real GPS data;
      retain an explicit demo mode only for development.
- [ ] Detect stale, impossible and out-of-order positions.
- [ ] Recalculate remaining distance and ETA after meaningful movement or route
      deviation.
- [ ] Show last-updated time and degraded/offline tracking states.
- [ ] Add location-history retention and deletion rules.

**Done when:** both parties can follow the assigned vehicle on the road and can
tell whether its location is current.

## Phase 4 - trip operations and safety

- [ ] Add geofences for pickup and destination arrival/departure.
- [ ] Enforce the lifecycle: scheduled -> en route -> at pickup -> loaded -> in
      transit -> at destination -> delivered/completed.
- [ ] Add proof of pickup and delivery with photos, signatures, timestamps and
      location verification.
- [ ] Add cancellations, no-shows, breakdowns, delays and route-deviation events.
- [ ] Add in-app trip messaging, notification preferences and masked contact
      details.
- [ ] Add SOS/escalation workflow and trip sharing.
- [ ] Add driver, transporter and vehicle document verification with expiry
      reminders.
- [ ] Add ratings, complaints, disputes and an immutable audit timeline.

## Phase 5 - marketplace finance

- [ ] Add counteroffers and bidding with expiry times.
- [ ] Add configurable distance, vehicle, cargo, urgency and demand pricing.
- [ ] Add platform commission and a complete fee breakdown before acceptance.
- [ ] Add payment authorization/escrow, invoices, refunds and cancellation fees.
- [ ] Add transporter balances and controlled payouts.
- [ ] Reconcile every payment event through an auditable ledger.

Payment work must start with a selected South African payment provider and a
review of its marketplace/split-payment support.

## Phase 6 - Fleetbase-style fleet capabilities

- [ ] Multi-stop loads and stop sequencing.
- [ ] Dispatch board and batch assignment.
- [ ] Driver shifts, availability and hours tracking.
- [ ] Service zones, depots and restricted areas.
- [ ] Maintenance schedules, inspections and work orders.
- [ ] Fuel, tyre, incident and vehicle cost records.
- [ ] Telematics provider adapters.
- [ ] Fleet utilization, on-time delivery and profitability dashboards.
- [ ] Customer tracking portal and shareable tracking links.
- [ ] Organization-scoped API keys, webhooks and event logs.

## Supporting backend work

- [ ] Enable PostGIS and add spatial indexes for vehicles, loads, zones and trip
      positions.
- [ ] Use the existing worker for notifications, route refreshes, geofence
      evaluation and retention jobs.
- [ ] Add a transactional outbox so committed domain events reliably reach the
      worker and WebSocket publisher.
- [ ] Add Redis for current positions, online presence, quote expiry and
      short-lived route caches.
- [ ] Keep authorization checks in every command/query; never rely on hidden
      frontend controls.
- [ ] Add rate limits for login, address search, route calculation and position
      ingestion.
- [ ] Add health checks for PostgreSQL, Redis, Photon and Valhalla.
- [ ] Add metrics for route latency, active drivers, stale positions, match
      conversion and failed notifications.

## Immediate implementation order

1. Complete Phase 0 and verify a South African address and truck route locally.
2. Build the route-review dialog and persisted route quote from Phase 1.
3. Require versioned two-party consent from Phase 2.
4. Add real GPS ingestion and WebSocket viewing from Phase 3.
5. Add geofence trip events and proof of delivery from Phase 4.
6. Add finance only after the complete trip lifecycle is reliable.

Use unit and integration tests for backend state transitions, permissions,
route-provider parsing and location validation. Do not run or add Playwright
work unless it is explicitly requested.
