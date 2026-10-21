# TAMP frontend

React 19 + TypeScript + Vite single-page application, with React Router, React Query, and Tailwind CSS 4. The existing UI and API procedure names are preserved.

## Run locally

Requires Node.js 22.12+ (Node.js 24 recommended).

```sh
cd /home/hlaks/Documents/TAMP/tamp_frontend/TAMP
npm ci
cp .env.example .env
npm run dev
```

Open http://localhost:3000. Set `VITE_API_TARGET` in `.env` to the backend origin (defaults to `http://localhost:5000`). Restart Vite after changing it. Both development and preview proxy `/api` to that origin.

The frontend installs and builds independently. The compatible FastAPI/PostgreSQL backend is in `/home/hlaks/Documents/TAMP/tamp_backend`; start it before using login, data, matching, uploads, notifications, or geocoding. No simulated production data has been added.

## Structure

```text
TAMP/
  index.html
  package.json
  vite.config.ts
  tsconfig*.json
  public/
  src/
    main.tsx
    App.tsx                 # lazy routes and role guards
    index.css
    pages/                  # owner/, transporter/, driver/, admin/, etc.
    components/tamp/
    context/                # providers and application/session state
    fns/                    # API functions with request/response contracts
    lib/                    # navigation, transport, domain helpers
    types/                  # local frontend wire contracts
  tests/                    # browser routing checks
  TAMP-SPEC-GUIDE.md
```

The former `src/src` nesting and Next.js `app` wrappers have been removed. Configuration and the specification now live at the repository root. All previous URLs are retained; `/admin/logs` now exposes the existing system logs page. Unknown URLs show a not-found page.

## Documentation

- [TAMP entity relationship diagram](docs/TAMP-ERD.md) — current PostgreSQL tables, JSONB domain records, relationships, and integrity constraints.

## Backend contract

Requests use same-origin `/api/trpc` with tRPC batching, SuperJSON, cookie credentials, and the `X-TAMP-Request` CSRF header; uploads use `/api/uploads`. The former Node backend package dependency remains removed. `src/types/domain.ts` and `src/types/api.ts` describe the wire shapes consumed by the UI, while `src/fns` retains the existing operation signatures.

FastAPI validates requests at runtime and returns the existing tRPC-compatible envelope. The transport boundary remains typed locally because Python types cannot be imported into TypeScript. The frontend's real `/client` has been exercised against the backend for registration, cookie login, batching, snapshot loading, errors, and logout.

## Validation

```sh
npm run build       # TypeScript check and production bundle
npm run lint
npm test            # navigation URL and API transport checks
# Browser automation remains available as test:e2e, but is only run when explicitly requested.
```

## Deployment

`npm run build` produces `dist/`. `npm run preview` is for local inspection only. Production should serve `dist/` with a fallback to `index.html` for browser routes and proxy `/api` to the backend. See the [Vite deployment guide](https://vite.dev/guide/static-deploy) and [proxy configuration](https://vite.dev/config/server-options#server-proxy).

Start the backend first so it creates the shared Docker network:

```sh
cd /home/hlaks/Documents/TAMP/tamp_backend
docker compose up --build -d --wait
cd /home/hlaks/Documents/TAMP/tamp_frontend/TAMP
docker compose up --build -d --wait
```

The supplied container serves static files using unprivileged nginx on port 3000, with `/healthz`, SPA deep-link fallback, and `/api` proxying. nginx uses `BACKEND_TARGET=http://backend:5000` to reach the backend service on the shared `tamp-network`; `VITE_API_TARGET` is only for local Vite development. Set `FRONTEND_PORT` to change the host port. If overriding `TAMP_NETWORK`, use the same value in both repositories. PostgreSQL and the worker remain on the backend project’s private network. Stop the frontend before running `docker compose down` in the backend project so the shared network can be removed.

Check the API through nginx with `curl --fail http://localhost:3000/api/v1/health` (adjust the port if needed).
## Real full-stack browser test

The full-stack Playwright suite uses the actual Vite application, FastAPI server, PostgreSQL
database, session cookies, tracking endpoint and finance procedures. It refuses to reset any
database whose name does not contain `test`.

Create a dedicated PostgreSQL database, then run:

```bash
export TEST_DATABASE_URL='postgresql+asyncpg://tamp:your-password@localhost:5432/tamp_test'
npm run test:e2e:fullstack
```

To watch Chromium perform the journey:

```bash
export TEST_DATABASE_URL='postgresql+asyncpg://tamp:your-password@localhost:5432/tamp_test'
npm run test:e2e:fullstack:browser
```

`scripts/run-fullstack-e2e.sh` migrates and resets only that test database, seeds four verified
accounts, starts the backend on port 5001, builds the frontend, runs the browser test, and stops the
backend on exit. Set `TAMP_BACKEND_DIR` if the backend is not at `../../tamp_backend` relative to
this project.
