const mongoose = require('mongoose');
const winston = require('winston');
const { config } = require('./config');

let connecting = null;

/**
 * Connect to MongoDB once and reuse the connection.
 * Serverless function instances call this on every request, so concurrent
 * and repeated calls share a single in-flight connection attempt.
 */
function connectDB() {
  if (mongoose.connection.readyState === 1) return Promise.resolve(mongoose.connection);
  if (connecting) return connecting;

  connecting = mongoose
    .connect(config.database.uri, {
      dbName: config.database.dbName,
      ...config.database.options
    })
    .then(() => {
      winston.info('Successfully connected to MongoDB');
      return mongoose.connection;
    })
    .catch((err) => {
      connecting = null;
      winston.error(`MongoDB connection error: ${err.message}`);
      throw err;
    });

  return connecting;
}

module.exports = { connectDB };
