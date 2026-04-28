function errorHandler(err, req, res, next) {
    if (res.headersSent) {
        return next(err);
    }

    if (err && err.code === 11000) {
        const duplicateField = Object.keys(err.keyPattern || {})[0] || 'field';

        return res.status(409).json({
            success: false,
            message: `${duplicateField} already exists`,
        });
    }

    if (err && err.name === 'JsonWebTokenError') {
        return res.status(401).json({
            success: false,
            message: 'Invalid token',
        });
    }

    if (err && err.name === 'TokenExpiredError') {
        return res.status(401).json({
            success: false,
            message: 'Token expired',
        });
    }

    return res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Internal server error',
    });
}

module.exports = errorHandler;
