'use strict';
const path = require('path');
const express = require('express');
const { AppError } = require('./utils/errors');
const { localToday } = require('./utils/dates');
const { createServices } = require('./services');
const buildRouter = require('./routes');

function createApp({ db, clock = localToday }) {
  const app = express();
  const services = createServices({ db, clock });
  app.use(express.json({ limit: '100kb' }));
  app.use('/api', buildRouter(services, clock));
  app.use('/api', (req, res) => res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: `No API route for ${req.method} ${req.originalUrl}` } }));
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const fail = (status, code, message, details) => res.status(status).json({ ok: false, error: { code, message, details } });
    if (err instanceof AppError) return fail(err.status, err.code, err.message, err.details);
    if (err.type === 'entity.parse.failed') return fail(400, 'INVALID_JSON', 'Request body is not valid JSON');
    if (err.type === 'entity.too.large') return fail(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large');
    if (/NEGATIVE_BALANCE/.test(err.message)) return fail(409, 'INSUFFICIENT_REWARDS', 'The Rewards Buffer cannot go below zero');
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') return fail(409, 'DUPLICATE_OPERATION', 'This operation was already applied');
    console.error(err);
    return fail(500, 'INTERNAL_ERROR', 'Something went wrong on the server. No changes were saved.');
  });
  return app;
}
module.exports = { createApp };
