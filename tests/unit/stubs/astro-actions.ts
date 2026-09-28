export class ActionError extends Error {
  code: string;
  constructor(options: { code: string; message?: string }) {
    super(options.message || options.code);
    this.name = 'ActionError';
    this.code = options.code;
  }
}

/** Unit-test stand-in: returns the definition so tests can inspect the action tree. */
export function defineAction<T>(options: T): T {
  return options;
}
