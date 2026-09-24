import { createCaptcha } from '../integrations/captcha/index.js';
import type { ICaptcha } from '../interfaces/integrations/captcha.interface.js';

/**
 * The captcha, behind a setter so tests can swap it.
 *
 * Resolved lazily rather than at import time, so `config` is read when the
 * first form arrives instead of when the module graph loads.
 */
let captcha: ICaptcha | undefined;

export function setCaptcha(next: ICaptcha | undefined): void {
  captcha = next;
}

export function verifyCaptcha(token: string, remoteIp?: string): Promise<boolean> {
  captcha ??= createCaptcha();
  return captcha.verify(token, remoteIp);
}
