/**
 * Tells the frontend which cache tags to revalidate after a write.
 *
 * Fire-and-forget by contract: the firm saving a page must not fail because
 * the frontend's revalidation endpoint is down.
 */
export interface IRevalidator {
  readonly name: string;
  revalidate(tags: readonly string[]): Promise<void>;
}
