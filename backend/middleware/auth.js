const jwt = require('jsonwebtoken');

function readBearerToken(req) {
    const header = req.headers.authorization || '';

    if (!header.startsWith('Bearer ')) {
        return null;
    }

    return header.slice(7).trim();
}

function attachUserFromToken(req) {
    const token = readBearerToken(req);

    if (!token) {
        return null;
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    req.user = decoded;
    return decoded;
}

function protect(req, res, next) {
    try {
        const decoded = attachUserFromToken(req);

        if (!decoded) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required',
            });
        }

        return next();
    } catch (error) {
        return res.status(401).json({
            success: false,
            message: 'Invalid or expired token',
        });
    }
}

function optionalAuth(req, res, next) {
    try {
        attachUserFromToken(req);
    } catch (error) {
        req.user = null;
        req.userId = null;
    }

    next();
}

module.exports = {
    optionalAuth,
    protect,
};
