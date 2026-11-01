'use strict';

class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

module.exports = {
  AppError,
  badRequest: (code, message, details) => new AppError(400, code, message, details),
  notFound: (code, message) => new AppError(404, code, message),
  conflict: (code, message, details) => new AppError(409, code, message, details),
};
