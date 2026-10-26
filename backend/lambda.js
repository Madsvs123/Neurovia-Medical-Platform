/**
 * Netlify Functions entry point for the Express API.
 * netlify/functions/api.js re-exports this handler; requests to /api/* are
 * routed to it (see netlify.toml).
 */
process.env.NEUROVIA_SERVERLESS = 'true';

const serverless = require('serverless-http');
const { connectLambda } = require('@netlify/blobs');
const app = require('./app');
const { connectDB } = require('./config/db');

const TEXT_TYPES = /^(application\/(json|javascript|xml)|text\/)/;

const expressHandler = serverless(app, {
  // Uploaded files (images, PDFs, video) must be returned base64-encoded.
  binary: (headers) => {
    const type = String(headers['content-type'] || '');
    return Boolean(type) && !TEXT_TYPES.test(type);
  },
});

exports.handler = async (event, context) => {
  // Keep the MongoDB connection open between invocations of a warm instance.
  context.callbackWaitsForEmptyEventLoop = false;
  if (event.blobs) connectLambda(event);
  try {
    await connectDB();
  } catch (err) {
    return {
      statusCode: 503,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, message: 'Database unavailable, please try again shortly' }),
    };
  }
  return expressHandler(event, context);
};
