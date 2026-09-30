// Values the global setup hands to test files through Vitest's `inject`.
declare module "vitest" {
  export interface ProvidedContext {
    templateDatabase: string;
  }
}

export {};
