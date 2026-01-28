/**
 * Require Authentication Middleware
 */

const SessionManager = require('../services/session-manager');
const DatabaseService = require('../../services/database-service');

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
        
        // Store the real user info (for impersonation)
        req.realUser = { ...req.currentUser };
        
        // Check for impersonation (Admin only)
        const impersonateId = req.cookies.impersonate_user;
        console.log('[AUTH] Impersonate check - cookie:', impersonateId, 'sessionRole:', session.Role);
        if (impersonateId && session.Role === 'Admin') {
            const result = await DatabaseService.query(`
                SELECT u.*, r.RoleName as Role
                FROM Users u
                LEFT JOIN UserRoles r ON u.RoleId = r.Id
                WHERE u.Id = @userId
            `, { userId: parseInt(impersonateId) });
            
            console.log('[AUTH] Impersonation query result:', result.recordset);
            
            if (result.recordset.length > 0) {
                const impUser = result.recordset[0];
                console.log('[AUTH] Impersonating as:', impUser.DisplayName, 'Role:', impUser.Role);
                req.currentUser = {
                    id: impUser.Id,
                    email: impUser.Email,
                    displayName: impUser.DisplayName,
                    role: impUser.Role,
                    isApproved: impUser.IsApproved,
                    isActive: impUser.IsActive,
                    accessToken: session.azure_access_token,
                    isImpersonating: true
                };
            }
        }
        
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
                <link rel="icon" type="image/x-icon" href="/favicon.ico">
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
