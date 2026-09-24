import { config } from '../../config/env.js';
import { noopCaptcha } from './noop.driver.js';
import { createTurnstileCaptcha } from './turnstile.driver.js';
import type { ICaptcha } from '../../interfaces/integrations/captcha.interface.js';

/** Picks the captcha driver from config. */
export function createCaptcha(): ICaptcha {
  if (config.CAPTCHA_DRIVER === 'turnstile' && config.TURNSTILE_SECRET_KEY !== undefined) {
    return createTurnstileCaptcha(config.TURNSTILE_SECRET_KEY);
  }

  return noopCaptcha;
}
