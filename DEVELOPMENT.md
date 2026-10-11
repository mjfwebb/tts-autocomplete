# Development

This file is for people who work on the extension. To install it, see the [README](README.md).

## Commands

1. Install the dependencies with `pnpm install`.
2. Run the tests with `pnpm test`, and the type check with `pnpm typecheck`.
3. Run the linter with `pnpm lint`. The project uses oxlint.
4. Format the code with `pnpm format`. The project uses oxfmt. `pnpm format:check` only reports problems.
5. Check for dead code and duplication with `pnpm fallow:check`. The project uses fallow. `pnpm fallow` shows the full report, including complexity.
6. Start a development browser with `pnpm dev`, or with `pnpm dev:firefox` for Firefox.
7. After you change `assets/icon.svg`, run `pnpm icons` to render the PNG icons again.

To make a production build, run `pnpm build` for Chrome and Brave, `pnpm build:firefox` for Firefox, or `pnpm build:userscript` for the userscript. The output goes to `.output/`. To make a zip file for a store upload, run `pnpm zip` or `pnpm zip:firefox`.

The CI workflow in `.github/workflows/ci.yml` runs on every push to `main` and on every pull request. It runs lint, the format check, fallow, the type check, the tests and both builds.

## Releases

1. Make sure that `main` is up to date and that you have no uncommitted changes.
2. Run `npm version patch -m "Release v%s"`. Use `minor` or `major` instead of `patch` for a bigger change, or give an exact version such as `0.2.0`.
3. Push the commit and the tag with `git push --follow-tags`.

Step 2 changes the version in `package.json`, commits it with a message such as "Release v0.2.0", and creates the matching tag, such as `v0.2.0`. npm comes with Node.js, and it refuses to run if you have uncommitted changes.

The tag starts the release workflow in `.github/workflows/release.yml`. It runs the CI checks and makes sure that the tag matches the version in `package.json`. Then it builds the Chrome and Firefox zips and the userscript, and attaches them to a new GitHub release with generated notes. If the tag and the version do not match, the workflow stops before it creates a release.

The Firefox zip is not signed, so Firefox only installs it as a temporary add-on.

## Layout

| Path                          | Contents                                                                                |
| ----------------------------- | --------------------------------------------------------------------------------------- |
| `src/modifiers.ts`            | The modifier table. Its patterns match the server's syntax.                             |
| `src/parser.ts`               | Token classification, completions and argument hints.                                   |
| `entrypoints/background.ts`   | Fetches and caches the voice and sound names.                                           |
| `src/meta.ts`                 | The fetch and cache logic.                                                              |
| `src/app.ts`                  | The autocomplete itself. The extension and the userscript both run it.                  |
| `userscript/main.ts`          | The userscript version. It uses the userscript manager for requests and storage.        |
| `scripts/build-userscript.ts` | Builds the userscript and its `==UserScript==` header.                                  |
| `entrypoints/content.ts`      | The content script for twitch.tv. It starts `src/app.ts`.                               |
| `src/editor.ts`               | Reads and replaces text in the chat input.                                              |
| `src/types.ts`                | The data types and the message name shared by both scripts.                             |
| `src/popup.ts`                | The suggestion popup.                                                                   |
| `tests/`                      | Unit tests for the parser and for the fetch and cache logic.                            |
| `assets/icon.svg`             | Source for the PNG icons in `public/icon/`. It uses the Segoe UI Black font.            |
| `scripts/build-icons.ts`      | Renders the icon SVG to PNG. It falls back to Arial Black if Segoe UI Black is missing. |

## How text goes into the chat box

Twitch uses Slate for the chat input. Slate keeps its own copy of the text and only updates it from `beforeinput` events. `document.execCommand("insertText")` does not fire `beforeinput`, so Slate ignores it and the editor breaks on the next keystroke.

For a contenteditable editor, `src/editor.ts` sets the DOM selection, waits for the browser to fire `selectionchange`, and then dispatches a synthetic `beforeinput` event. Slate handles that event and replaces the selected text. If no editor cancels the event, the code falls back to `execCommand`. For a plain textarea, it uses `execCommand` directly.

The key handler runs in the capture phase on `window` and starts at `document_start`. It takes Tab, Enter, Escape and the arrow keys only while the popup shows suggestions. Enter accepts a suggestion only after you pick one with the arrow keys, so Enter still sends the message. This behavior was tested in Chromium with BetterTTV, FrankerFaceZ and 7TV, one at a time and all together. The tests ran while logged out of Twitch, so the emote extensions' own Tab completion did not compete with the popup.
