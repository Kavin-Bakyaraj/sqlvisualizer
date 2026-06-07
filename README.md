# SQL Visualizer

Generate searchable ER diagrams from PostgreSQL-style SQL schemas. Export complete diagrams as PNG, SVG, or PDF without cropping.

## Local Development

```bash
npm ci
npm run dev
```

Open `http://localhost:3000`.

## Validation

```bash
npm run lint
npx tsc -p tsconfig.json --noEmit
npm run build
```

If `npm run build` fails locally with an `EPERM` error inside `.next`, stop the running dev server and run the build again.

## Deploy to Vercel

This app is a Next.js project. Deploy the `frontend` directory as the Vercel project root.

Recommended Vercel settings:

- Framework Preset: `Next.js`
- Root Directory: `frontend`
- Install Command: `npm ci`
- Build Command: `npm run build`
- Output Directory: leave empty / framework default
- Node.js Version: `20.x` or newer

The included `vercel.json` pins the framework, install command, and build command for consistent deployments.
