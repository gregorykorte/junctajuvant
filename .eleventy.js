import handlebars from "handlebars";
import handlebarsPlugin from "@11ty/eleventy-plugin-handlebars";

export default function(eleventyConfig) {
  // Register official Handlebars plugin (required in Eleventy v3)
  eleventyConfig.addPlugin(handlebarsPlugin, {
    eleventyLibraryOverride: handlebars,
  });

  // Copy any static assets as-is (adjust as you add files)
  eleventyConfig.addPassthroughCopy({ "src/static/assets": "assets" });
  eleventyConfig.addPassthroughCopy({ "src/static/robots.txt": "robots.txt" });
  eleventyConfig.addPassthroughCopy({ "src/static/site.webmanifest": "site.webmanifest" });
  // add more passthroughs as you restore assets

  return {
    htmlTemplateEngine: "hbs",
    markdownTemplateEngine: "hbs",
    templateFormats: ["html","md","hbs"],
    dir: {
      input: "src",
      includes: "_includes",     // partials live here
      layouts: "_layouts",       // layouts live here (so layout: base.hbs works)
      output: "_site",
    },
  };
}
