// Read-only: prints how Messenger structures the open chat, so the export script can be tuned.
(() => {
  const root = document.querySelector('[role="main"]') ?? document.body;
  const roleCount = r => root.querySelectorAll(`[role="${r}"]`).length;
  console.log('row:', roleCount('row'), 'grid:', roleCount('grid'), 'gridcell:', roleCount('gridcell'), 'heading:', roleCount('heading'));
  const leaves = [...root.querySelectorAll('*')].filter(e =>
    ![...e.children].some(c => c.textContent.trim()) && /szept|okt|\d{1,2}:\d{2}/i.test(e.textContent) && e.textContent.trim().length < 60);
  console.log(leaves.slice(0, 20).map(e => {
    const roles = []; for (let p = e; p && p !== root; p = p.parentElement) if (p.getAttribute('role')) roles.push(p.getAttribute('role'));
    return `${JSON.stringify(e.textContent.trim())}  <${e.tagName.toLowerCase()}> roles: ${roles.join(' > ') || '-'}`;
  }).join('\n'));
})();
