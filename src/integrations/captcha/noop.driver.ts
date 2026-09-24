import type { ICaptcha } from '../../interfaces/integrations/captcha.interface.js';

/**
 * The credential-free default: any non-empty token passes.
 *
 * Not "always true": an empty token still fails, so a frontend that forgets to
 * send one fails in development rather than at the first production
 * deployment, when Turnstile is switched on.
 */
export const noopCaptcha: ICaptcha = {
  name: 'noop',

  verify(token: string): Promise<boolean> {
    return Promise.resolve(token.trim() !== '');
  },
};
