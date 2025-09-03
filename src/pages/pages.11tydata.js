export default {
  layout: "base.hbs",
  eleventyComputed: {
    // Pretty URLs: /<slug>/
    permalink: (data) => `/${data.page.fileSlug}/`,
    // Optional: expose a 'page' tag for filtering or nav
    tags: ["page"]
  }
};
