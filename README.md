# @knighted/jsx-ts-plugin

[![codecov](https://codecov.io/gh/knightedcodemonkey/jsx-ts-plugin/graph/badge.svg?token=aGVVmSjyQd)](https://codecov.io/gh/knightedcodemonkey/jsx-ts-plugin)
[![NPM version](https://img.shields.io/npm/v/@knighted/jsx-ts-plugin.svg)](https://www.npmjs.com/package/@knighted/jsx-ts-plugin)

TypeScript language service plugin for `@knighted/jsx` tagged templates (`jsx` / `reactJsx`). It rewrites tagged template literals into JSX on the fly so editors can surface semantic diagnostics, completions, and quick info directly inside template strings.

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
        "tagModes": {
          "jsx": "dom",
          "reactJsx": "react"
        }
      }
    ]
  }
}
```

Options:

- `tagModes`: map each tagged template identifier to either `"dom"` or `"react"`. Defaults to `{ "jsx": "dom", "reactJsx": "react" }` so mixed DOM + React projects work with zero config.
- `tags` / `mode`: legacy options that still work but are superseded by `tagModes`.
- `maxTemplatesPerFile`: optional guardrail to skip files with many templates.

> [!NOTE]
> TypeScript language-service plugins only run inside `tsserver` (your editor). Running `tsc` or `tsc --noEmit` directly will **not** load this plugin, so command-line builds will not surface these diagnostics unless you pair the project with a separate compiler transform.

Inline overrides:

- `/* @jsx-dom */` — forces the next tagged template to run in DOM mode.
- `/* @jsx-react */` — forces the next tagged template to run in React mode.

The inline directives can appear as block or line comments and apply to the very next tagged template literal, even if it uses a custom identifier that is not declared in `tagModes`.

## TSX runtimes

`@knighted/jsx` now bundles the `@knighted/jsx/jsx-runtime` entry, so setting `"jsxImportSource": "@knighted/jsx"` works out of the box. No extra `paths` overrides or stub files are required inside this plugin anymore. The runtime module continues to exist strictly for TypeScript diagnostics—use the `jsx` / `reactJsx` tagged templates at runtime.

> [!IMPORTANT]
> The DOM helper (`jsx`) returns real `HTMLElement` instances / `JsxRenderable` values, while `reactJsx` deliberately returns React elements. Treat them as separate ecosystems—React-mode templates are **not** assignable to the DOM renderable types, and that mismatch is expected. When mixing both helpers in the same project (such as the fixtures workspace), avoid forcing React elements to satisfy DOM typings.

> [!NOTE]
> Even in DOM mode, the helper surfaces the broader `JsxRenderable` union (`Node`, strings, arrays, etc.). Let TypeScript infer the return type for helpers like `` const view = () => jsx`…` `` and only cast to HTMLElement` when you truly need DOM-only APIs. This keeps editors from raising false positives (e.g., “Type 'JsxRenderable' is not assignable to type 'HTMLElement'”) while still allowing consumers to assert a stricter type at the call site when necessary.

## Notes / Limitations

- Requires TypeScript >= 5.4 (peer dependency).

## Development

```sh
npm install
npm run build
npm test
```

The root workspace intentionally lists `@knighted/jsx` as a `file:` devDependency so VS Code’s tsserver always resolves the locally built runtime while testing the plugin. Make sure you install from the repo root (and re-run `npm install` if you change the runtime) so those symlinks remain intact.

> [!NOTE]
> Running `npm test` rebuilds the plugin, executes the verification harness under `packages/plugin/test/`, and then runs the internal coverage assertions. The harness loads the locally linked `@knighted/jsx` runtime, so run `npm run build` inside the `../jsx` repo first whenever you change the helper—otherwise the plugin will keep testing against stale runtime artifacts.

Publish is handled by npm `prepare` via `npm run build`.
