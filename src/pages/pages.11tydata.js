// src/pages/pages.11tydata.js
export default {
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
