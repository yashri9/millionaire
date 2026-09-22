"use client";

import * as tus from "tus-js-client";

export type TusUploadConfig = {
  endpoint: string;
  bucketName: string;
  objectName: string;
  accessToken: string;
  anonKey: string;
  chunkSize: number;
  retryDelays: number[];
};

export type TusProgress = {
  bytesUploaded: number;
  bytesTotal: number;
  pct: number;
};

/**
 * Direct-to-Storage TUS upload (browser → *.storage.supabase.co).
 * Never proxies the file body through the Next.js function.
 */
export function uploadFileWithTus(
  file: File,
  config: TusUploadConfig,
  opts?: {
    onProgress?: (p: TusProgress) => void;
    signal?: AbortSignal;
  },
): Promise<void> {
  return new Promise((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint: config.endpoint,
      retryDelays: config.retryDelays,
      chunkSize: config.chunkSize,
      removeFingerprintOnSuccess: true,
      metadata: {
        bucketName: config.bucketName,
        objectName: config.objectName,
        contentType: file.type || "application/pdf",
        cacheControl: "3600",
      },
      headers: {
        authorization: `Bearer ${config.accessToken}`,
        apikey: config.anonKey,
        "x-upsert": "true",
      },
      onError(error) {
        reject(error);
      },
      onProgress(bytesUploaded, bytesTotal) {
        opts?.onProgress?.({
          bytesUploaded,
          bytesTotal,
          pct: bytesTotal > 0 ? Math.round((bytesUploaded / bytesTotal) * 100) : 0,
        });
      },
      onSuccess() {
        resolve();
      },
    });

    if (opts?.signal) {
      const onAbort = () => {
        void upload.abort(true);
        reject(new DOMException("Upload aborted", "AbortError"));
      };
      if (opts.signal.aborted) onAbort();
      else opts.signal.addEventListener("abort", onAbort, { once: true });
    }

    upload.findPreviousUploads().then((previous) => {
      if (previous.length > 0) {
        upload.resumeFromPreviousUpload(previous[0]);
      }
      upload.start();
    }).catch(reject);
  });
}
