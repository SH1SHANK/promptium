# Retrieval bundle report

Retrieval dependencies remain lazily imported through `src/features/refinement/intelligence/loaders/intelligence-loader.ts`:

- `compromise` loads only when analysis needs NLP intent extraction.
- `fuse.js` remains available for existing intelligence searches and is not imported by the keyword provider.
- `js-tiktoken` loads only when token budgeting is evaluated.

Latest verified production build emitted these retrieval-relevant lazy chunks:

- `compromise-DJJWHVi0.js`
- `tokenizer-CpOQ7rAZ.js`
- `fuse-CnS75vYB.js`
- `refinement-BRWOneSE.js`
- `vault-ui-BRd0Za1V.js`

The build no longer reports ineffective dynamic imports for retrieval analysis/tokenization. The retrieval pipeline itself is local TypeScript and introduces no remote services or model assets.
