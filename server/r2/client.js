import { S3Client } from '@aws-sdk/client-s3';

let client;

function parseRegionFromEndpoint(endpoint) {
  try {
    const host = new URL(endpoint).host;
    // Backblaze B2: s3.<region>.backblazeb2.com
    const m = host.match(/^s3\.([a-z0-9-]+)\.backblazeb2\.com$/i);
    if (m) return m[1];
    // Cloudflare R2: <accountid>.r2.cloudflarestorage.com (region is "auto" for AWS SDK)
    if (host.endsWith('.r2.cloudflarestorage.com')) return 'auto';
  } catch {
    // ignore
  }
  return null;
}

function isR2Configured() {
  return !!(
    process.env.R2_ENDPOINT &&
    process.env.R2_BUCKET &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY
  );
}

function getS3Client() {
  if (!client) {
    if (!isR2Configured()) {
      throw new Error('R2/B2 is not configured (missing R2_* env vars)');
    }

    const endpoint = process.env.R2_ENDPOINT;
    const region =
      process.env.R2_REGION ||
      parseRegionFromEndpoint(endpoint) ||
      // Reasonable default; AWS SDK requires a region string.
      'us-east-1';

    client = new S3Client({
      region,
      endpoint,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
      forcePathStyle: true,
    });
  }
  return client;
}

export { getS3Client, isR2Configured };

