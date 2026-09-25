export class ActionError extends Error {
  code: string;
  constructor(options: { code: string; message?: string }) {
    super(options.message || options.code);
    this.name = 'ActionError';
    this.code = options.code;
  }
}
