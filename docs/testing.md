# Testing @knighted/jsx-ts-plugin

The repository already ships a miniature project under `packages/fixtures` that mirrors the setup we expect in user workspaces. Follow the steps below whenever you add new features to the plugin and want to validate diagnostics end-to-end.

## 1. Install dependencies and build the plugin

```sh
npm install
npm run build
```

> Running `npm install` at the repo root hoists the local `@knighted/jsx` runtime (declared as a `file:` devDependency) into `node_modules`, which is critical for tsserver to see the updated `jsx-runtime` types while you iterate. The `build` script then emits `packages/plugin/dist/` so TypeScript can load the plugin through the standard `plugins` section in the fixture tsconfig. Re-run the build whenever you change the source in `packages/plugin/src/`.

## 2. Set up the fixture workspace

```sh
cd packages/fixtures
npm install
```

The fixture’s `package.json` already points `@knighted/jsx-ts-plugin` to `file:../plugin` and `@knighted/jsx` to `file:../../jsx`, so it will consume both your local plugin build and your local runtime build automatically. Because `tsconfig.json` sets `jsxImportSource` to `@knighted/jsx`, no additional `paths` overrides or stub files are required for DOM diagnostics.

## 3. Open the fixture in VS Code

1. Launch VS Code with the repo root (or directly inside `packages/fixtures`).
2. Run **TypeScript: Select TypeScript Version** and choose **Use Workspace Version** so `tsserver` loads the TypeScript we ship in `node_modules` (the plugin is compiled/tested against that version).
3. Open `packages/fixtures/src/view.ts` to trigger the plugin.
4. After building the plugin, run **TypeScript: Restart TS Server** to reload the plugin without restarting VS Code.

You should now see diagnostics (red squiggles) driven by the plugin whenever the DOM + React badge example contains invalid props or type mismatches.

## 4. Optional CLI sanity check

Remember that plain `tsc --noEmit` does **not** load language-service plugins. If you want to ensure the fixture still compiles without extra transforms, run:

```sh
npx tsc --noEmit -p packages/fixtures/tsconfig.json
```

This only exercises baseline TypeScript types, but it is useful for catching regressions unrelated to the plugin itself.

## 5. Troubleshooting checklist

- Did you rerun `npm run build` after editing the plugin source?
- Is VS Code using the workspace TypeScript version (Command Palette → _TypeScript: Select TypeScript Version_)?
- Did you restart the TS server (Command Palette → _TypeScript: Restart TS Server_) after rebuilding?
- Does the Problems panel list diagnostics with file paths under `packages/fixtures/src`? If not, open the output channel **TypeScript** to inspect plugin load errors.

Following this loop keeps fixture testing quick and repeatable, and mirrors the exact steps end users will perform when enabling the plugin in their editors.
