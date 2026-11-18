/** Stable assessment question order for a learner's numbered attempt.
 * This is a display shuffle, not cryptographic exam integrity enforcement.
 */
function seedHash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h = Math.imul(h ^ value.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}
export function orderQuestions<T extends { id: string }>(questions: readonly T[], shuffle: boolean, seed: string): T[] {
  const rows = questions.slice();
  if (!shuffle) return rows;
  return rows.sort((a,b) => seedHash(seed+":"+a.id) - seedHash(seed+":"+b.id) || a.id.localeCompare(b.id));
}
