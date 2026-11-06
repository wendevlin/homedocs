# Homedocs

Document your home with Markdown, right inside Home Assistant.

Homedocs is a Home Assistant app (formerly add-on) that runs behind ingress. It shows the markdown files in its app configuration folder (`/addon_configs/<repo>_homedocs`, e.g. via Samba or Studio Code Server) as a documentation site. Users who are allowed to edit can change pages in the browser.

- **Reads files on demand.** There is no build step and no file watcher. Every page load reads the current markdown from disk.
- **Edit in the browser.** There's a visual editor ([Milkdown Crepe](https://milkdown.dev)) and a markdown mode ([CodeMirror](https://codemirror.net)). You can attach files and create, rename, move, reorder and delete pages and folders.
- **Live collaboration.** When someone edits a page, it's locked for everyone else, and they see who is editing. If the file changed on disk in the meantime (e.g. via Studio Code Server), saving asks whether to overwrite it or discard your changes.
- **Permissions.** Everyone who can open the app can read. Home Assistant administrators can always edit, and they choose on the *Users* page which other users can edit too.
- **PDF export.** Print a single page or all pages, or save them as PDF.
- **Share links with QR codes.** Administrators can share a single page with a signed link, e.g. as a QR code stuck on a device. The link opens the page without a Home Assistant login. Links can be disabled or deleted at any time on the *Sharing* page, which every administrator sees.

## How it works

| Part | Tech |
| --- | --- |
| Server (`packages/server`) | `Bun.serve` routes + WebSocket pub/sub, `bun:sqlite`, `Bun.file`/`Bun.write`, `Bun.YAML`, `Bun.CryptoHasher` |
| Frontend (`packages/web`) | SvelteKit (hash router, static SPA), Svelte 5, shadcn-svelte, Tailwind |
| Markdown | unified/remark → rehype-sanitize (raw HTML allowed, scripts never) |
| Shared types (`packages/shared`) | API and WebSocket message types |

**Ingress.** Home Assistant serves the app under `/api/hassio_ingress/<token>/`. The frontend therefore uses hash routing and only relative URLs. The server only accepts requests from the Supervisor (`172.30.32.2`), and it reads the user from the `X-Remote-User-*` headers the Supervisor sets. Admin status comes from Home Assistant's `config/auth/list`, which needs `homeassistant_api: true`.

**Files.**
- Folder order is stored in a `.homedocs-order.json` per folder. Reordering never touches markdown files.
- Attachments are stored in an `attachments/` folder next to the page and linked relatively, so links also work in other editors.
- When a page or folder is moved, relative links inside the moved pages are rewritten so they keep working.
- Editor permissions, share links and settings are stored in `/data/homedocs.db`.

**Share links.** A second listener on port `8098` serves shared pages and nothing else: no tree, no user, no editing, no websocket. It serves the frontend, the page of an enabled share link and only the files that page links to or embeds (never other markdown files).
- A link is `<base>/s/<id>.<signature>`. The id is random and stored in the database, the signature is an HMAC of the id with a secret in `/data`. Badly signed tokens are rejected before the database is queried. Unknown, disabled and deleted links all answer the same 404.
- Links follow their page when it is renamed or moved, and are deleted with it.
- **Local** links use the host's primary IP and the host port the share port is mapped to, both from the Supervisor API. **Remote** links use a URL an admin sets on the *Sharing* page (e.g. a reverse proxy or tunnel to port 8098). *Check* asks `<url>/.well-known/homedocs-share` for this installation's id, so it only succeeds if the URL really reaches this app.
- Nothing may be indexed: both listeners serve `robots.txt` with `Disallow: /`, the share listener sends `X-Robots-Tag: noindex, nofollow, …` and `Referrer-Policy: no-referrer` on every response, and the page has a `noindex` meta tag.

## Development

```sh
bun install
bun run dev        # server on :8099 (dev user "dev-admin") + Vite on :5173
bun test           # server tests
bun run typecheck
```

To test the app the way Home Assistant serves it (path prefix, user headers, WebSocket proxying):

```sh
bun run dev:ingress                                          # builds and starts the server
bun run ingress-proxy --port 8100 --user dev-admin --name "Dev Admin"
bun run ingress-proxy --port 8101 --user dev-user --name "Dev User"
# open http://localhost:8100/api/hassio_ingress/test123/ and :8101 in another browser
```

Without `SUPERVISOR_TOKEN`, the server uses fake Home Assistant users (`dev-admin`, `dev-user`, `dev-guest`). Docs and data go to `.dev/`.

## Docker image

```sh
docker build -t homedocs .
```

The server is bundled into a single file with `bun build`, so the image needs no `node_modules`. Supported architectures are `amd64` and `aarch64`, the platforms Bun supports.

The app configuration (`config.yaml`) lives in the [homeassistant-addons](https://github.com/wendevlin/homeassistant-addons) repository. It needs `ingress: true`, `ingress_port: 8099`, `homeassistant_api: true`, `hassio_api: true` (to detect the local share URL) and the share port:

```yaml
ports:
  8098/tcp: 8098
ports_description:
  8098/tcp: Share links (only shared pages, no login)
```

Users can disable the share port in the app's network settings; local links are then unavailable and the share dialog says so. It also needs these maps:

```yaml
map:
  - type: app_config        # the docs, mounted at /config
    read_only: false
  - type: homeassistant_config  # read-only, only to migrate docs from Homedocs 3.x
```

### Migrating from Homedocs 3.x

Homedocs 3.x kept the docs in the Home Assistant config folder (`/config/homedocs`). That isn't best practice for apps, so 4.x keeps them in its own app configuration folder instead.

On the first start of 4.x, the old folder is copied over once. It is mounted read-only and left untouched, and admins get a notice that it can be deleted. Whether this already happened is stored in `/data/state.json`, so it never runs twice.

Because there's no way to force users through a specific version:

- 4.0.0 is listed in `breaking_versions`, so nobody is switched over by auto-update without reading the changelog.
- The read-only `homeassistant_config` map is temporary. It gets removed a few months after 4.0.0, and that release's changelog says so.
- After it's removed, users who skipped every version in between have to copy `/config/homedocs` to `/addon_configs/<repo>_homedocs` themselves. The app can't detect this case, because fresh and old installs look the same.

Removing the map only needs a `config.yaml` change. If `/homeassistant/homedocs` doesn't exist, the migration step does nothing, so no code change is needed.

## Roadmap

- External access on its own port with Home Assistant OAuth login. Auth is pluggable through `AuthResolver` in `packages/server/src/auth.ts`, so another listener can reuse every route.
- Search, and a table of contents.
