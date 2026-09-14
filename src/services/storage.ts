import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { env } from '../config/env';

// Local storage fallback directory
const LOCAL_STORAGE_DIR = path.resolve(__dirname, '../../uploads/challenges');
if (!fs.existsSync(LOCAL_STORAGE_DIR)) {
  fs.mkdirSync(LOCAL_STORAGE_DIR, { recursive: true });
}

// Initialize Supabase client if credentials are configured
const isSupabaseConfigured =
  env.SUPABASE_URL &&
  !env.SUPABASE_URL.includes('your-project') &&
  env.SUPABASE_SERVICE_ROLE_KEY &&
  !env.SUPABASE_SERVICE_ROLE_KEY.includes('your-supabase-service-role-key');

const supabase = isSupabaseConfigured
  ? createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
  : null;

export const uploadChallengeFile = async (
  file: Express.Multer.File
): Promise<{ filePath: string; storageType: 'supabase' | 'local' }> => {
  // Validate extension
  const ext = path.extname(file.originalname).toLowerCase();
  if (ext !== '.zip') {
    throw new Error('Only .zip challenge files are allowed.');
  }

  // Create unique filename
  const uniqueFilename = `challenge_${Date.now()}_${Math.random().toString(36).substring(2, 9)}.zip`;

  if (supabase) {
    try {
      const { data, error } = await supabase.storage
        .from(env.SUPABASE_STORAGE_BUCKET)
        .upload(uniqueFilename, file.buffer, {
          contentType: 'application/zip',
          upsert: true,
        });

      if (error) {
        console.warn('[STORAGE] Supabase upload failed, using local fallback:', error.message);
      } else if (data) {
        return { filePath: data.path, storageType: 'supabase' };
      }
    } catch (err: any) {
      console.warn('[STORAGE] Supabase connection error, defaulting to local storage:', err.message);
    }
  }

  // Local storage fallback
  const localDestination = path.join(LOCAL_STORAGE_DIR, uniqueFilename);
  fs.writeFileSync(localDestination, file.buffer);
  return { filePath: uniqueFilename, storageType: 'local' };
};

export const getChallengeFileStreamOrPath = async (
  filePath: string
): Promise<{ type: 'buffer' | 'stream' | 'file'; data: Buffer | string; filename: string }> => {
  const filename = path.basename(filePath);

  // Check local file system first
  const localFile = path.join(LOCAL_STORAGE_DIR, filename);
  if (fs.existsSync(localFile)) {
    return { type: 'file', data: localFile, filename };
  }

  // Try Supabase Storage
  if (supabase) {
    const { data, error } = await supabase.storage
      .from(env.SUPABASE_STORAGE_BUCKET)
      .download(filePath);

    if (!error && data) {
      const arrayBuffer = await data.arrayBuffer();
      return { type: 'buffer', data: Buffer.from(arrayBuffer), filename };
    }
  }

  throw new Error('Challenge file not found on storage server.');
};
