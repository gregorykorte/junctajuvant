export default {
  layout: "base.hbs",
  eleventyComputed: {
    permalink: (data) => `/${data.page.fileSlug}/index.html`,
    title: (data) => data.title || data.page.fileSlug,
  },
};
