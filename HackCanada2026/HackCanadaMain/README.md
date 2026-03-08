# HackCanadaMain

This repo contains two separate apps:

- `my-app/`: the Next.js frontend
- `backend/`: the FastAPI backend

`HackCanadaMain` is the npm workspace root. The frontend app stays in `my-app/`,
and the root package also provides the shared Tailwind/PostCSS toolchain needed
when Next resolves CSS imports from the workspace root during dev.

## Install Dependencies

From `HackCanadaMain/`:

```bash
npm install
```

## Common Commands

From `HackCanadaMain/`:

```bash
npm run dev
npm run build
npm run lint
```

These root scripts run against the `my-app` workspace.

If you want to work directly in the frontend package instead, these are
equivalent:

```bash
cd my-app
npm run dev
npm run build
npm run lint
```

## Backend

From `HackCanadaMain/`:

```bash
python3 backend/main.py
```

Or use the convenience script:

```bash
npm run backend:dev
```
