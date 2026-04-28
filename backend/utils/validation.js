const { validationResult } = require('express-validator');

function ensureValidRequest(req) {
    const result = validationResult(req);

    if (!result.isEmpty()) {
        const error = new Error(result.array()[0].msg);
        error.status = 400;
        throw error;
    }
}

module.exports = {
    ensureValidRequest,
};
