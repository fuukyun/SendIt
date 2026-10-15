#!/bin/sh
# Creates the bucket and its lifecycle rule on first start.
set -eu

S3="aws --endpoint-url ${S3_ENDPOINT} s3api"

if $S3 head-bucket --bucket "${S3_BUCKET}" 2>/dev/null; then
  echo "Bucket ${S3_BUCKET} already exists"
else
  $S3 create-bucket --bucket "${S3_BUCKET}"
  echo "Created bucket ${S3_BUCKET}"
fi

# Safety net only: the app deletes expired files itself. Objects can never outlive the maximum
# link lifetime (7 days) by more than a day. MinIO aborts stale multipart uploads itself (24h
# default).
$S3 put-bucket-lifecycle-configuration --bucket "${S3_BUCKET}" \
  --lifecycle-configuration file:///init/lifecycle.json
echo "Applied lifecycle rules"

# CORS (so the browser may upload from the web app) is set server-wide through
# MINIO_API_CORS_ALLOW_ORIGIN in docker-compose.yml.
