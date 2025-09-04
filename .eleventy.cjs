// .eleventy.js
module.exports = function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy({ "src/static": "static" }); // → _site/static/*
  eleventyConfig.addPassthroughCopy({ "src/static/assets": "assets" });
  return {
    dir: { input: "src", includes: "_includes", layouts: "_layouts", data: "_data", output: "_site" },
  };
};
