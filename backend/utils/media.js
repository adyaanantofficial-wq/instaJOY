const sharp = require('sharp');

const MAX_IMAGE_BYTES = 200 * 1024;
const MAX_AVATAR_BYTES = 180 * 1024;
const MAX_REEL_BYTES = 1024 * 1024;
const MAX_REEL_DURATION_SECONDS = 30;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_REEL_TYPES = new Set(['video/mp4', 'video/webm', 'video/ogg']);

function parseDataUri(dataUri) {
    const value = String(dataUri || '').trim();
    const match = /^data:([^;]+);base64,([a-z0-9+/=\s]+)$/i.exec(value);

    if (!match) {
        const error = new Error('Invalid media format');
        error.status = 400;
        throw error;
    }

    return {
        mimeType: match[1].toLowerCase(),
        buffer: Buffer.from(match[2], 'base64'),
    };
}

async function compressImageDataUri(dataUri, options = {}) {
    const {
        maxBytes = MAX_IMAGE_BYTES,
        maxWidth = 1280,
        maxHeight = 1280,
        background = '#ffffff',
    } = options;
    const { mimeType, buffer } = parseDataUri(dataUri);

    if (!ALLOWED_IMAGE_TYPES.has(mimeType)) {
        const error = new Error('Only JPEG, PNG, and WebP images are allowed');
        error.status = 400;
        throw error;
    }

    let width = maxWidth;
    let height = maxHeight;
    let quality = 82;
    let output = null;

    for (let attempt = 0; attempt < 6; attempt += 1) {
        output = await sharp(buffer)
            .rotate()
            .resize({
                width,
                height,
                fit: 'inside',
                withoutEnlargement: true,
            })
            .flatten({ background })
            .jpeg({
                quality,
                mozjpeg: true,
            })
            .toBuffer();

        if (output.length <= maxBytes) {
            break;
        }

        if (quality > 54) {
            quality -= 10;
        } else {
            width = Math.max(480, Math.floor(width * 0.82));
            height = Math.max(480, Math.floor(height * 0.82));
        }
    }

    if (!output || output.length > maxBytes) {
        const error = new Error(`Image must be ${Math.floor(maxBytes / 1024)}KB or smaller after compression`);
        error.status = 400;
        throw error;
    }

    return {
        dataUri: `data:image/jpeg;base64,${output.toString('base64')}`,
        mimeType: 'image/jpeg',
        sizeBytes: output.length,
    };
}

function validateVideoDataUri(dataUri, durationSeconds) {
    const { mimeType, buffer } = parseDataUri(dataUri);

    if (!ALLOWED_REEL_TYPES.has(mimeType)) {
        const error = new Error('Only MP4, WebM, and OGG reels are allowed');
        error.status = 400;
        throw error;
    }

    if (buffer.length > MAX_REEL_BYTES) {
        const error = new Error('Reel must be 1MB or smaller');
        error.status = 400;
        throw error;
    }

    if (
        typeof durationSeconds !== 'number' ||
        Number.isNaN(durationSeconds) ||
        durationSeconds <= 0 ||
        durationSeconds > MAX_REEL_DURATION_SECONDS
    ) {
        const error = new Error('Reel duration must be 30 seconds or less');
        error.status = 400;
        throw error;
    }

    return {
        dataUri: String(dataUri || '').trim(),
        mimeType,
        sizeBytes: buffer.length,
        durationSeconds: Number(durationSeconds.toFixed(2)),
    };
}

module.exports = {
    ALLOWED_IMAGE_TYPES,
    ALLOWED_REEL_TYPES,
    MAX_AVATAR_BYTES,
    MAX_IMAGE_BYTES,
    MAX_REEL_BYTES,
    MAX_REEL_DURATION_SECONDS,
    compressImageDataUri,
    validateVideoDataUri,
};
