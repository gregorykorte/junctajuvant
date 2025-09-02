export default function (cfg) {
  // Passthrough: admin (Sveltia CMS) and functions (Pages Functions)
  cfg.addPassthroughCopy({ "admin": "admin" });
  cfg.addPassthroughCopy({ "functions": "functions" });
  // Also passthrough root-level assets we placed in src/assets
  // (Anything under src/assets is served as /assets/...)
  return {
    dir: { input: "src", includes: "_includes", output: "_site" }
  };
}
