// .eleventy.cjs
const handlebars = require("handlebars");

module.exports = function(eleventyConfig) {
  // 1) Explicitly register the library so .hbs is wired up
  eleventyConfig.setLibrary("hbs", handlebars);

  // 2) Static passthroughs (adjusted to your tree)
  eleventyConfig.addPassthroughCopy({ "src/static/assets": "assets" });
  eleventyConfig.addPassthroughCopy({ "src/static/favicon-16x16.png": "favicon-16x16.png" });
  eleventyConfig.addPassthroughCopy({ "src/static/favicon-32x32.png": "favicon-32x32.png" });
  eleventyConfig.addPassthroughCopy({ "src/static/favicon-48x48.png": "favicon-48x48.png" });
  eleventyConfig.addPassthroughCopy({ "src/static/favicon-180x180.png": "favicon-180x180.png" });
  eleventyConfig.addPassthroughCopy({ "src/static/site.webmanifest": "site.webmanifest" });
  eleventyConfig.addPassthroughCopy({ "src/static/robots.txt": "robots.txt" });
  // If you’re using host headers: eleventyConfig.addPassthroughCopy("src/_headers");

  return {
    htmlTemplateEngine: "hbs",
    markdownTemplateEngine: "hbs",
    templateFormats: ["html", "md", "hbs"],
    dir: {
      input: "src",
      includes: "_includes",          // -> src/_includes
      layouts: "_includes/layouts",   // -> src/_includes/layouts
      output: "_site",
    },
  };
};

