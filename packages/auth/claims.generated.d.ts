/**
 * Custom claim names for this app.
 *
 * The Rayfin CLI regenerates this file from the udf.authClaims return type
 * (`rayfin dev`, `rayfin functions init`, `rayfin up`). It is committed so
 * `ctx.getClaims().appRole` type-checks before that command has been run.
 * Do not add claims here that the provider does not return.
 */
export {};

declare module '@microsoft/rayfin-core' {
  interface RayfinCustomClaims {
    appRole: string;
  }
}
