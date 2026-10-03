export function database(env) {
  if (!env.DB) throw new Error('Forum database binding is unavailable');
  return env.DB;
}
