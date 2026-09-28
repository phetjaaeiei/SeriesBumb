import { authClient } from '../lib/client/auth-client';
import { renderTurnstile, type TurnstileWidget } from '../lib/client/turnstile';

const button = document.querySelector<HTMLButtonElement>('[data-google-login]');
const challenge = document.querySelector<HTMLElement>('[data-turnstile-sitekey]');
let turnstileToken: string | null = null;
let widget: TurnstileWidget | null = null;

if (button && challenge?.dataset.turnstileSitekey) {
  // Turnstile is configured: sign-in waits for a token and sends it for the server to verify.
  button.disabled = true;
  renderTurnstile(challenge, challenge.dataset.turnstileSitekey, (token) => {
    turnstileToken = token;
    button.disabled = !token;
  }).then((rendered) => { widget = rendered; }).catch(() => { button.disabled = true; });
}

button?.addEventListener('click', async () => {
  // A Turnstile token is redeemed by the server on first use, so it is never sent twice.
  const token = turnstileToken;
  turnstileToken = null;
  button.disabled = true;
  try {
    const result = await authClient.signIn.social({
      provider: 'google',
      callbackURL: button.dataset.next || '/',
      errorCallbackURL: '/login?error=1',
      fetchOptions: token ? { headers: { 'x-turnstile-token': token } } : undefined,
    });
    if (result.error) throw new Error(result.error.message);
    // Success: the browser is navigating to Google. The button stays disabled so a second click
    // cannot race that navigation.
  } catch {
    window.location.assign('/login?error=1');
  }
});

// Back from Google restores this page from the back/forward cache with the button still disabled.
window.addEventListener('pageshow', (event) => {
  if (!event.persisted || !button) return;
  if (widget) widget.reset();
  else if (!challenge?.dataset.turnstileSitekey) button.disabled = false;
});
