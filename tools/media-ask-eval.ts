/**
 * With the actual video, does the reading give the person what they asked for? Takes a local video file and a note,
 * reads it through the same service the worker uses (the file is sent inline instead of from storage).
 *
 *   GOOGLE_CLOUD_PROJECT=... GOOGLE_CLOUD_LOCATION=global npx tsx tools/media-ask-eval.ts <video.mp4> "<note>" ["<caption>"]
 */
import fs from 'node:fs';
import { GoogleGenAI } from '@google/genai';
import { config } from '../server/config.js';
import { VertexGeminiService, type GenAiClient } from '../server/gemini.js';
import type { Memory } from '../src/types/neophi.js';

const [file, note, caption = ''] = process.argv.slice(2);
if (!file || !note) throw new Error('usage: media-ask-eval.ts <video> "<note>" ["<caption>"]');

const real = new GoogleGenAI({ vertexai: true, project: config.project, location: config.location });
const client: GenAiClient = {
  models: {
    ...real.models,
    generateContent: (req: Parameters<typeof real.models.generateContent>[0]) => {
      const contents = (req.contents as Array<{ role: string; parts: Array<Record<string, unknown>> }>).map((c) => ({
        ...c,
        parts: c.parts.map((p) =>
          p.fileData ? { inlineData: { mimeType: 'video/mp4', data: fs.readFileSync(file).toString('base64') } } : p
        ),
      }));
      return real.models.generateContent({ ...req, contents });
    },
  } as unknown as GenAiClient['models'],
};

const memory = {
  id: 'media-eval',
  url: 'https://www.instagram.com/reel/test/',
  title: '',
  caption,
  note,
  chip: null,
  ingest: 'full_media',
  media: { kind: 'video', mime: 'video/mp4', gcsPath: 'gs://local/test.mp4', thumbPath: null },
  privateNoAI: false,
} as unknown as Memory;

const a = await new VertexGeminiService({ client }).analyzeMemory(memory);
console.log(JSON.stringify({ ask: a?.user_ask, evidence: a?.evidence.slice(0, 4), what: (a as { what_this_is?: string } | null)?.what_this_is }, null, 2));
