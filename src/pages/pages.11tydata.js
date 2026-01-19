// src/pages/pages.11tydata.js
export default {
  layout: "page",

  permalink: (data) => {
    const slug = (data.slug || "").trim();
    const fileSlug = data.page?.fileSlug;

    if (fileSlug === "index" || slug === "index") return "/";
    return `/${slug || fileSlug}/`;
  },
};
