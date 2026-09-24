/**
 * Bot checking on the public forms.
 *
 * Verification happens before anything is written, so a failed check costs the
 * database nothing. The credential-free driver accepts a fixed token, which is
 * what lets the whole form path be tested without a network call.
 */

export interface ICaptcha {
  readonly name: string;
  /** True when the token is genuine. Never throws for a failed check. */
  verify(token: string, remoteIp?: string): Promise<boolean>;
}
