import { authClient } from '../lib/client/auth-client';

const button = document.querySelector<HTMLButtonElement>('[data-google-login]');
button?.addEventListener('click', async () => {
  button.disabled = true;
  try {
    const result = await authClient.signIn.social({
      provider: 'google',
      callbackURL: button.dataset.next || '/',
      errorCallbackURL: '/login?error=1',
    });
    if (result.error) throw new Error(result.error.message);
  } catch {
    window.location.assign('/login?error=1');
  } finally {
    button.disabled = false;
  }
});
