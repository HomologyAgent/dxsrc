# DXPlay community sources

DXPlay configurations, classified source metadata and JavaScript plugins.

## Use in DXPlay

Import the default curated configuration:

```text
https://raw.githubusercontent.com/HomologyAgent/dxsrc/master/dxplay.json
```

Smaller presets are available under [`configs/`](configs/). The interactive
selector at <https://homologyagent.github.io/dxsrc/> can generate a custom
configuration by content category and delivery type.

## Contents

- `dxplay.json` — default verified selection; adult sources are excluded.
- `configs/*.json` — ready-to-import category presets.
- `catalog.json` — classified inventory consumed by the selector site.
- `plugins/catalog/*.js` — readable single-file `catalog@1` source plugins.
- `plugins/support/*.js` — reusable capability plugins required by some
  catalog sources.
- `compatibility.json` — release counts and known upstream incompatibilities.

DXPlay resolves relative plugin paths against the imported configuration URL,
so the JSON files can be consumed directly from GitHub Raw. No npm package or
server is required. Node.js 20 or newer is needed only to run the repository's
integrity check with `npm run check`.

## Scope

Sources remain owned and operated by their respective providers. This catalog
does not grant access rights and does not bypass login, subscription, DRM or
anti-automation controls. Availability may change independently of DXPlay.
