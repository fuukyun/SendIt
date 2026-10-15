import { StorageHttpError, type PutBlob } from './uploader';

/** fetch() cannot report upload progress, so uploads go through XMLHttpRequest. */
export const xhrPut: PutBlob = ({ url, body, headers, signal, onProgress }) =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    for (const [name, value] of Object.entries(headers ?? {})) xhr.setRequestHeader(name, value);

    xhr.upload.onprogress = (event) => onProgress(event.loaded);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve({ etag: xhr.getResponseHeader('ETag') });
      } else {
        reject(new StorageHttpError(xhr.status));
      }
    };
    xhr.onerror = () => reject(new TypeError('Network error during upload'));
    xhr.onabort = () => reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));

    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    signal.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(body);
  });
