import { logger } from '../../core/logger.js';
import type { ICaptcha } from '../../interfaces/integrations/captcha.interface.js';

/**
 * Cloudflare Turnstile.
 *
 * A network failure is treated as a *failed* check rather than a passed one:
 * if the bot wall is unreachable, the safe answer is to refuse, and a visitor
 * who retries a minute later succeeds. Failing open would turn one outage at
 * Cloudflare into an open spam relay.
 */
const ENDPOINT = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

interface VerifyResponse {
  success?: unknown;
}

export function createTurnstileCaptcha(
  secretKey: string,
  fetchImpl: typeof fetch = fetch
): ICaptcha {
  return {
    name: 'turnstile',

    async verify(token: string, remoteIp?: string): Promise<boolean> {
      if (token.trim() === '') return false;

      const form = new URLSearchParams({ secret: secretKey, response: token });
      if (remoteIp !== undefined) form.set('remoteip', remoteIp);

      try {
        const response = await fetchImpl(ENDPOINT, { method: 'POST', body: form });
        if (!response.ok) return false;

        const body = (await response.json()) as VerifyResponse;
        return body.success === true;
      } catch (error: unknown) {
        logger.warn({ err: error }, 'turnstile verification failed to complete');
        return false;
      }
    },
  };
}
