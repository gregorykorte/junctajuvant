# Juncta Juvant · Eleventy starter

## Quickstart
```bash
npm install
npm run dev   # http://localhost:8080
# or build:
npm run build
```

## Notes
- `admin/` and `functions/` are passed through to the output so Sveltia CMS and your auth proxy keep working.
- Root assets moved to `src/assets/` and are available at `/assets/<filename>`.
- `src/_includes/layouts/base.hbs` wraps your original `<head>`; `src/index.html` contains the original body content.
