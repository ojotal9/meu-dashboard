/* Browser interactions only; business rules and data access live in Python. */
(() => {
  const root = document.documentElement;
  try { root.dataset.theme = localStorage.getItem('vilapack-theme') || 'light'; } catch (_) {}
  document.querySelectorAll('[data-theme-toggle]').forEach(button => button.addEventListener('click', () => {
    root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('vilapack-theme', root.dataset.theme); } catch (_) {}
  }));
  const closeMenu = () => {
    document.body.classList.remove('menu-open');
    document.querySelector('[data-toggle-menu]')?.setAttribute('aria-expanded', 'false');
  };
  document.querySelector('[data-toggle-menu]')?.addEventListener('click', event => {
    const open = document.body.classList.toggle('menu-open');
    event.currentTarget.setAttribute('aria-expanded', String(open));
  });
  document.querySelector('[data-close-menu]')?.addEventListener('click', closeMenu);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(); });
  document.querySelectorAll('[data-submit]').forEach(input => input.addEventListener('change', () => input.form.requestSubmit()));
  document.querySelectorAll('[data-dismiss]').forEach(button => button.addEventListener('click', () => button.closest('.flash').remove()));
  const updateInstallments = form => {
    const payment = form.elements.forma_pagamento;
    const installments = form.elements.parcelas;
    if (!payment || !installments) return;
    installments.disabled = payment.value !== 'cartao_credito';
    if (installments.disabled) installments.value = 1;
  };
  document.querySelectorAll('select[name="forma_pagamento"]').forEach(select => {
    select.addEventListener('change', () => updateInstallments(select.form));
    updateInstallments(select.form);
  });
  document.querySelectorAll('[data-open]').forEach(button => button.addEventListener('click', () => {
    const dialog = document.getElementById(button.dataset.open);
    const form = dialog.querySelector('form');
    form?.reset();
    if (form?.elements.id) form.elements.id.value = '';
    if (form?.elements.email) form.elements.email.readOnly = false;
    if (form?.elements.password) form.elements.password.required = true;
    if (form) updateInstallments(form);
    dialog.showModal();
  }));
  document.querySelectorAll('[data-edit]').forEach(button => button.addEventListener('click', () => {
    const row = JSON.parse(button.dataset.edit);
    const dialog = document.getElementById(button.dataset.target);
    const form = dialog.querySelector('form');
    form.reset();
    for (const [key, value] of Object.entries(row)) {
      const input = form.elements.namedItem(key);
      if (input && 'value' in input) input.value = value ?? '';
    }
    if (button.dataset.target === 'user-form') {
      form.elements.email.readOnly = true;
      form.elements.password.required = false;
      form.querySelectorAll('[name="paginas"]').forEach(input => input.checked = (row.paginas_permitidas || []).includes(input.value));
      form.querySelectorAll('[name="sem_remover"]').forEach(input => input.checked = (row.acoes_restritas?.[input.value] || []).includes('remover'));
    }
    updateInstallments(form);
    dialog.showModal();
  }));
  document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
  const confirmDialog = document.getElementById('confirm-dialog');
  let pendingForm = null;
  document.querySelectorAll('form[data-confirm]').forEach(form => form.addEventListener('submit', event => {
    if (form.dataset.confirmed === 'true') return;
    event.preventDefault();
    pendingForm = form;
    confirmDialog.querySelector('[data-confirm-message]').textContent = form.dataset.confirm;
    confirmDialog.showModal();
  }));
  confirmDialog?.querySelector('[data-confirm-yes]').addEventListener('click', () => {
    if (pendingForm) {
      pendingForm.dataset.confirmed = 'true';
      pendingForm.requestSubmit();
      confirmDialog.close();
    }
  });
  // Refresh idle Supabase views so changes made by teammates become visible.
  if (document.body.dataset.liveUpdates === 'true') {
    let lastActivity = Date.now();
    ['input','keydown','pointerdown'].forEach(event => document.addEventListener(event, () => lastActivity = Date.now()));
    setInterval(() => { if (!document.hidden) fetch('/pulso', { credentials: 'same-origin' }).catch(() => {}); }, 45000);
    setInterval(() => {
      if (!document.hidden && !document.querySelector('dialog[open]') && Date.now() - lastActivity > 60000) location.reload();
    }, 65000);
  }
})();
