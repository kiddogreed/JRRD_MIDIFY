# JRRD_MIDIFY

A single-page web application that converts MP3/WAV audio into detailed,
complete MIDI files — fully client-side in the browser.

## Status

🚧 Under active, incremental development. See [changelog.md](./changelog.md)
for the current progress, architecture decisions, and next steps.

## Running locally

This is a static, no-build site. Any static file server works, for example:

```bash
npx serve .
# or
python -m http.server 8080
```

Then open the printed local URL in your browser.

## Deployment

See [github_pages_hosting_guide.md](./github_pages_hosting_guide.md) for
GitHub Pages hosting steps. Note: the sample `app.js` pitch-detection code
in that guide is a historical scaffold and is **not** the engine actually
used by this project — see [changelog.md](./changelog.md) for the real
architecture.
