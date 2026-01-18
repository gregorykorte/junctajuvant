
// .eleventy.js (ESM)
import EleventyHandlebars from "@11ty/eleventy-plugin-handlebars";
import handlebars from "handlebars";

export default function (eleventyConfig) {

    // Static assets passthrough: src/static/* → /
  eleventyConfig.addPassthroughCopy({ "src/static": "/" });

  // Admin CMS passthrough: /admin → /admin
  eleventyConfig.addPassthroughCopy({ "admin": "admin" });

  // Handlebars templating
  eleventyConfig.addPlugin(EleventyHandlebars, { handlebars });

  // Static assets passthrough: src/static/* → /
  eleventyConfig.addPassthroughCopy({ "src/static": "/" });

  // (Optional) Watch static for changes during dev
  eleventyConfig.addWatchTarget("src/static");

  return {
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes",
      layouts: "_layouts",
      data: "_data",
    },
    // Allow .hbs plus your content types
    templateFormats: ["md", "html", "hbs", "njk"],
  };
}

