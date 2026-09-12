(() => {
  // This server-rendered app shows a pending state during internal GET navigation.
  // Mutations and download links retain their normal behavior.
  const notice = document.querySelector('.loading-notice');
  let pending, recovery;
  const reset = () => {
    clearTimeout(pending); clearTimeout(recovery);
    document.body.classList.remove('page-loading');
    document.querySelector('main')?.removeAttribute('aria-busy');
    if (notice) notice.hidden = true;
  };
  const start = () => {
    reset();
    pending = setTimeout(() => {
      document.body.classList.add('page-loading');
      document.querySelector('main')?.setAttribute('aria-busy', 'true');
      if (notice) notice.hidden = false;
      recovery = setTimeout(reset, 12000);
    }, 250);
  };
  document.addEventListener('click', event => {
    const link = event.target.closest('a[href]');
    if (!link || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || link.hasAttribute('download') || (link.target && link.target !== '_self')) return;
    const url = new URL(link.href, location.href);
    if (url.origin === location.origin && url.pathname.startsWith('/painel/') && url.href !== location.href && !url.hash) start();
  });
  document.addEventListener('submit', event => {
    const form = event.target;
    queueMicrotask(() => {
      if (!event.defaultPrevented && form.method.toLowerCase() === 'get' && !form.target) start();
    });
  });
  window.addEventListener('pageshow', reset);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') reset(); });
})();
