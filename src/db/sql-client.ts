// The slice of D1 that repositories use. Any adapter that offers prepare/bind/first/all/run and batch
// (another SQLite host, a test double) can stand in without touching repositories or loaders.
export type SqlClient = Pick<D1Database, 'prepare' | 'batch'>;
