// .eleventy.js
import handlebars from "handlebars";

export default function(eleventyConfig) {
  // Ensure Eleventy knows how to render .hbs
  eleventyConfig.setLibrary("hbs", handlebars);

  return {
    htmlTemplateEngine: "hbs",
    markdownTemplateEngine: "hbs",
    templateFormats: ["html", "md", "hbs"],
    dir: {
      input: "src",                  // ./src
      includes: "_includes",         // ./src/_includes
      layouts: "_includes/layouts",  // ./src/_includes/layouts
      output: "_site",
    },
  };
}
