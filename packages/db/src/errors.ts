/** Business-rule conflicts (last-admin guard, duplicate email) → HTTP 409. */
export class Conflict extends Error {
  readonly status = 409;
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "Conflict";
  }
}
