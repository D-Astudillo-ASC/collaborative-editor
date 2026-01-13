const { GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getS3Client, isR2Configured } = require('./client');

function snapshotKey(documentId, seq) {
  return `docs/${documentId}/snapshots/${seq}.bin`;
}

async function uploadSnapshot({ documentId, seq, bytes }) {
  if (!isR2Configured()) return null;
  const Bucket = process.env.R2_BUCKET;
  const Key = snapshotKey(documentId, seq);
  const Body = Buffer.from(bytes);

  const s3 = getS3Client();
  await s3.send(
    new PutObjectCommand({
      Bucket,
      Key,
      Body,
      ContentType: 'application/octet-stream',
    })
  );

  return Key;
}

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function downloadSnapshotBytes({ key }) {
  if (!isR2Configured()) return null;
  if (!key) return null;
  const Bucket = process.env.R2_BUCKET;
  const s3 = getS3Client();

  const res = await s3.send(new GetObjectCommand({ Bucket, Key: key }));
  if (!res.Body) return null;
  const buf = await streamToBuffer(res.Body);
  return buf;
}

module.exports = { snapshotKey, uploadSnapshot, downloadSnapshotBytes };

