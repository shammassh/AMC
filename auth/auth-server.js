/**
 * Authentication Server Module
 * Simplified version for Area Manager Checklist App
 */

const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');

// Import authentication modules
const LoginPage = require('./pages/login');
const OAuthCallbackHandler = require('./services/oauth-callback-handler');
const LogoutHandler = require('./services/logout-handler');
const SessionManager = require('./services/session-manager');
const requireAuth = require('./middleware/require-auth');

class AuthServer {
    constructor(app) {
        this.app = app;
        this.oauthHandler = new OAuthCallbackHandler();
        this.logoutHandler = new LogoutHandler();
        this.setupMiddleware();
        this.setupRoutes();
        this.setupSessionCleanup();
    }
    
    setupMiddleware() {
        this.app.use(cookieParser());
        this.app.use('/auth/styles', express.static(path.join(__dirname, 'styles')));
        this.app.use('/auth/scripts', express.static(path.join(__dirname, 'scripts')));
        console.log('[AUTH] Middleware configured');
    }
    
    setupRoutes() {
        // Login page
        this.app.get('/auth/login', (req, res) => {
            LoginPage.render(req, res);
        });
        
        // Login config for client-side
        this.app.get('/auth/config', (req, res) => {
            const config = LoginPage.getConfig();
            res.json(config);
        });
        
        // OAuth callback
        this.app.get('/auth/callback', async (req, res) => {
            await this.oauthHandler.handleCallback(req, res);
        });
        
        // Logout
        this.app.get('/auth/logout', requireAuth, async (req, res) => {
            await this.logoutHandler.handleLogout(req, res);
        });
        
        // Pending approval page
        this.app.get('/auth/pending', requireAuth, (req, res) => {
            if (req.currentUser.role !== 'Pending') {
                return res.redirect('/dashboard');
            }
            res.send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Pending Approval</title>
                    <link rel="stylesheet" href="/css/main.css">
                </head>
                <body>
                    <div class="success-container">
                        <div class="success-icon" style="background: #ffc107; color: #333;">⏳</div>
                        <h1>Account Pending Approval</h1>
                        <p>Your account is waiting for administrator approval.</p>
                        <p>Please contact Muhammad.shammas@gmrlgroup.com</p>
                        <a href="/auth/logout" class="btn btn-secondary">Logout</a>
                    </div>
                </body>
                </html>
            `);
        });
        
        // Session info
        this.app.get('/auth/session', requireAuth, (req, res) => {
            res.json({
                user: {
                    id: req.currentUser.id,
                    email: req.currentUser.email,
                    displayName: req.currentUser.displayName,
                    role: req.currentUser.role
                }
            });
        });
        
        console.log('[AUTH] Routes configured');
    }
    
    setupSessionCleanup() {
        // Cleanup expired sessions every hour
        setInterval(async () => {
            try {
                await SessionManager.cleanupExpiredSessions();
            } catch (error) {
                console.error('[AUTH] Session cleanup error:', error.message);
            }
        }, 60 * 60 * 1000);
        
        console.log('[AUTH] Session cleanup scheduled');
    }
}

module.exports = AuthServer;
