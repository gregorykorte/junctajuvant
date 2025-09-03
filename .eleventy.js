import handlebars from "handlebars";

export default function(eleventyConfig) {
  eleventyConfig.setLibrary("hbs", handlebars);

  // Copy everything from src/static/* to _site/ (web root)
  eleventyConfig.addPassthroughCopy({ "src/static": "/" });

  return {
    htmlTemplateEngine: "hbs",
    markdownTemplateEngine: "hbs",
    templateFormats: ["html", "md", "hbs"],
    dir: {
      input: "src",
      includes: "_includes",
      layouts: "_includes/layouts",
      output: "_site",
    },
  };
}
