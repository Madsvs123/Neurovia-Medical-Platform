/**
 * Where uploaded files live.
 *
 * - Locally (`npm run dev`) files are written to `backend/uploads`.
 * - On Netlify the function filesystem is read-only and not shared between
 *   instances, so files are stored in Netlify Blobs instead.
 *
 * Either way, a stored file is served back at `GET /api/uploads/:key`.
 */
const path = require('path');
const fs = require('fs');

const isServerless = () => process.env.NEUROVIA_SERVERLESS === 'true';

const localDir = path.join(__dirname, '../uploads');

const uploadStore = () => {
  const { getStore } = require('@netlify/blobs');
  return getStore({ name: 'uploads', consistency: 'strong' });
};

const makeKey = (fieldname, originalname) => {
  const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
  return `${fieldname}-${uniqueSuffix}${path.extname(originalname)}`;
};

/** Persist a multer memory-storage file to Blobs; returns the file descriptor sent to clients. */
async function saveToBlobs(file) {
  const key = makeKey(file.fieldname, file.originalname);
  await uploadStore().set(key, file.buffer, {
    metadata: { contentType: file.mimetype, originalname: file.originalname }
  });
  return {
    fieldname: file.fieldname,
    originalname: file.originalname,
    mimetype: file.mimetype,
    size: file.size,
    filename: key,
    path: `/api/uploads/${key}`
  };
}

/** Read a stored file. Returns `{ data: Buffer, contentType }` or null. */
async function readUpload(key) {
  if (isServerless()) {
    const result = await uploadStore().getWithMetadata(key, { type: 'arrayBuffer' });
    if (!result) return null;
    return {
      data: Buffer.from(result.data),
      contentType: result.metadata?.contentType || 'application/octet-stream'
    };
  }
  const filePath = path.join(localDir, key);
  if (!fs.existsSync(filePath)) return null;
  return { filePath };
}

module.exports = { isServerless, localDir, makeKey, saveToBlobs, readUpload };
