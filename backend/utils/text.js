const { ObjectId } = require('mongodb');

function normalizeUsername(value) {
    return String(value || '')
        .trim()
        .toLowerCase();
}

function normalizeEmail(value) {
    return String(value || '')
        .trim()
        .toLowerCase();
}

function sanitizePlainText(value, maxLength) {
    const normalized = String(value || '')
        .replace(/\r\n/g, '\n')
        .replace(/[^\S\n]+/g, ' ')
        .trim();

    return typeof maxLength === 'number' ? normalized.slice(0, maxLength) : normalized;
}

function escapeRegex(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toObjectId(value) {
    if (!ObjectId.isValid(value)) {
        return null;
    }

    return new ObjectId(value);
}

function uniqueObjectIds(values) {
    const seen = new Set();

    return values.filter((value) => {
        if (!value) {
            return false;
        }

        const key = value.toString();
        if (seen.has(key)) {
            return false;
        }

        seen.add(key);
        return true;
    });
}

module.exports = {
    escapeRegex,
    normalizeEmail,
    normalizeUsername,
    sanitizePlainText,
    toObjectId,
    uniqueObjectIds,
};
