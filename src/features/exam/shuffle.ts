const utf8Encoder = new TextEncoder();

export function seededHash32(value: string): number {
  let hash = 2_166_136_261;
  for (const byte of utf8Encoder.encode(value)) {
    hash ^= byte;
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function defaultRankKey(value: unknown): string {
  if (typeof value === "string") return value;
  if (
    typeof value === "number" ||
    typeof value === "bigint" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }
  const serialized = JSON.stringify(value);
  if (serialized === undefined) throw new Error("Unsupported seeded rank value");
  return serialized;
}

export function rankBySeed<T>(
  items: readonly T[],
  seed: string,
  keyOf: (item: T) => string = defaultRankKey,
): T[] {
  return items
    .map((item, index) => {
      const key = keyOf(item);
      return {
        item,
        index,
        key,
        rank: seededHash32(`${seed}:${key}`),
      };
    })
    .sort(
      (left, right) =>
        left.rank - right.rank ||
        (left.key < right.key ? -1 : left.key > right.key ? 1 : 0) ||
        left.index - right.index,
    )
    .map(({ item }) => item);
}

export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  return rankBySeed(items, seed);
}
