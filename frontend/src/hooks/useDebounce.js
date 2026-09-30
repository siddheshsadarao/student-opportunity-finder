/**
 * Delays a changing value.
 *
 * Used by the search boxes: without it, typing "internship" would fire ten
 * API requests -- one per keystroke. With a 400ms debounce it fires once,
 * shortly after the user stops typing.
 */
import { useEffect, useState } from 'react';

export default function useDebounce(value, delay = 400) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    // If value changes again before the delay is up, cancel the old timer.
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
