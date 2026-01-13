/// <reference types="vite/client" />

// PREVIOUS IMPLEMENTATION (commented out):
// - No explicit Vite env typing was present, which can make `import.meta.env` error in TS.
//
// Reason for change:
// - Clerk publishable key is read from `import.meta.env.VITE_CLERK_PUBLISHABLE_KEY`, so we declare it here.

// interface ImportMetaEnv {
//   readonly VITE_CLERK_PUBLISHABLE_KEY?: string;
// }

// interface ImportMeta {
//   readonly env: ImportMetaEnv;
// }

