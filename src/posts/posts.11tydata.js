// src/posts/posts.11tydata.js
export default {
  layout: "base.hbs",       // default layout for all posts
  tags: ["posts"],          // put all posts in a 'posts' collection
  eleventyComputed: {
    // permalink: e.g. /posts/my-title/
    permalink: (data) => `/posts/${data.page.fileSlug}/index.html`,
    // default title fallback
    title: (data) => data.title || data.page.fileSlug,
  },
};
