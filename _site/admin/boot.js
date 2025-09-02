// admin/boot.js
// Must load BEFORE decap-cms.js
window.CMS_MANUAL_INIT = true;

// Shim: capture GitHub OAuth token message, persist to localStorage, then reload
(function () {
  var PREFIX = 'authorization:github:success:';
  window.addEventListener('message', function (e) {
    var msg = e && e.data;
    if (typeof msg === 'string' && msg.indexOf(PREFIX) === 0) {
      try {
        var payload = JSON.parse(msg.slice(PREFIX.length));
        if (payload && payload.token) {
          var userObj = { token: payload.token };
          localStorage.setItem('decap-cms-user', JSON.stringify(userObj));
          localStorage.setItem('netlify-cms-user', JSON.stringify(userObj)); // compatibility
          location.replace(location.pathname + location.search + location.hash);
        }
      } catch (err) {
        console.error('OAuth token parse error:', err);
      }
    }
  }, false);
})();
