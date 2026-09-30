# Security policy

## Scope

Team Map Recorder is a static, client-only application. It has no account system,
server-side database, API keys, or application backend. Board data stays in the
browser unless the user explicitly exports a JSON or PNG file.

## Defensive controls

- Only PNG and JPEG uploads with valid file signatures are accepted.
- Images are limited to 10 MB, 8192 px per side, and 32 million pixels.
- Imported board files are limited to 16 MB and 1000 total objects.
- Imported values are reconstructed from an allowlist. IDs, coordinates, colors,
  fonts, sizes, rotations, scales, and text lengths are validated and bounded.
- External image URLs, SVG data, scripts, HTML, and unknown board versions are not
  accepted by the import path.
- The static page uses a restrictive Content Security Policy and no-referrer policy.
- Deployment actions are pinned to commit SHAs; dependency audit, lint, and build
  checks must pass before GitHub Pages deployment.

## Operational limits

GitHub Pages does not allow repository-defined HTTP response headers. The project
therefore enforces CSP through HTML metadata, while transport security and caching
remain controlled by GitHub Pages. Because the app has no authentication or remote
state-changing actions, clickjacking has limited impact, but it cannot be fully
blocked without moving to a host that supports response headers.

## Reporting

Do not include private maps or exported board files in a public issue. Report a
security problem through the repository's private security advisory workflow when
available, and include only a minimal reproduction.
