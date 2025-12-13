# @knighted/jsx-ts-plugin

Diagnostics-only TypeScript language service plugin for `@knighted/jsx` tagged templates (`jsx` / `reactJsx`). It rewrites tagged template literals into JSX on the fly and asks TypeScript for semantic diagnostics so you see JSX errors inside the template strings.

## Status

- MVP: diagnostics only (invalid props/attributes, JSX syntax issues, interpolation type errors).
- No completions/hover/definitions yet.
- Diagnostics are mapped back to the template start; positions are approximate in this first cut.

## Install

```sh
npm install -D @knighted/jsx-ts-plugin
```

## Configure (tsconfig.json)

```json
{
  "compilerOptions": {
    "plugins": [
      {
        "name": "@knighted/jsx-ts-plugin",
        "tags": ["jsx", "reactJsx"],
        "mode": "react"
      }
    ]
  }
}
```

Options:

- `tags`: tagged template identifiers to treat as JSX (default: `["jsx", "reactJsx"]`).
- `mode`: reserved for future ("react" | "dom"), currently informational.
- `maxTemplatesPerFile`: optional guardrail to skip files with many templates.

## Notes / Limitations

- The plugin rebuilds a transformed program per file for diagnostics; acceptable for small/medium projects, but we will add caching as features grow.
- Requires TypeScript >= 5.4 (peer dependency).

## Development

```sh
npm install
npm run build
```

Publish is handled by npm `prepare` via `npm run build`.
