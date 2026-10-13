// Apply the theme before first paint to avoid a flash (external file to satisfy the CSP).
(function () {
  var t = localStorage.getItem('theme');
  var dark = t === 'dark' || ((!t || t === 'system') && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
})();
