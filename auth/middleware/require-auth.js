/**
 * Require Authentication Middleware
 */

const SessionManager = require('../services/session-manager');

async function requireAuth(req, res, next) {
    try {
        const sessionToken = req.cookies.auth_token;
        
        if (!sessionToken) {
            return redirectToLogin(req, res);
        }
        
        if (!SessionManager.isValidTokenFormat(sessionToken)) {
            return redirectToLogin(req, res);
        }
        
        const session = await SessionManager.getSession(sessionToken);
        
        if (!session) {
            return redirectToLogin(req, res);
        }
        
        // Attach user to request
        req.currentUser = {
            id: session.UserId,
            email: session.Email,
            displayName: session.DisplayName,
            role: session.Role,
            isApproved: session.IsApproved,
            isActive: session.IsActive,
            accessToken: session.azure_access_token  // User's Azure access token for delegated API calls
        };
        
        req.sessionToken = sessionToken;
        
        // Check if user is pending approval
        if (session.Role === 'Pending' && !req.path.startsWith('/auth/')) {
            return res.redirect('/auth/pending');
        }
        
        next();
        
    } catch (error) {
        console.error('[AUTH] Error:', error);
        return res.status(500).send('Authentication error');
    }
}

function redirectToLogin(req, res) {
    if (req.path.startsWith('/api/')) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    
    const returnUrl = encodeURIComponent(req.originalUrl);
    res.redirect(`/auth/login?returnUrl=${returnUrl}`);
}

/**
 * Require specific role(s)
 */
function requireRole(allowedRoles) {
    // Convert single role or array to array
    const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
    
    return function(req, res, next) {
        if (!req.currentUser) {
            return res.status(500).send('Server configuration error');
        }
        
        if (roles.includes(req.currentUser.role)) {
            return next();
        }
        
        if (req.path.startsWith('/api/')) {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        res.status(403).send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Access Denied</title>
                <link rel="stylesheet" href="/css/main.css">
            </head>
            <body>
                <div class="success-container">
                    <div class="success-icon" style="background: #dc3545;">🚫</div>
                    <h1>Access Denied</h1>
                    <p>You don't have permission to access this page.</p>
                    <p>Required role: ${roles.join(' or ')}</p>
                    <p>Your role: ${req.currentUser.role}</p>
                    <a href="/dashboard" class="btn btn-primary">Back to Dashboard</a>
                </div>
            </body>
            </html>
        `);
    };
}

module.exports = requireAuth;
module.exports.requireAuth = requireAuth;
module.exports.requireRole = requireRole;
