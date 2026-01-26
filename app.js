/**
 * Area Manager Checklist App
 * Main Application Entry Point
 */

require('dotenv').config();

const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');

// Import auth module
const AuthServer = require('./auth/auth-server');

// Import services
const DatabaseService = require('./services/database-service');
const QuestionService = require('./services/question-service');
const StoreService = require('./services/store-service');
const ChecklistService = require('./services/checklist-service');

// Import routes
const adminRoutes = require('./routes/admin-routes');
const checklistRoutes = require('./routes/checklist-routes');
const dashboardRoutes = require('./routes/dashboard-routes');
const apiRoutes = require('./routes/api-routes');

const app = express();
const PORT = process.env.PORT || 6060;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Initialize Authentication
const authServer = new AuthServer(app);

// Get middleware from auth
const { requireAuth, requireRole } = require('./auth/middleware/require-auth');

// ==========================================
// Public Routes
// ==========================================

// Home page - redirect to login or dashboard
app.get('/', (req, res) => {
    res.redirect('/auth/login');
});

// ==========================================
// Protected Routes
// ==========================================

// Dashboard (all users)
app.use('/dashboard', requireAuth, dashboardRoutes);

// Checklist routes (Area Managers)
app.use('/checklist', requireAuth, checklistRoutes);

// Admin routes (Admin & Head of Operations)
app.use('/admin', requireAuth, requireRole(['Admin', 'HeadOfOperations']), adminRoutes);

// API routes
app.use('/api', requireAuth, apiRoutes);

// ==========================================
// Error Handling
// ==========================================

app.use((err, req, res, next) => {
    console.error('[ERROR]', err);
    res.status(500).send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Error - Area Manager Checklist</title>
            <link rel="stylesheet" href="/css/main.css">
        </head>
        <body>
            <div class="error-container">
                <h1>Something went wrong</h1>
                <p>${err.message || 'An unexpected error occurred'}</p>
                <a href="/dashboard" class="btn btn-primary">Go to Dashboard</a>
            </div>
        </body>
        </html>
    `);
});

// ==========================================
// Start Server
// ==========================================

async function startServer() {
    try {
        // Initialize database connection
        await DatabaseService.initialize();
        console.log('[DB] Database connected successfully');

        // Start HTTP server
        app.listen(PORT, () => {
            console.log('');
            console.log('=============================================');
            console.log('  Area Manager Checklist App');
            console.log('=============================================');
            console.log(`  URL: http://localhost:${PORT}`);
            console.log(`  Admin: ${process.env.ADMIN_EMAIL}`);
            console.log('=============================================');
            console.log('');
        });
    } catch (error) {
        console.error('[STARTUP ERROR]', error);
        process.exit(1);
    }
}

startServer();
