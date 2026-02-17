/**
 * API Routes
 * REST API endpoints for AJAX calls
 */

const express = require('express');
const router = express.Router();

const QuestionService = require('../services/question-service');
const StoreService = require('../services/store-service');
const UserService = require('../services/user-service');
const ChecklistService = require('../services/checklist-service');
const SharePointService = require('../services/sharepoint-service');
const SessionManager = require('../auth/services/session-manager');

// Middleware to check admin/manager role
const requireAdminOrManager = (req, res, next) => {
    if (req.currentUser.role !== 'Admin' && req.currentUser.role !== 'HeadOfOperations') {
        return res.status(403).json({ error: 'Access denied' });
    }
    next();
};

// ==========================================
// Questions API
// ==========================================

router.get('/questions', async (req, res) => {
    try {
        const questions = await QuestionService.getAll();
        res.json(questions);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/questions/:id/toggle', requireAdminOrManager, async (req, res) => {
    try {
        const question = await QuestionService.toggleActive(req.params.id);
        res.json(question);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// Stores API
// ==========================================

router.get('/stores', async (req, res) => {
    try {
        const stores = await StoreService.getActive();
        res.json(stores);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/stores/my', async (req, res) => {
    try {
        const stores = await StoreService.getStoresForUser(req.currentUser.id);
        res.json(stores);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/stores/:id/toggle', requireAdminOrManager, async (req, res) => {
    try {
        const store = await StoreService.toggleActive(req.params.id);
        res.json(store);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// Users API
// ==========================================

router.get('/users', requireAdminOrManager, async (req, res) => {
    try {
        const users = await UserService.getAll();
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/users/:id/role', requireAdminOrManager, async (req, res) => {
    try {
        const user = await UserService.updateRole(req.params.id, req.body.roleId);
        res.json({ success: true, user });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/users/:id/toggle', requireAdminOrManager, async (req, res) => {
    try {
        const user = await UserService.toggleActive(req.params.id);
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/users/sync-sharepoint', requireAdminOrManager, async (req, res) => {
    try {
        console.log('[API] Starting SharePoint sync with user token...');
        // Use the logged-in user's access token to access SharePoint
        const userToken = req.currentUser.accessToken;
        if (!userToken) {
            return res.status(400).json({ 
                success: false, 
                error: 'No access token available. Please log out and log in again.' 
            });
        }
        const result = await SharePointService.syncUsersWithUserToken(userToken);
        res.json({ success: true, data: result });
    } catch (error) {
        console.error('[API] SharePoint sync error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/users/add', requireAdminOrManager, async (req, res) => {
    try {
        const { email, displayName, roleId } = req.body;
        
        if (!email || !displayName || !roleId) {
            return res.status(400).json({ success: false, error: 'Email, Display Name and Role are required' });
        }
        
        const user = await UserService.create(email, displayName, roleId);
        res.json({ success: true, user });
    } catch (error) {
        console.error('[API] Add user error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/users/bulk-import', requireAdminOrManager, async (req, res) => {
    try {
        const { users } = req.body;
        
        if (!users || !Array.isArray(users) || users.length === 0) {
            return res.status(400).json({ success: false, error: 'No users provided' });
        }
        
        const results = {
            added: 0,
            skipped: 0,
            errors: []
        };
        
        for (const user of users) {
            try {
                if (!user.email || !user.displayName) {
                    results.errors.push(`Invalid user data: ${JSON.stringify(user)}`);
                    continue;
                }
                
                await UserService.create(user.email, user.displayName, user.roleId || 3);
                results.added++;
                console.log(`[BULK] Added: ${user.email}`);
            } catch (err) {
                if (err.message.includes('already exists')) {
                    results.skipped++;
                } else {
                    results.errors.push(`${user.email}: ${err.message}`);
                }
            }
        }
        
        console.log(`[BULK] Import complete: ${results.added} added, ${results.skipped} skipped, ${results.errors.length} errors`);
        res.json({ success: true, ...results });
    } catch (error) {
        console.error('[API] Bulk import error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==========================================
// Assignments API
// ==========================================

router.post('/assignments/remove', requireAdminOrManager, async (req, res) => {
    try {
        await StoreService.unassignFromUser(req.body.storeId, req.body.userId);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// Checklists API
// ==========================================

router.get('/checklists', async (req, res) => {
    try {
        const filters = {
            storeId: req.query.storeId,
            fromDate: req.query.fromDate,
            toDate: req.query.toDate,
            limit: req.query.limit
        };

        let checklists;
        if (req.currentUser.role === 'Admin' || req.currentUser.role === 'HeadOfOperations') {
            checklists = await ChecklistService.getAll(filters);
        } else {
            checklists = await ChecklistService.getSubmittedByUser(req.currentUser.id);
        }
        
        res.json(checklists);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/checklists/:id', async (req, res) => {
    try {
        const checklist = await ChecklistService.getById(req.params.id);
        if (!checklist) {
            return res.status(404).json({ error: 'Checklist not found' });
        }
        res.json(checklist);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/checklists/stats', async (req, res) => {
    try {
        const filters = {
            storeId: req.query.storeId,
            fromDate: req.query.fromDate,
            toDate: req.query.toDate
        };
        const stats = await ChecklistService.getStats(filters);
        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// Impersonation API (Admin only)
// ==========================================

router.post('/impersonate/:userId', (req, res) => {
    // Only real admins can impersonate (check realUser, not currentUser)
    if (req.realUser?.role !== 'Admin') {
        return res.status(403).json({ error: 'Only Admin can impersonate users' });
    }
    
    const userId = req.params.userId;
    res.cookie('impersonate_user', userId, { 
        httpOnly: true, 
        secure: process.env.NODE_ENV === 'production',
        maxAge: 60 * 60 * 1000 // 1 hour
    });
    res.json({ success: true, message: 'Now viewing as user ' + userId });
});

router.post('/impersonate/stop', (req, res) => {
    res.clearCookie('impersonate_user');
    res.json({ success: true, message: 'Stopped impersonation' });
});

// ==========================================
// Session Management API (Admin Only)
// ==========================================

// Middleware to check admin role
const requireAdmin = (req, res, next) => {
    if (req.currentUser.role !== 'Admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
};

// Get all active sessions
router.get('/admin/sessions', requireAdmin, async (req, res) => {
    try {
        const sessions = await SessionManager.getAllActiveSessions();
        res.json(sessions);
    } catch (error) {
        console.error('[API] Get sessions error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Terminate a specific session by ID
router.delete('/admin/sessions/:sessionId', requireAdmin, async (req, res) => {
    try {
        const sessionId = parseInt(req.params.sessionId);
        const deleted = await SessionManager.deleteSessionById(sessionId);
        res.json({ success: true, deleted });
    } catch (error) {
        console.error('[API] Delete session error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Terminate all sessions for a user
router.delete('/admin/sessions/user/:userId', requireAdmin, async (req, res) => {
    try {
        const userId = parseInt(req.params.userId);
        const deleted = await SessionManager.deleteUserSessions(userId);
        res.json({ success: true, deleted });
    } catch (error) {
        console.error('[API] Delete user sessions error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Cleanup expired sessions
router.post('/admin/sessions/cleanup', requireAdmin, async (req, res) => {
    try {
        const count = await SessionManager.cleanupExpiredSessions();
        res.json({ success: true, count });
    } catch (error) {
        console.error('[API] Cleanup sessions error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
