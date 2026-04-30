/** S3 bucket + region coordinates for a single storage target. */
export interface S3Config {
  bucket: string
  region: string
}

/** Parameters for initiating a multipart upload session. */
export interface S3MultipartUploadInit {
  fileName: string
  contentType: string
  fileSize: number
  customConfig?: S3Config
}

/** A single presigned URL bound to one part number. */
export interface S3PartUploadUrl {
  partNumber: number
  url: string
}

/** ETag + part-number pair required to finalise a multipart upload. */
export interface S3MultipartPart {
  ETag: string
  PartNumber: number
}
