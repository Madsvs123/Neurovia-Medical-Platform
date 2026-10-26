// Long-running server for local development and traditional hosting.
// On Netlify the same Express app runs inside a function (see lambda.js).
const { config } = require('./config/config');
const winston = require('winston');
const app = require('./app');
const { connectDB } = require('./config/db');

if (require.main !== module) {
  // Required by tests: export the app without opening a port.
  module.exports = app;
  return;
}

console.log('Starting Neurovia API server...');
console.log('Environment:', config.server.env);

// Database connection
connectDB()
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => {
    console.error('MongoDB connection error:', err.message);
    console.log('Server will continue running. Please check your MongoDB connection.');
  });

// Start server
const PORT = config.server.port;
const server = app.listen(PORT, () => {
  console.log(`🚀 Neurovia API Server running in ${config.server.env} mode on port ${PORT}`);
  winston.info(`Server started in ${config.server.env} mode on port ${PORT}`);
});

// Live notification delivery. The bell also loads notifications over REST.
const { initSocket } = require('./realtime/socket');
initSocket(server, { jwtSecret: config.jwt.secret });

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error(`Unhandled Rejection: ${err.message}`);
  winston.error(`Unhandled Rejection: ${err.message}`);
  server.close(() => process.exit(1));
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error(`Uncaught Exception: ${err.message}`);
  winston.error(`Uncaught Exception: ${err.message}`);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  winston.info('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    winston.info('Server closed');
    process.exit(0);
  });
});
