import fs from 'fs';
import path from 'path';

// Local storage fallback directory
const LOCAL_STORAGE_DIR = path.resolve(__dirname, '../../uploads/challenges');
if (!fs.existsSync(LOCAL_STORAGE_DIR)) {
  fs.mkdirSync(LOCAL_STORAGE_DIR, { recursive: true });
}

export const uploadChallengeFile = async (
  file: Express.Multer.File
): Promise<{ filePath: string; fileBuffer: Buffer }> => {
  // Validate extension
  const ext = path.extname(file.originalname).toLowerCase();
  if (ext !== '.zip') {
    throw new Error('Only .zip challenge files are allowed.');
  }

  // Create unique filename
  const uniqueFilename = `challenge_${Date.now()}_${Math.random().toString(36).substring(2, 9)}.zip`;

  // Write to local disk fallback
  try {
    const localDestination = path.join(LOCAL_STORAGE_DIR, uniqueFilename);
    fs.writeFileSync(localDestination, file.buffer);
  } catch (err: any) {
    console.warn('[STORAGE] Warning writing local fallback file:', err.message);
  }

  return { filePath: uniqueFilename, fileBuffer: file.buffer };
};

export const getChallengeFileStreamOrPath = async (
  filePath: string
): Promise<{ type: 'buffer' | 'file'; data: Buffer | string; filename: string }> => {
  const filename = path.basename(filePath);

  // Check local file system
  const localFile = path.join(LOCAL_STORAGE_DIR, filename);
  if (fs.existsSync(localFile)) {
    return { type: 'file', data: localFile, filename };
  }

  throw new Error('Challenge file not found on storage server.');
};

