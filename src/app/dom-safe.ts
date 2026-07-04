/**
 * File: utils/dom-safe.ts
 * Purpose: Safe, strongly typed DOM querying and assertion helper functions.
 */

/**
 * Safely query an element by ID with a target type, returning null if not found.
 */
export function byId<T extends HTMLElement>(id: string): T | null {
  if (typeof document === 'undefined') return null;
  const element = document.getElementById(id);
  return element ? (element as T) : null;
}

/**
 * Asserts that an element is non-null and is an instance of the target type.
 * Throws a clean error if validation fails.
 */
export function assertElement<T extends HTMLElement>(
  element: Element | null,
  typeConstructor?: new () => T
): T {
  if (!element) {
    throw new TypeError('DOM assertion failed: Element is null or undefined.');
  }
  if (typeConstructor && !(element instanceof typeConstructor)) {
    throw new TypeError(
      `DOM assertion failed: Element is not an instance of ${typeConstructor.name}.`
    );
  }
  return element as T;
}
