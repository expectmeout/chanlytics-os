export function cacheHitOf(t) {
  const fed = t.input + t.cache_read + t.cache_creation;
  return fed > 0 ? t.cache_read / fed : null;
}
