/**
 * Dashboard Routes
 * View all checklists and statistics
 */

const express = require('express');
const router = express.Router();

const ChecklistService = require('../services/checklist-service');
const StoreService = require('../services/store-service');
const UserService = require('../services/user-service');
const SettingsService = require('../services/settings-service');

// ==========================================
// Main Dashboard
// ==========================================

router.get('/', async (req, res) => {
    try {
        let checklists;
        let stores;
        let areaManagers = [];
        
        // Get filter parameters
        const filterStore = req.query.store ? parseInt(req.query.store) : null;
        const filterUser = req.query.user ? parseInt(req.query.user) : null;
        const filterFromDate = req.query.fromDate || '';
        const filterToDate = req.query.toDate || '';

        // Get data based on role
        if (req.currentUser.role === 'Admin' || req.currentUser.role === 'HeadOfOperations') {
            checklists = await ChecklistService.getAll({ limit: 500 });
            stores = await StoreService.getActive();
            areaManagers = await UserService.getAreaManagers();
        } else {
            // Area Manager - only their checklists
            checklists = await ChecklistService.getSubmittedByUser(req.currentUser.id);
            stores = await StoreService.getStoresForUser(req.currentUser.id);
        }

        // Apply filters
        if (filterStore) {
            checklists = checklists.filter(c => c.StoreId === filterStore);
        }
        if (filterUser) {
            checklists = checklists.filter(c => c.SubmittedBy === filterUser);
        }
        if (filterFromDate) {
            const fromDate = new Date(filterFromDate);
            checklists = checklists.filter(c => new Date(c.AuditDate) >= fromDate);
        }
        if (filterToDate) {
            const toDate = new Date(filterToDate);
            toDate.setHours(23, 59, 59, 999); // Include the entire day
            checklists = checklists.filter(c => new Date(c.AuditDate) <= toDate);
        }

        const stats = await ChecklistService.getStats();
        const passingScore = await SettingsService.getPassingScore();
        const isAdminOrHOO = req.currentUser.role === 'Admin' || req.currentUser.role === 'HeadOfOperations';

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

            ${isAdminOrHOO ? `
            <div class="filter-bar">
                <div class="filter-group">
                    <label>Store:</label>
                    <select id="filterStore" onchange="applyFilters()">
                        <option value="">All Stores</option>
                        ${stores.map(s => `<option value="${s.Id}" ${filterStore === s.Id ? 'selected' : ''}>${escapeHtml(s.StoreName)}</option>`).join('')}
                    </select>
                </div>
                <div class="filter-group">
                    <label>Area Manager:</label>
                    <select id="filterUser" onchange="applyFilters()">
                        <option value="">All Area Managers</option>
                        ${areaManagers.map(u => `<option value="${u.Id}" ${filterUser === u.Id ? 'selected' : ''}>${escapeHtml(u.DisplayName)}</option>`).join('')}
                    </select>
                </div>
                <div class="filter-group">
                    <label>From:</label>
                    <input type="date" id="filterFromDate" value="${filterFromDate}" onchange="applyFilters()">
                </div>
                <div class="filter-group">
                    <label>To:</label>
                    <input type="date" id="filterToDate" value="${filterToDate}" onchange="applyFilters()">
                </div>
                <button class="btn btn-sm btn-secondary" onclick="clearFilters()">Clear</button>
            </div>
            <style>
                .filter-bar {
                    display: flex;
                    gap: 15px;
                    align-items: center;
                    background: #f5f5f5;
                    padding: 15px 20px;
                    border-radius: 8px;
                    margin-bottom: 20px;
                    flex-wrap: wrap;
                }
                .filter-group {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                .filter-group label {
                    font-weight: 500;
                    color: #555;
                    white-space: nowrap;
                }
                .filter-group select, .filter-group input[type="date"] {
                    padding: 8px 12px;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                }
                .filter-group select {
                    min-width: 150px;
                }
                .filter-group input[type="date"] {
                    min-width: 140px;
                }
            </style>
            <script>
                function applyFilters() {
                    const store = document.getElementById('filterStore').value;
                    const user = document.getElementById('filterUser').value;
                    const fromDate = document.getElementById('filterFromDate').value;
                    const toDate = document.getElementById('filterToDate').value;
                    let url = '/dashboard?';
                    if (store) url += 'store=' + store + '&';
                    if (user) url += 'user=' + user + '&';
                    if (fromDate) url += 'fromDate=' + fromDate + '&';
                    if (toDate) url += 'toDate=' + toDate + '&';
                    window.location.href = url;
                }
                function clearFilters() {
                    window.location.href = '/dashboard';
                }
            </script>
            ` : ''}

            ${checklists.length === 0 ? `
                <div class="empty-state">
                    <p>No checklists found${filterStore || filterUser ? ' matching the filters' : ''}.</p>
                    ${!filterStore && !filterUser ? '<a href="/checklist/new" class="btn btn-primary">Create First Checklist</a>' : '<button class="btn btn-secondary" onclick="clearFilters()">Clear Filters</button>'}
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
                        ${checklists.map(c => {
                            const passed = c.ScorePercentage >= passingScore;
                            return `
                            <tr>
                                <td><strong>${c.DocumentNumber}</strong></td>
                                <td>${escapeHtml(c.StoreName)}</td>
                                <td>${formatDate(c.AuditDate)}</td>
                                <td>${escapeHtml(c.SubmittedByName)}</td>
                                <td class="center">
                                    <span class="score-badge ${getScoreClass(c.ScorePercentage)}">${c.ScorePercentage.toFixed(1)}%</span>
                                </td>
                                <td class="center">
                                    <span class="badge ${passed ? 'badge-success' : 'badge-danger'}">${passed ? 'Pass' : 'Fail'}</span>
                                </td>
                                <td class="center">
                                    <a href="/checklist/view/${c.Id}" class="btn btn-sm btn-secondary">View</a>
                                </td>
                            </tr>
                        `}).join('')}
                    </tbody>
                </table>
            `}

            ${req.currentUser.role === 'Admin' || req.currentUser.role === 'HeadOfOperations' ? `
                <div class="admin-quick-links">
                    <h3>${req.currentUser.role === 'Admin' ? 'Admin' : 'Management'} Quick Links</h3>
                    <a href="/admin/questions" class="btn btn-secondary">📋 Manage Questions</a>
                    <a href="/admin/stores" class="btn btn-secondary">🏪 Manage Stores</a>
                    ${req.currentUser.role === 'Admin' ? '<a href="/admin/users" class="btn btn-secondary">👥 Manage Users</a>' : ''}
                    ${req.currentUser.role === 'Admin' ? '<a href="/admin/assignments" class="btn btn-secondary">📌 Store Assignments</a>' : ''}
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
    const impersonationBanner = user.isImpersonating ? `
        <div id="impersonationBanner" style="background: linear-gradient(90deg, #ff6b6b, #ee5a5a); color: white; padding: 10px 20px; text-align: center; position: sticky; top: 0; z-index: 9999; display: flex; justify-content: center; align-items: center; gap: 15px;">
            <span>👁️ <strong>Viewing as:</strong> ${user.displayName} (${user.role})</span>
            <button onclick="stopImpersonation()" style="background: white; color: #ee5a5a; border: none; padding: 5px 15px; border-radius: 5px; cursor: pointer; font-weight: bold;">✕ Stop Viewing</button>
        </div>
        <script>
            async function stopImpersonation() {
                await fetch('/api/impersonate/stop', { method: 'POST' });
                window.location.href = '/admin/users';
            }
        </script>
    ` : '';
    
    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Dashboard - Area Manager Checklist</title>
            <link rel="icon" type="image/x-icon" href="/favicon.ico">
            <link rel="stylesheet" href="/css/main.css">
        </head>
        <body>
            ${impersonationBanner}
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
