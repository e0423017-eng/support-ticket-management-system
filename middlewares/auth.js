const jwt = require('jsonwebtoken');

const auth = async (req, res, next) => {
    try {
        // Get token from header
        const authHeader = req.header('Authorization');
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ 
                success: false,
                error: 'Access denied. No token provided.' 
            });
        }
        
        const token = authHeader.replace('Bearer ', '');
        
        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET || process.env.SECRET_CODE);
        
        // Attach user to request
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ 
            success: false,
            error: 'Invalid or expired token' 
        });
    }
};

// Role-based middleware
const requireRole = (role) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ 
                success: false,
                error: 'Authentication required' 
            });
        }
        
        if (req.user.role !== role) {
            return res.status(403).json({ 
                success: false,
                error: `Access denied. ${role} role required.` 
            });
        }
        
        next();
    };
};

module.exports = { auth, requireRole };