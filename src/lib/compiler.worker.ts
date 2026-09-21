import { compileDocument } from './compile';
self.onmessage = async ({
  data,
}: MessageEvent<{ id: number; source: string }>) => {
  try {
    self.postMessage({
      id: data.id,
      source: data.source,
      ...(await compileDocument(data.source)),
    });
  } catch (error) {
    self.postMessage({
      id: data.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
