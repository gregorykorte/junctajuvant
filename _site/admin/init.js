// admin/init.js
(function boot() {
  if (window.CMS && CMS.init) {
    CMS.init({ config: '/admin/config.yml' });
  } else {
    // Try again shortly in case the bundle is still parsing
    setTimeout(boot, 50);
  }
})();
