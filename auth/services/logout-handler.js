/**
 * Logout Handler
 */

const SessionManager = require('./session-manager');

class LogoutHandler {
    async handleLogout(req, res) {
        try {
            // Delete session from database
            if (req.sessionToken) {
                await SessionManager.deleteSession(req.sessionToken);
            }

            // Clear cookie
            res.clearCookie('auth_token');

            // Redirect to login
            res.redirect('/auth/login');

        } catch (error) {
            console.error('[AUTH] Logout error:', error);
            res.redirect('/auth/login');
        }
    }
}

module.exports = LogoutHandler;
