function hashSeed(seed: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function nextRandom(state: number): [number, number] {
  const nextState = (state + 0x6d2b79f5) >>> 0;
  let value = nextState;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return [nextState, ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296];
}

export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  const shuffled = [...items];
  let state = hashSeed(seed);

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    let random: number;
    [state, random] = nextRandom(state);
    const otherIndex = Math.floor(random * (index + 1));
    [shuffled[index], shuffled[otherIndex]] = [
      shuffled[otherIndex]!,
      shuffled[index]!,
    ];
  }

  return shuffled;
}
