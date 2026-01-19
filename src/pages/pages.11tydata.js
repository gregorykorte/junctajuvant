// src/pages/pages.11tydata.js
export default {
  // Default layout for all pages in src/pages
  layout: "page",

  // Control where pages are written
  permalink: (data) => {
    const slug = (data.slug || "").trim();
    const fileSlug = data.page?.fileSlug;

    // Home page
    if (fileSlug === "index" || slug === "index") {
      return "/";
    }

    // Normal pages
    return `/${slug || fileSlug}/`;
  },
};
