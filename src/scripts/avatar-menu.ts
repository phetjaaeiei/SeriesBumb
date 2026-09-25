const menu = document.querySelector<HTMLDetailsElement>('[data-account-menu]');
if (menu) {
  document.addEventListener('click', event => {
    if (event.target instanceof Node && !menu.contains(event.target)) menu.open = false;
  });
  menu.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      menu.open = false;
      menu.querySelector('summary')?.focus();
    }
  });
  menu.querySelector<HTMLButtonElement>('[data-sign-out]')?.addEventListener('click', async event => {
    const button = event.currentTarget as HTMLButtonElement;
    button.disabled = true;
    try {
      const response = await fetch('/api/auth/sign-out', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' }, body: '{}',
      });
      if (!response.ok) throw new Error('Sign-out failed');
      window.location.assign('/');
    } catch {
      button.disabled = false;
      window.alert('ออกจากระบบไม่สำเร็จ ลองอีกครั้ง');
    }
  });
}
