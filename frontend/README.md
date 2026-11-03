# Alpine frontend

The Alpine landing page and app, built with React and Vite.

## Run

```sh
npm install
npm run dev
```

The dev server proxies `/api` to the [backend](../backend/README.md) on port 8100, so start that too, or run `npm run dev` from the repository root to start both.

| Script | Purpose |
| --- | --- |
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Production build in `dist/` |
| `npm run build:file` | Build, then bundle it into one self-contained `dist/standalone.html` |
| `npm run preview` | Serve the production build locally |

## Layout

| Path | Contents |
| --- | --- |
| `index.html` | Landing page, plain HTML |
| `app.html`, `src/main.jsx`, `src/App.jsx` | App entry and routes |
| `src/views/` | Overview, Sessions and Practice |
| `src/components/alpine.jsx` | Shared UI: charts, rings and the streak |
| `src/voice/` | Voice interview: audio capture, noise suppression and the interview flow |
| `src/api.js`, `src/dashboard.js` | API client and the numbers the dashboard shows |
| `src/reportPdf.js` | PDF report download |
| `src/alpine.css` | Design system |
