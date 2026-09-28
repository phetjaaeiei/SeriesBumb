import { authClient } from '../lib/client/auth-client';
import { renderTurnstile } from '../lib/client/turnstile';

const button = document.querySelector<HTMLButtonElement>('[data-google-login]');
const challenge = document.querySelector<HTMLElement>('[data-turnstile-sitekey]');
let turnstileToken: string | null = null;

if (button && challenge?.dataset.turnstileSitekey) {
  // Turnstile is configured: sign-in waits for a token and sends it for the server to verify.
  button.disabled = true;
  void renderTurnstile(challenge, challenge.dataset.turnstileSitekey, (token) => {
    turnstileToken = token;
    button.disabled = !token;
  }).catch(() => { button.disabled = true; });
}

button?.addEventListener('click', async () => {
  button.disabled = true;
  try {
    const result = await authClient.signIn.social({
      provider: 'google',
      callbackURL: button.dataset.next || '/',
      errorCallbackURL: '/login?error=1',
      fetchOptions: turnstileToken ? { headers: { 'x-turnstile-token': turnstileToken } } : undefined,
    });
    if (result.error) throw new Error(result.error.message);
  } catch {
    window.location.assign('/login?error=1');
  } finally {
    button.disabled = Boolean(challenge?.dataset.turnstileSitekey && !turnstileToken);
  }
});
