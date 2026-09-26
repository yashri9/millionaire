/**
 * Finds the slide where the most viewers left, measured as the largest drop
 * in views from the slide before it. Returns its index in `views`, or null
 * when views never fall (or there are fewer than two slides).
 */
export function findLargestDropoff(views: readonly number[]): number | null {
  let worstIndex: number | null = null;
  let worstDrop = 0;
  for (let i = 1; i < views.length; i++) {
    const drop = views[i - 1]! - views[i]!;
    if (drop > worstDrop) {
      worstDrop = drop;
      worstIndex = i;
    }
  }
  return worstIndex;
}
