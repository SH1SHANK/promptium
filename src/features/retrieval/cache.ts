export class LruCache<T> {
  private values = new Map<string, T>();
  constructor(private readonly capacity = 50) {}
  get(key: string): T | undefined {
    const value = this.values.get(key);
    if (value !== undefined) {
      this.values.delete(key);
      this.values.set(key, value);
    }
    return value;
  }
  set(key: string, value: T): void {
    this.values.delete(key);
    this.values.set(key, value);
    if (this.values.size > this.capacity) this.values.delete(this.values.keys().next().value!);
  }
  clear(): void {
    this.values.clear();
  }
}

export function hashPrompt(value: string): string {
  let hash = 5381;
  for (const char of value.trim().toLowerCase().replace(/\s+/g, ' '))
    hash = ((hash << 5) + hash) ^ char.charCodeAt(0);
  return `r${(hash >>> 0).toString(36)}`;
}
