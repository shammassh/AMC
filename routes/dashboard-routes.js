/**
 * Dashboard Routes
 * View all checklists and statistics
 */

const express = require('express');
const router = express.Router();

const ChecklistService = require('../services/checklist-service');
const StoreService = require('../services/store-service');

// ==========================================
// Main Dashboard
// ==========================================

router.get('/', async (req, res) => {
    try {
        let checklists;
        let stores;

        // Get data based on role
        if (req.currentUser.role === 'Admin' || req.currentUser.role === 'HeadOfOperations') {
            checklists = await ChecklistService.getAll({ limit: 50 });
            stores = await StoreService.getActive();
        } else {
            // Area Manager - only their checklists
            checklists = await ChecklistService.getSubmittedByUser(req.currentUser.id);
            stores = await StoreService.getStoresForUser(req.currentUser.id);
        }

        const stats = await ChecklistService.getStats();

        res.send(renderDashboardPage(req.currentUser, `
            <div class="dashboard-header">
                <h1>📊 Dashboard</h1>
                <a href="/checklist/new" class="btn btn-primary btn-lg">+ New Checklist</a>
            </div>

            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-value">${stats.TotalChecklists || 0}</div>
                    <div class="stat-label">Total Checklists</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value ${getScoreClass(stats.AverageScore)}">${stats.AverageScore ? stats.AverageScore.toFixed(1) + '%' : '-'}</div>
                    <div class="stat-label">Average Score</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${stats.MinScore ? stats.MinScore.toFixed(1) + '%' : '-'}</div>
                    <div class="stat-label">Lowest Score</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${stats.MaxScore ? stats.MaxScore.toFixed(1) + '%' : '-'}</div>
                    <div class="stat-label">Highest Score</div>
                </div>
            </div>

            <div class="section-header">
                <h2>Recent Checklists</h2>
            </div>

            ${checklists.length === 0 ? `
                <div class="empty-state">
                    <p>No checklists submitted yet.</p>
                    <a href="/checklist/new" class="btn btn-primary">Create First Checklist</a>
                </div>
            ` : `
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Document #</th>
                            <th>Store</th>
                            <th>Audit Date</th>
                            <th>Submitted By</th>
                            <th width="100">Score</th>
                            <th width="120">Status</th>
                            <th width="100">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${checklists.map(c => `
                            <tr>
                                <td><strong>${c.DocumentNumber}</strong></td>
                                <td>${escapeHtml(c.StoreName)}</td>
                                <td>${formatDate(c.AuditDate)}</td>
                                <td>${escapeHtml(c.SubmittedByName)}</td>
                                <td class="center">
                                    <span class="score-badge ${getScoreClass(c.ScorePercentage)}">${c.ScorePercentage.toFixed(1)}%</span>
                                </td>
                                <td class="center">
                                    <span class="badge badge-success">${c.Status}</span>
                                </td>
                                <td class="center">
                                    <a href="/checklist/view/${c.Id}" class="btn btn-sm btn-secondary">View</a>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `}

            ${req.currentUser.role === 'Admin' || req.currentUser.role === 'HeadOfOperations' ? `
                <div class="admin-quick-links">
                    <h3>Admin Quick Links</h3>
                    <a href="/admin/questions" class="btn btn-secondary">📋 Manage Questions</a>
                    <a href="/admin/stores" class="btn btn-secondary">🏪 Manage Stores</a>
                    <a href="/admin/users" class="btn btn-secondary">👥 Manage Users</a>
                    <a href="/admin/assignments" class="btn btn-secondary">📌 Store Assignments</a>
                </div>
            ` : ''}
        `));
    } catch (error) {
        console.error('[DASHBOARD] Error:', error);
        res.status(500).send('Error loading dashboard');
    }
});

// ==========================================
// Helper Functions
// ==========================================

function escapeHtml(text) {
    if (!text) return '';
    return text.toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function formatDate(date) {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('en-GB');
}

function getScoreClass(score) {
    if (score >= 80) return 'score-good';
    if (score >= 60) return 'score-warning';
    return 'score-bad';
}

function renderDashboardPage(user, content) {
    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Dashboard - Area Manager Checklist</title>
            <link rel="stylesheet" href="/css/main.css">
        </head>
        <body>
            <nav class="navbar">
                <div class="nav-brand">
                    <span class="nav-logo">📋</span>
                    Area Manager Checklist
                </div>
                <div class="nav-user">
                    <span>${user.displayName}</span>
                    <span class="badge badge-primary">${user.role}</span>
                    <a href="/auth/logout" class="btn btn-sm btn-secondary">Logout</a>
                </div>
            </nav>

            <main class="main-content">
                ${content}
            </main>
        </body>
        </html>
    `;
}

module.exports = router;
