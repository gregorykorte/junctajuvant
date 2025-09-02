// .eleventy.js
export default function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy({ "admin": "admin" });
}
