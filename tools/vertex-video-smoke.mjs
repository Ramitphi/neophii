// Staging smoke test for Vertex video inference with the DEPLOYED runtime identity (run it as a short-lived
// Cloud Run Job with the worker's service account). Prints redacted results only: status, byte count, MIME.
//
//   node tools/vertex-video-smoke.mjs /path/to/neophi-sample.mp4        inline bytes only
//   node tools/vertex-video-smoke.mjs gs://BUCKET/smoke/neophi-sample.mp4
//        reads the private object with this identity, sends it inline, then sends it the way the pipeline does
//        (fileData.fileUri gs://...). Both must report replied: true.
//
// Needs GOOGLE_CLOUD_PROJECT and ANALYSIS_MODEL (GOOGLE_CLOUD_LOCATION defaults to global).
import { readFile } from 'node:fs/promises';
import { GoogleGenAI } from '@google/genai';
import { Storage } from '@google-cloud/storage';

const { GOOGLE_CLOUD_PROJECT: project, GOOGLE_CLOUD_LOCATION: location = 'global', ANALYSIS_MODEL: model } = process.env;
const source = process.argv[2];
const PROMPT = 'Describe one visible detail from this attached test clip in one sentence.';

async function load(src) {
  if (!src.startsWith('gs://')) return readFile(src);
  const [, , bucket, ...rest] = src.split('/');
  const [buf] = await new Storage({ projectId: project }).bucket(bucket).file(rest.join('/')).download();
  return buf;
}

async function ask(ai, mode, part, bytes) {
  try {
    const response = await ai.models.generateContent({ model, contents: [{ role: 'user', parts: [part, { text: PROMPT }] }] });
    const replied = Boolean(response.text?.trim());
    console.log(JSON.stringify({ provider: 'vertex', mode, mime: 'video/mp4', bytes, replied }));
    return replied;
  } catch (error) {
    const http = typeof error?.status === 'number' ? error.status : null;
    console.error(JSON.stringify({ provider: 'vertex', mode, ok: false, http, errorType: error?.name ?? 'Error' }));
    return false;
  }
}

if (!project || !model || !source) {
  console.error('Set GOOGLE_CLOUD_PROJECT and ANALYSIS_MODEL, and pass the synthetic MP4 path or gs:// URI.');
  process.exitCode = 1;
} else {
  let video;
  try {
    video = await load(source);
  } catch (error) {
    console.error(JSON.stringify({ step: 'read_fixture', ok: false, http: error?.code ?? null }));
    process.exitCode = 1;
  }
  if (video) {
    if (video.length > 5 * 1024 * 1024 || video.subarray(4, 8).toString() !== 'ftyp') {
      console.error(JSON.stringify({ step: 'read_fixture', ok: false, reason: 'expected a small MP4 fixture' }));
      process.exitCode = 1;
    } else {
      const ai = new GoogleGenAI({ vertexai: true, project, location, httpOptions: { timeout: 60_000 } });
      let ok = await ask(ai, 'inline', { inlineData: { mimeType: 'video/mp4', data: video.toString('base64') } }, video.length);
      if (source.startsWith('gs://')) {
        ok = (await ask(ai, 'gcs_file_uri', { fileData: { fileUri: source, mimeType: 'video/mp4' } }, video.length)) && ok;
      }
      if (!ok) process.exitCode = 1;
    }
  }
}
