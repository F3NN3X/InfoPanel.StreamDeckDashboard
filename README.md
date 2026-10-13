# InfoPanel Stream Deck plugin

A native Stream Deck plugin (SDK 3, Stream Deck 7.1+, Windows 10+) that drives the
[InfoPanel Dashboard](https://github.com/F3NN3X/InfoPanel.Dashboard): switch pages and profiles, rotate pages,
and show live InfoPanel sensors on keys. Keys are drawn in the dashboard's own theme colours with its page icons.

## Actions

| Action | Press | Face |
|---|---|---|
| Go to page | show that page (profile or "shown profile", page) | page icon + name, filled while the page is showing |
| Next page / Previous page | next / previous page, wrapping | arrow + current page name |
| Switch profile | force a profile on the kiosks; "Auto" clears the override | profile name, filled while forced |
| Auto-rotate | toggle rotation; hold 1 s = back to the saved setting | play / pause, `saved: on/off` while overridden, dimmed with fewer than 2 pages |
| Page cycler (Stream Deck +) | dial: rotate = next / previous page, press = first page, touch = toggle rotation | touch strip: icon, page name, position bar `n / total`, rotating mark |
| Sensor value | open a page (optional) | label, live value + unit, warn / critical colours, sparkline (repaints at most 4x per second) |

When the dashboard cannot be reached the keys show a muted "Offline" face, a press shows the alert, and they recover
on their own when it is back. Page keys show the active fill instead of the OK tick; switch-profile and auto-rotate
show the tick after a successful press.

## Install

1. Build once (see Develop), then link the plugin folder into the Stream Deck app:
   `npx streamdeck link com.f3nn3x.infopanel-dashboard.sdPlugin`
   or pack it with `npm run pack` and open the resulting `.streamDeckPlugin`.
2. Drag the actions from the **InfoPanel** category onto keys (or the dial).
3. In any action's property inspector, **Connection** sets the server addresses (shared by all actions):
   - Dashboard, default `http://127.0.0.1:3922`. It needs the control routes (`/api/control`, `/events/control`).
   - Data API, default `http://127.0.0.1:3921` (InfoPanel's Data API, used by the Sensor value key).

Leaving "Profile" on **Shown profile** targets the profile a kiosk is showing (the dashboard's own fallback order:
override, shown, pinned, first).

## Develop

```
npm install
npm run build        # icons + rollup -> com.f3nn3x.infopanel-dashboard.sdPlugin/bin/plugin.js
npm run watch        # rebuild and `streamdeck restart` on change
npm test             # Vitest
npm run typecheck
npm run validate     # streamdeck validate
npm run pack         # .streamDeckPlugin
```

`npm run icons` bundles the lucide icons (`lucide-static`) into `src/render/lucide-data.ts` (generated, git-ignored);
the other scripts run it first.

Layout:

- `src/sse.ts`, `src/dashboard.ts`, `src/data-api.ts`: SSE over `fetch`, the shared dashboard client (config, control
  state, POST helpers, profile resolution) and the Data API client (sensor catalogue, shared per-prefix streams, history).
- `src/render/`: pure SVG renderers (keys, touch strip, sensor key).
- `src/actions/`: one class per action; `painted-key.ts` / `dashboard-key.ts` hold the shared behaviour.
- `com.f3nn3x.infopanel-dashboard.sdPlugin/`: manifest, touch-strip layout, images and property inspectors (sdpi-components v4,
  vendored in `ui/`).

## Notes

- The action icons and plugin/category images are simple placeholders drawn from lucide; replace them before publishing.
- The plugin only reads from the dashboard server and posts to `/api/control/*`; it never edits the dashboard config.
