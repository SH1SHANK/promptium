// Loader module for lazy-loading external intelligence libraries: compromise, fuse.js, and js-tiktoken.
// This reduces bundle size constraints on startup of promptium features.

let compromiseInstance: any = null;
let fuseInstance: any = null;
let tokenizerInstance: any = null;

export async function getCompromise(): Promise<any> {
  if (!compromiseInstance) {
    // compromise uses default export or named export depending on bundler settings
    const mod = await import('compromise');
    compromiseInstance = mod.default || mod;
  }
  return compromiseInstance;
}

export async function getFuse(): Promise<any> {
  if (!fuseInstance) {
    const mod = await import('fuse.js');
    fuseInstance = mod.default || mod;
  }
  return fuseInstance;
}

export async function getTokenizer(): Promise<any> {
  if (!tokenizerInstance) {
    const mod = (await import('js-tiktoken')) as any;
    tokenizerInstance = mod.default || mod;
  }
  return tokenizerInstance;
}
