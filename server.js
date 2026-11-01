'use strict';
const { openDatabase, DEFAULT_DB_PATH } = require('./database');
const { createApp } = require('./src/app');

const dbFile = process.env.DAYSTASH_DB || DEFAULT_DB_PATH;
const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || '127.0.0.1';

const db = openDatabase(dbFile);
const app = createApp({ db });
const server = app.listen(port, host, () => {
  console.log(`Daystash running at http://localhost:${port}`);
  console.log(`Database: ${dbFile}`);
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
