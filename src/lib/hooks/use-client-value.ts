import { useSyncExternalStore } from 'react';

// Nothing to subscribe to: these values don't change while the page is open
// (or not in a way worth re-rendering for). Module-level so it's stable.
const subscribeNever = () => () => {};

/**
 * A value only the browser knows — local time, platform, "are we on the
 * client". The server render (and hydration) uses `serverValue`; React then
 * renders the browser's value without an extra effect-and-setState pass.
 *
 * `getValue` must return a primitive (or a stable reference): React calls it
 * on every render and compares with Object.is.
 */
export function useClientValue<T>(getValue: () => T, serverValue: T): T {
  return useSyncExternalStore(subscribeNever, getValue, () => serverValue);
}

/** True in the browser, false during server rendering and hydration. */
export function useIsClient(): boolean {
  return useClientValue(() => true, false);
}
