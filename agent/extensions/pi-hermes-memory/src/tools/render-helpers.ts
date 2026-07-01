/**
 * Duration capture helper for tool execution.
 * Wraps an async function to capture execution duration in result.details._durationS.
 */
export function withDurationCapture<T extends any[], R extends { details?: Record<string, unknown> }>(
  fn: (...args: T) => Promise<R>
): (...args: T) => Promise<R> {
  return async (...args: T): Promise<R> => {
    const t0 = Date.now();
    const result = await fn(...args);
    const durationS = (Date.now() - t0) / 1000;
    return {
      ...result,
      details: { ...(result.details ?? {}), _durationS: durationS },
    };
  };
}
