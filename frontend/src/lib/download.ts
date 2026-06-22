import type { AxiosInstance } from 'axios';

// Downloads a file through an axios instance so the auth interceptor attaches the
// staff bearer / reporter hand-off token (a plain <a href> download cannot send
// those headers). Falls back to the server-provided filename when present.
export async function downloadFile(
  api: AxiosInstance,
  url: string,
  fallbackName: string,
): Promise<void> {
  const res = await api.get(url, { responseType: 'blob' });
  const blob = res.data as Blob;

  let name = fallbackName;
  const disp = res.headers['content-disposition'] as string | undefined;
  const match = disp?.match(/filename\*=UTF-8''([^;]+)|filename="([^"]+)"/i);
  if (match) name = decodeURIComponent(match[1] ?? match[2] ?? fallbackName);

  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
}
