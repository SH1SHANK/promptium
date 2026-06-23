/**
 * File: types/errors.ts
 * Purpose: Unified Result<T> pattern for standardized error boundaries.
 */

export type Result<T> =
  | { success: true; data: T }
  | { success: false; error: string };

export function makeSuccess<T>(data: T): Result<T> {
  return { success: true, data };
}

export function makeFailure<T>(error: string | Error): Result<T> {
  return {
    success: false,
    error: typeof error === 'string' ? error : error.message || 'An unexpected error occurred.',
  };
}
