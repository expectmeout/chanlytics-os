/** A read made once per key in one tick: every asker shares its promise, and a failure is forgotten so the next asker tries again. */
export const once = <T>(m: Map<string, Promise<T>>, key: string, read: () => Promise<T>): Promise<T> => {
  let v = m.get(key);
  if (!v) {
    v = read();
    v.catch(() => m.delete(key));
    m.set(key, v);
  }
  return v;
};
