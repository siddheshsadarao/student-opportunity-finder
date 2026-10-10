import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import multer from 'multer';
import ApiError from '../utils/ApiError.js';

export const resumeDirectory = path.resolve(process.env.RESUME_STORAGE_DIR || 'storage/private/resumes');
fs.mkdirSync(resumeDirectory, { recursive: true, mode: 0o700 });

export const resumeMimeTypes = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

export function validResumeSignature(extension, signature) {
  switch (extension) {
    case '.pdf': return signature.subarray(0, 4).toString() === '%PDF';
    case '.docx': return signature.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    case '.png': return signature.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    case '.jpg':
    case '.jpeg': return signature.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
    case '.webp': return signature.subarray(0, 4).toString() === 'RIFF' && signature.subarray(8, 12).toString() === 'WEBP';
    default: return false;
  }
}

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, resumeDirectory),
  filename: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    callback(null, `${randomUUID()}${extension}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 4 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    const allowed = Object.hasOwn(resumeMimeTypes, extension);
    callback(allowed ? null : new ApiError(400, 'Upload a PDF, DOCX, PNG, JPG or WebP resume.'), allowed);
  },
});

export function receiveResume(req, res, next) {
  upload.single('resume')(req, res, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return next(ApiError.badRequest('Resume must be 4 MB or smaller.'));
    }
    return next(error);
  });
}

export default { receiveResume, resumeDirectory };
