export default function (cfg) {
  // Keep Sveltia CMS admin working by copying /admin into the build output
  cfg.addPassthroughCopy({ "admin": "admin" });

  // Note: Cloudflare Pages Functions should *not* be copied —
  // they must live at the repo root in /functions (Pages picks them up directly).
  return {
    dir: {
      input: "src",         // your source directory
      includes: "_includes",
      output: "_site"       // build output
    }
  };
}
