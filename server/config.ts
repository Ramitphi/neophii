import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT || 8080),
  project: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || '',
  location: process.env.GOOGLE_CLOUD_LOCATION || 'global',
  region: process.env.CLOUD_RUN_REGION || 'asia-south1',
  mediaBucket: process.env.MEDIA_BUCKET || '',
  analysisModel: process.env.ANALYSIS_MODEL || process.env.NEOPHI_ANALYSIS_MODEL || 'gemini-3.8-flash',
  embeddingModel: process.env.EMBEDDING_MODEL || process.env.NEOPHI_EMBEDDING_MODEL || 'gemini-embedding-2',
  embeddingDims: 768,
};
