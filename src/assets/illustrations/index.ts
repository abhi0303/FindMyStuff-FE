/**
 * Illustrations are artwork only — transparent background, no text baked in.
 * The words come from the component using them, and the soft backdrop colour
 * comes from the `--illustration-bg` token, so both can change without new art.
 */
import noResults from './no-results.webp';
import searching from './searching.webp';

export const illustrations = {
  /** Someone on a laptop thinking of a search — for "start searching" states. */
  searching,
  /** Someone searching a box for their phone — for "nothing found" states. */
  noResults,
};
