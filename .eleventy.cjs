const handlebars = require("handlebars");

module.exports = function(eleventyConfig) {
  eleventyConfig.setLibrary("hbs", handlebars);
  // passthrough for assets if/when you add them:
  eleventyConfig.addPassthroughCopy({ "src/static/assets": "assets" });

  return {
    htmlTemplateEngine: "hbs",
    markdownTemplateEngine: "hbs",
    templateFormats: ["html","md","hbs"],
    dir: {
      input: "src",
      includes: "_includes",          // => src/_includes
      layouts: "_includes",           // so layout: base.hbs resolves to src/_includes/base.hbs
      output: "_site",
    },
  };
};
