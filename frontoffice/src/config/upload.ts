import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuid } from 'uuid';
import { config } from './index';

/**
 * Upload local des photos de profil (développement).
 *
 * Les fichiers vont dans `frontoffice/uploads/`, **hors de `public/`**, et sont
 * servis sous l'URL `/uploads/<fichier>` (montée explicitement dans server.ts).
 * L'URL stockée en base est inchangée.
 *
 * ⚠️  Cette séparation n'est pas cosmétique : `public/` est la sortie de
 * `vite build`, qui tourne avec `emptyOutDir: true` et **efface tout son
 * contenu** à chaque construction. Des photos de membres rangées là sont
 * perdues au premier `npm run build:all` — c'est déjà arrivé sur ce projet.
 *
 * Le chemin est configurable par `UPLOAD_DIR` : en conteneur, il doit désigner
 * un volume persistant, faute de quoi toutes les photos disparaissent au
 * redéploiement. Un envoi vers S3 reste la solution cible ; le volume est ce
 * qui rend le déploiement possible sans elle.
 */
export const uploadDir = path.isAbsolute(config.uploadDir)
  ? config.uploadDir
  : path.join(__dirname, '..', '..', config.uploadDir);

// Le dossier doit exister au runtime, sinon multer.diskStorage lève ENOENT.
// Vaut aussi pour un chemin configuré : un volume fraîchement monté est vide.
fs.mkdirSync(uploadDir, { recursive: true });

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = EXT_BY_MIME[file.mimetype] || path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `${uuid()}${ext}`);
  },
});

export const photoUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 6 }, // 5 Mo, 6 fichiers max
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Format non supporté. Utilisez JPEG, PNG ou WebP.'));
  },
});
