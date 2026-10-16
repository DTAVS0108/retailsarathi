// The package ships its own .d.ts but its package.json "exports" map isn't resolvable under
// "bundler" moduleResolution. Its API is a drop-in superset of better-sqlite3 (same
// prepare/exec/transaction/pragma surface, plus cipher pragmas we call as plain strings), so this
// shim reuses the already-installed @types/better-sqlite3 declarations.
declare module 'better-sqlite3-multiple-ciphers' {
  import Database = require('better-sqlite3');
  export = Database;
}
