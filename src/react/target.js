const hash = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
};

export function targetIdentity(targetKey, initial) {
  if (targetKey !== undefined && targetKey !== null) return String(targetKey);
  return hash(JSON.stringify(initial ?? null));
}
