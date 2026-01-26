/**
 * Admin Routes
 * Manage questions, stores, users, assignments
 */

const express = require('express');
const router = express.Router();

const QuestionService = require('../services/question-service');
const StoreService = require('../services/store-service');
const UserService = require('../services/user-service');
const SharePointService = require('../services/sharepoint-service');

// ==========================================
// Admin Dashboard
// ==========================================

router.get('/', (req, res) => {
    res.redirect('/admin/questions');
});

// ==========================================
// Questions Management
// ==========================================

router.get('/questions', async (req, res) => {
    try {
        const questions = await QuestionService.getAllForAdmin();
        const totalCoeff = await QuestionService.getTotalCoefficient();
        
        res.send(renderAdminPage(req.currentUser, 'questions', `
            <div class="admin-header">
                <h1>📋 Checklist Questions</h1>
                <button class="btn btn-primary" onclick="showAddQuestionModal()">+ Add Question</button>
            </div>
            
            <div class="stats-card">
                <span class="stats-label">Total Active Questions:</span>
                <span class="stats-value">${questions.filter(q => q.IsActive).length}</span>
                <span class="stats-label" style="margin-left: 30px;">Total Coefficient:</span>
                <span class="stats-value">${totalCoeff}</span>
            </div>

            <div class="scoring-info">
                <h3>📊 Scoring Rules</h3>
                <div class="scoring-grid">
                    <div class="score-rule yes">
                        <span class="answer-label">✓ Yes</span>
                        <span class="answer-desc">= Full Coefficient (Weight)</span>
                    </div>
                    <div class="score-rule no">
                        <span class="answer-label">✗ No</span>
                        <span class="answer-desc">= 0 (Zero)</span>
                    </div>
                    <div class="score-rule na">
                        <span class="answer-label">N/A</span>
                        <span class="answer-desc">= Not Counted (Excluded)</span>
                    </div>
                </div>
                <p class="scoring-formula"><strong>Score %</strong> = (Total Earned ÷ Applicable Coefficient) × 100</p>
            </div>

            <table class="data-table">
                <thead>
                    <tr>
                        <th width="50">#</th>
                        <th>Question</th>
                        <th width="100">Coefficient</th>
                        <th width="150">Answers</th>
                        <th width="80">Status</th>
                        <th width="150">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${questions.map((q, i) => `
                        <tr class="${q.IsActive ? '' : 'inactive'}">
                            <td>${i + 1}</td>
                            <td>${escapeHtml(q.QuestionText)}</td>
                            <td class="center"><strong>${q.Coefficient}</strong></td>
                            <td class="center">
                                <span class="badge badge-success">Yes</span>
                                <span class="badge badge-danger">No</span>
                                <span class="badge badge-secondary">NA</span>
                            </td>
                            <td class="center">
                                <span class="badge ${q.IsActive ? 'badge-success' : 'badge-secondary'}">
                                    ${q.IsActive ? 'Active' : 'Inactive'}
                                </span>
                            </td>
                            <td class="center">
                                <button class="btn btn-sm btn-secondary" onclick="editQuestion(${q.Id}, '${escapeHtml(q.QuestionText).replace(/'/g, "\\'")}', ${q.Coefficient}, ${q.SortOrder})">Edit</button>
                                <button class="btn btn-sm ${q.IsActive ? 'btn-warning' : 'btn-success'}" onclick="toggleQuestion(${q.Id})">${q.IsActive ? 'Disable' : 'Enable'}</button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>

            <!-- Add/Edit Question Modal -->
            <div id="questionModal" class="modal">
                <div class="modal-content">
                    <h2 id="questionModalTitle">Add Question</h2>
                    <form id="questionForm" action="/admin/questions/save" method="POST">
                        <input type="hidden" id="questionId" name="id" value="">
                        <div class="form-group">
                            <label>Question Text</label>
                            <textarea id="questionText" name="questionText" rows="3" required placeholder="Enter your question here..."></textarea>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label>Coefficient (Weight)</label>
                                <input type="number" id="coefficient" name="coefficient" step="0.01" min="0.01" value="1.00" required>
                            </div>
                            <div class="form-group">
                                <label>Sort Order</label>
                                <input type="number" id="sortOrder" name="sortOrder" min="0" value="${questions.length + 1}">
                            </div>
                        </div>
                        <div class="form-group">
                            <label>Answers</label>
                            <div class="answers-display">
                                <span class="badge badge-success">Yes</span> = Full Coefficient
                                <span class="badge badge-danger">No</span> = Zero
                                <span class="badge badge-secondary">NA</span> = Not Counted
                            </div>
                        </div>
                        <div class="form-actions">
                            <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
                            <button type="submit" class="btn btn-primary">Save Question</button>
                        </div>
                    </form>
                </div>
            </div>

            <script>
                function showAddQuestionModal() {
                    document.getElementById('questionModalTitle').textContent = 'Add Question';
                    document.getElementById('questionId').value = '';
                    document.getElementById('questionText').value = '';
                    document.getElementById('coefficient').value = '1.00';
                    document.getElementById('sortOrder').value = '${questions.length + 1}';
                    document.getElementById('questionModal').style.display = 'flex';
                }
                
                function editQuestion(id, text, coeff, order) {
                    document.getElementById('questionModalTitle').textContent = 'Edit Question';
                    document.getElementById('questionId').value = id;
                    document.getElementById('questionText').value = text;
                    document.getElementById('coefficient').value = coeff;
                    document.getElementById('sortOrder').value = order;
                    document.getElementById('questionModal').style.display = 'flex';
                }
                
                function closeModal() {
                    document.getElementById('questionModal').style.display = 'none';
                }
                
                async function toggleQuestion(id) {
                    await fetch('/api/questions/' + id + '/toggle', { method: 'POST' });
                    location.reload();
                }
            </script>
        `));
    } catch (error) {
        console.error('[ADMIN] Questions error:', error);
        res.status(500).send('Error loading questions');
    }
});

router.post('/questions/save', async (req, res) => {
    try {
        const { id, questionText, coefficient, sortOrder } = req.body;
        
        if (id) {
            await QuestionService.update(id, questionText, parseFloat(coefficient), parseInt(sortOrder));
        } else {
            await QuestionService.create(questionText, parseFloat(coefficient), parseInt(sortOrder));
        }
        
        res.redirect('/admin/questions');
    } catch (error) {
        console.error('[ADMIN] Save question error:', error);
        res.status(500).send('Error saving question');
    }
});

// ==========================================
// Stores Management
// ==========================================

router.get('/stores', async (req, res) => {
    try {
        const stores = await StoreService.getAll();
        
        res.send(renderAdminPage(req.currentUser, 'stores', `
            <div class="admin-header">
                <h1>🏪 Stores</h1>
                <button class="btn btn-primary" onclick="showAddStoreModal()">+ Add Store</button>
            </div>

            <table class="data-table">
                <thead>
                    <tr>
                        <th width="50">#</th>
                        <th>Store Name</th>
                        <th width="150">Store Code</th>
                        <th width="100">Status</th>
                        <th width="150">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${stores.map((s, i) => `
                        <tr class="${s.IsActive ? '' : 'inactive'}">
                            <td>${i + 1}</td>
                            <td>${escapeHtml(s.StoreName)}</td>
                            <td>${s.StoreCode || '-'}</td>
                            <td class="center">
                                <span class="badge ${s.IsActive ? 'badge-success' : 'badge-secondary'}">
                                    ${s.IsActive ? 'Active' : 'Inactive'}
                                </span>
                            </td>
                            <td class="center">
                                <button class="btn btn-sm btn-secondary" onclick="editStore(${s.Id}, '${escapeHtml(s.StoreName).replace(/'/g, "\\'")}', '${s.StoreCode || ''}')">Edit</button>
                                <button class="btn btn-sm ${s.IsActive ? 'btn-warning' : 'btn-success'}" onclick="toggleStore(${s.Id})">${s.IsActive ? 'Disable' : 'Enable'}</button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>

            <!-- Add/Edit Store Modal -->
            <div id="storeModal" class="modal">
                <div class="modal-content">
                    <h2 id="storeModalTitle">Add Store</h2>
                    <form action="/admin/stores/save" method="POST">
                        <input type="hidden" id="storeId" name="id" value="">
                        <div class="form-group">
                            <label>Store Name</label>
                            <input type="text" id="storeName" name="storeName" required>
                        </div>
                        <div class="form-group">
                            <label>Store Code (optional)</label>
                            <input type="text" id="storeCode" name="storeCode">
                        </div>
                        <div class="form-actions">
                            <button type="button" class="btn btn-secondary" onclick="closeStoreModal()">Cancel</button>
                            <button type="submit" class="btn btn-primary">Save Store</button>
                        </div>
                    </form>
                </div>
            </div>

            <script>
                function showAddStoreModal() {
                    document.getElementById('storeModalTitle').textContent = 'Add Store';
                    document.getElementById('storeId').value = '';
                    document.getElementById('storeName').value = '';
                    document.getElementById('storeCode').value = '';
                    document.getElementById('storeModal').style.display = 'flex';
                }
                
                function editStore(id, name, code) {
                    document.getElementById('storeModalTitle').textContent = 'Edit Store';
                    document.getElementById('storeId').value = id;
                    document.getElementById('storeName').value = name;
                    document.getElementById('storeCode').value = code;
                    document.getElementById('storeModal').style.display = 'flex';
                }
                
                function closeStoreModal() {
                    document.getElementById('storeModal').style.display = 'none';
                }
                
                async function toggleStore(id) {
                    await fetch('/api/stores/' + id + '/toggle', { method: 'POST' });
                    location.reload();
                }
            </script>
        `));
    } catch (error) {
        console.error('[ADMIN] Stores error:', error);
        res.status(500).send('Error loading stores');
    }
});

router.post('/stores/save', async (req, res) => {
    try {
        const { id, storeName, storeCode } = req.body;
        
        if (id) {
            await StoreService.update(id, storeName, storeCode);
        } else {
            await StoreService.create(storeName, storeCode);
        }
        
        res.redirect('/admin/stores');
    } catch (error) {
        console.error('[ADMIN] Save store error:', error);
        res.status(500).send('Error saving store');
    }
});

// ==========================================
// Users Management
// ==========================================

router.get('/users', async (req, res) => {
    try {
        const users = await UserService.getAll();
        const roles = await UserService.getAllRoles();
        
        // Count users by role
        const roleCounts = {
            Admin: users.filter(u => u.RoleName === 'Admin').length,
            HeadOfOperations: users.filter(u => u.RoleName === 'HeadOfOperations').length,
            AreaManager: users.filter(u => u.RoleName === 'AreaManager').length,
            Pending: users.filter(u => u.RoleName === 'Pending').length
        };
        
        res.send(renderAdminPage(req.currentUser, 'users', `
            <div class="admin-header">
                <h1>👥 Users</h1>
                <div class="header-actions">
                    <button class="btn btn-primary" onclick="showAddUserModal()">+ Add User</button>
                    <button class="btn btn-success" onclick="showBulkImportModal()">📥 Bulk Import</button>
                    <button class="btn btn-secondary" onclick="syncFromSharePoint()" id="syncBtn">
                        <span id="syncIcon">🔄</span> Sync from SharePoint
                    </button>
                </div>
            </div>

            <!-- Role Stats Badges -->
            <div class="role-stats" style="display: flex; gap: 15px; margin-bottom: 20px; flex-wrap: wrap;">
                <div class="role-badge" onclick="filterByRole('Admin')" style="cursor: pointer; padding: 12px 20px; background: linear-gradient(135deg, #dc3545, #c82333); color: white; border-radius: 10px; text-align: center; min-width: 120px; box-shadow: 0 2px 8px rgba(220,53,69,0.3);">
                    <div style="font-size: 28px; font-weight: bold;">${roleCounts.Admin}</div>
                    <div style="font-size: 12px; opacity: 0.9;">👑 Admin</div>
                </div>
                <div class="role-badge" onclick="filterByRole('HeadOfOperations')" style="cursor: pointer; padding: 12px 20px; background: linear-gradient(135deg, #6f42c1, #5a32a3); color: white; border-radius: 10px; text-align: center; min-width: 120px; box-shadow: 0 2px 8px rgba(111,66,193,0.3);">
                    <div style="font-size: 28px; font-weight: bold;">${roleCounts.HeadOfOperations}</div>
                    <div style="font-size: 12px; opacity: 0.9;">📊 Head of Ops</div>
                </div>
                <div class="role-badge" onclick="filterByRole('AreaManager')" style="cursor: pointer; padding: 12px 20px; background: linear-gradient(135deg, #28a745, #1e7e34); color: white; border-radius: 10px; text-align: center; min-width: 120px; box-shadow: 0 2px 8px rgba(40,167,69,0.3);">
                    <div style="font-size: 28px; font-weight: bold;">${roleCounts.AreaManager}</div>
                    <div style="font-size: 12px; opacity: 0.9;">📋 Area Manager</div>
                </div>
                <div class="role-badge" onclick="filterByRole('Pending')" style="cursor: pointer; padding: 12px 20px; background: linear-gradient(135deg, #ffc107, #e0a800); color: #333; border-radius: 10px; text-align: center; min-width: 120px; box-shadow: 0 2px 8px rgba(255,193,7,0.3);">
                    <div style="font-size: 28px; font-weight: bold;">${roleCounts.Pending}</div>
                    <div style="font-size: 12px; opacity: 0.9;">⏳ Pending</div>
                </div>
                <div class="role-badge" onclick="filterByRole('')" style="cursor: pointer; padding: 12px 20px; background: linear-gradient(135deg, #17a2b8, #138496); color: white; border-radius: 10px; text-align: center; min-width: 120px; box-shadow: 0 2px 8px rgba(23,162,184,0.3);">
                    <div style="font-size: 28px; font-weight: bold;">${users.length}</div>
                    <div style="font-size: 12px; opacity: 0.9;">👥 Total</div>
                </div>
            </div>

            <div id="syncResult" class="sync-result" style="display: none;"></div>

            <!-- Search Box -->
            <div class="search-box" style="margin-bottom: 20px;">
                <input type="text" id="userSearch" placeholder="🔍 Search by name or email..." 
                       onkeyup="filterUsers()" style="width: 100%; max-width: 400px; padding: 12px 16px; font-size: 16px; border: 1px solid #ddd; border-radius: 8px;">
                <span id="userCount" style="margin-left: 15px; color: #666;">${users.length} users</span>
            </div>

            <table class="data-table" id="usersTable">
                <thead>
                    <tr>
                        <th width="50">#</th>
                        <th>Name</th>
                        <th>Email</th>
                        <th width="150">Role</th>
                        <th width="100">Status</th>
                        <th width="150">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${users.map((u, i) => `
                        <tr class="${u.IsActive ? '' : 'inactive'}" data-name="${escapeHtml(u.DisplayName || '').toLowerCase()}" data-email="${escapeHtml(u.Email).toLowerCase()}" data-role="${u.RoleName || ''}">
                            <td class="row-num">${i + 1}</td>
                            <td>${escapeHtml(u.DisplayName || 'N/A')}</td>
                            <td>${escapeHtml(u.Email)}</td>
                            <td>
                                <select class="role-select" onchange="changeRole(${u.Id}, this.value, this)" ${u.Email.toLowerCase() === '${process.env.ADMIN_EMAIL?.toLowerCase()}' ? 'disabled' : ''}>
                                    ${roles.map(r => `
                                        <option value="${r.Id}" ${u.RoleId === r.Id ? 'selected' : ''}>${r.RoleName}</option>
                                    `).join('')}
                                </select>
                            </td>
                            <td class="center">
                                <span class="badge ${u.IsActive ? 'badge-success' : 'badge-secondary'}">
                                    ${u.IsActive ? 'Active' : 'Inactive'}
                                </span>
                            </td>
                            <td class="center">
                                <button class="btn btn-sm ${u.IsActive ? 'btn-warning' : 'btn-success'}" onclick="toggleUser(${u.Id})">${u.IsActive ? 'Disable' : 'Enable'}</button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>

            <script>
                let currentRoleFilter = '';
                
                function filterByRole(role) {
                    currentRoleFilter = role;
                    document.getElementById('userSearch').value = '';
                    
                    // Update badge highlights
                    document.querySelectorAll('.role-badge').forEach(badge => {
                        badge.style.transform = 'scale(1)';
                        badge.style.boxShadow = '';
                    });
                    
                    if (role) {
                        event.target.closest('.role-badge').style.transform = 'scale(1.05)';
                        event.target.closest('.role-badge').style.boxShadow = '0 4px 15px rgba(0,0,0,0.3)';
                    }
                    
                    const rows = document.querySelectorAll('#usersTable tbody tr');
                    let visibleCount = 0;
                    let rowNum = 1;
                    
                    rows.forEach(row => {
                        const rowRole = row.getAttribute('data-role') || '';
                        
                        if (!role || rowRole === role) {
                            row.style.display = '';
                            row.querySelector('.row-num').textContent = rowNum++;
                            visibleCount++;
                        } else {
                            row.style.display = 'none';
                        }
                    });
                    
                    const label = role ? role.replace('HeadOfOperations', 'Head of Ops') : 'Total';
                    document.getElementById('userCount').textContent = visibleCount + ' ' + label + ' users';
                }
                
                function filterUsers() {
                    currentRoleFilter = '';
                    const search = document.getElementById('userSearch').value.toLowerCase().trim();
                    const rows = document.querySelectorAll('#usersTable tbody tr');
                    let visibleCount = 0;
                    let rowNum = 1;
                    
                    rows.forEach(row => {
                        const name = row.getAttribute('data-name') || '';
                        const email = row.getAttribute('data-email') || '';
                        
                        if (name.includes(search) || email.includes(search)) {
                            row.style.display = '';
                            row.querySelector('.row-num').textContent = rowNum++;
                            visibleCount++;
                        } else {
                            row.style.display = 'none';
                        }
                    });
                    
                    document.getElementById('userCount').textContent = visibleCount + ' users' + (search ? ' found' : '');
                }
            
                async function changeRole(userId, roleId, selectElement) {
                    const originalBg = selectElement.style.backgroundColor;
                    selectElement.style.backgroundColor = '#fff3cd'; // Yellow = saving
                    selectElement.disabled = true;
                    
                    try {
                        const response = await fetch('/api/users/' + userId + '/role', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ roleId: parseInt(roleId) })
                        });
                        
                        const result = await response.json();
                        if (result.success) {
                            selectElement.style.backgroundColor = '#d4edda'; // Green = saved
                            setTimeout(() => {
                                selectElement.style.backgroundColor = originalBg;
                            }, 1500);
                            
                            // Show saved notification
                            showNotification('✓ Role saved!', 'success');
                        } else {
                            selectElement.style.backgroundColor = '#f8d7da'; // Red = error
                            showNotification('Error: ' + result.error, 'error');
                        }
                    } catch (err) {
                        selectElement.style.backgroundColor = '#f8d7da';
                        showNotification('Error saving role', 'error');
                    }
                    
                    selectElement.disabled = false;
                }
                
                function showNotification(message, type) {
                    const existing = document.querySelector('.save-notification');
                    if (existing) existing.remove();
                    
                    const notif = document.createElement('div');
                    notif.className = 'save-notification';
                    notif.style.cssText = 'position: fixed; top: 20px; right: 20px; padding: 15px 25px; border-radius: 8px; font-weight: bold; z-index: 9999; box-shadow: 0 4px 15px rgba(0,0,0,0.2); animation: slideIn 0.3s ease;';
                    notif.style.backgroundColor = type === 'success' ? '#28a745' : '#dc3545';
                    notif.style.color = 'white';
                    notif.textContent = message;
                    
                    document.body.appendChild(notif);
                    setTimeout(() => notif.remove(), 2500);
                }
                
                async function toggleUser(id) {
                    await fetch('/api/users/' + id + '/toggle', { method: 'POST' });
                    location.reload();
                }

                async function syncFromSharePoint() {
                    const btn = document.getElementById('syncBtn');
                    const icon = document.getElementById('syncIcon');
                    const resultDiv = document.getElementById('syncResult');
                    
                    btn.disabled = true;
                    icon.style.animation = 'spin 1s linear infinite';
                    resultDiv.style.display = 'none';
                    
                    try {
                        const response = await fetch('/api/users/sync-sharepoint', { method: 'POST' });
                        const result = await response.json();
                        
                        if (result.success) {
                            resultDiv.className = 'sync-result success';
                            resultDiv.innerHTML = \`
                                <strong>✓ Sync Complete!</strong><br>
                                Found: \${result.data.total} members |
                                Added: \${result.data.added} |
                                Updated: \${result.data.updated} |
                                Skipped: \${result.data.skipped}
                                \${result.data.errors.length > 0 ? '<br><small>Errors: ' + result.data.errors.join(', ') + '</small>' : ''}
                            \`;
                            setTimeout(() => location.reload(), 2000);
                        } else {
                            resultDiv.className = 'sync-result error';
                            resultDiv.innerHTML = '<strong>✗ Sync Failed:</strong> ' + result.error;
                        }
                    } catch (err) {
                        resultDiv.className = 'sync-result error';
                        resultDiv.innerHTML = '<strong>✗ Error:</strong> ' + err.message;
                    }
                    
                    resultDiv.style.display = 'block';
                    btn.disabled = false;
                    icon.style.animation = '';
                }

                function showAddUserModal() {
                    document.getElementById('addUserModal').classList.add('active');
                    document.getElementById('userEmail').focus();
                }

                function closeAddUserModal() {
                    document.getElementById('addUserModal').classList.remove('active');
                    document.getElementById('addUserForm').reset();
                }

                async function saveUser(e) {
                    e.preventDefault();
                    const form = e.target;
                    const data = {
                        email: form.email.value,
                        displayName: form.displayName.value,
                        roleId: parseInt(form.roleId.value)
                    };
                    
                    try {
                        const response = await fetch('/api/users/add', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(data)
                        });
                        
                        const result = await response.json();
                        if (result.success) {
                            location.reload();
                        } else {
                            alert('Error: ' + result.error);
                        }
                    } catch (err) {
                        alert('Error: ' + err.message);
                    }
                }

                function showBulkImportModal() {
                    document.getElementById('bulkImportModal').classList.add('active');
                    document.getElementById('userListInput').focus();
                }

                function closeBulkImportModal() {
                    document.getElementById('bulkImportModal').classList.remove('active');
                    document.getElementById('bulkImportForm').reset();
                    document.getElementById('bulkImportResult').style.display = 'none';
                }

                async function bulkImport(e) {
                    e.preventDefault();
                    const btn = document.getElementById('bulkImportBtn');
                    const resultDiv = document.getElementById('bulkImportResult');
                    const userList = document.getElementById('userListInput').value;
                    const roleId = parseInt(document.getElementById('bulkRoleId').value);
                    
                    btn.disabled = true;
                    btn.textContent = 'Importing...';
                    resultDiv.style.display = 'none';
                    
                    // Parse user list
                    const lines = userList.split('\\n').filter(line => line.trim());
                    const users = [];
                    
                    for (const line of lines) {
                        const parts = line.split(',').map(p => p.trim());
                        if (parts.length >= 2) {
                            users.push({
                                email: parts[0],
                                displayName: parts[1],
                                roleId: roleId
                            });
                        } else if (parts.length === 1 && parts[0].includes('@')) {
                            // Email only - generate name from email
                            const email = parts[0];
                            const name = email.split('@')[0].replace(/[._]/g, ' ').replace(/\\b\\w/g, c => c.toUpperCase());
                            users.push({
                                email: email,
                                displayName: name,
                                roleId: roleId
                            });
                        }
                    }
                    
                    if (users.length === 0) {
                        resultDiv.className = 'import-result error';
                        resultDiv.innerHTML = 'No valid users found. Format: email, name';
                        resultDiv.style.display = 'block';
                        btn.disabled = false;
                        btn.textContent = 'Import Users';
                        return;
                    }
                    
                    try {
                        const response = await fetch('/api/users/bulk-import', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ users })
                        });
                        
                        const result = await response.json();
                        
                        if (result.success) {
                            resultDiv.className = 'import-result success';
                            resultDiv.innerHTML = \`<strong>✓ Import Complete!</strong><br>Added: \${result.added} | Skipped: \${result.skipped} | Errors: \${result.errors.length}\`;
                            
                            if (result.added > 0) {
                                setTimeout(() => location.reload(), 2000);
                            }
                        } else {
                            resultDiv.className = 'import-result error';
                            resultDiv.innerHTML = '<strong>✗ Error:</strong> ' + result.error;
                        }
                    } catch (err) {
                        resultDiv.className = 'import-result error';
                        resultDiv.innerHTML = '<strong>✗ Error:</strong> ' + err.message;
                    }
                    
                    resultDiv.style.display = 'block';
                    btn.disabled = false;
                    btn.textContent = 'Import Users';
                }
            </script>

            <!-- Add User Modal -->
            <div id="addUserModal" class="modal">
                <div class="modal-content">
                    <h2>Add New User</h2>
                    <form id="addUserForm" onsubmit="saveUser(event)">
                        <div class="form-group">
                            <label>Email Address *</label>
                            <input type="email" name="email" id="userEmail" required placeholder="user@gmrlgroup.com">
                        </div>
                        <div class="form-group">
                            <label>Display Name *</label>
                            <input type="text" name="displayName" required placeholder="Full Name">
                        </div>
                        <div class="form-group">
                            <label>Role *</label>
                            <select name="roleId" required>
                                ${roles.map(r => `
                                    <option value="${r.Id}" ${r.RoleName === 'AreaManager' ? 'selected' : ''}>${r.RoleName}</option>
                                `).join('')}
                            </select>
                        </div>
                        <div class="modal-actions">
                            <button type="button" class="btn btn-secondary" onclick="closeAddUserModal()">Cancel</button>
                            <button type="submit" class="btn btn-primary">Add User</button>
                        </div>
                    </form>
                </div>
            </div>

            <!-- Bulk Import Modal -->
            <div id="bulkImportModal" class="modal">
                <div class="modal-content" style="max-width: 600px;">
                    <h2>📥 Bulk Import Users</h2>
                    <p class="import-help">Paste user data below. Each line should be: <code>email, display name</code></p>
                    <form id="bulkImportForm" onsubmit="bulkImport(event)">
                        <div class="form-group">
                            <label>User List</label>
                            <textarea name="userList" id="userListInput" rows="10" required placeholder="user1@gmrlgroup.com, John Doe
user2@gmrlgroup.com, Jane Smith
user3@gmrlgroup.com, Bob Wilson"></textarea>
                        </div>
                        <div class="form-group">
                            <label>Default Role</label>
                            <select name="roleId" id="bulkRoleId">
                                ${roles.map(r => `
                                    <option value="${r.Id}" ${r.RoleName === 'AreaManager' ? 'selected' : ''}>${r.RoleName}</option>
                                `).join('')}
                            </select>
                        </div>
                        <div id="bulkImportResult" class="import-result" style="display: none;"></div>
                        <div class="modal-actions">
                            <button type="button" class="btn btn-secondary" onclick="closeBulkImportModal()">Cancel</button>
                            <button type="submit" class="btn btn-success" id="bulkImportBtn">Import Users</button>
                        </div>
                    </form>
                </div>
            </div>

            <style>
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                #syncIcon {
                    display: inline-block;
                }
                .sync-result, .import-result {
                    padding: 15px 20px;
                    border-radius: 8px;
                    margin-bottom: 20px;
                }
                .sync-result.success, .import-result.success {
                    background: #d4edda;
                    border: 1px solid #28a745;
                    color: #155724;
                }
                .sync-result.error, .import-result.error {
                    background: #f8d7da;
                    border: 1px solid #dc3545;
                    color: #721c24;
                }
                .header-actions {
                    display: flex;
                    gap: 10px;
                }
                .import-help {
                    color: #666;
                    font-size: 14px;
                    margin-bottom: 15px;
                }
                .import-help code {
                    background: #f0f0f0;
                    padding: 2px 6px;
                    border-radius: 4px;
                }
                #userListInput {
                    font-family: monospace;
                    font-size: 13px;
                }
                .import-result {
                    margin-top: 15px;
                }
            </style>
        `));
    } catch (error) {
        console.error('[ADMIN] Users error:', error);
        res.status(500).send('Error loading users');
    }
});

// ==========================================
// Store Assignments
// ==========================================

router.get('/assignments', async (req, res) => {
    try {
        const areaManagers = await UserService.getAreaManagers();
        const stores = await StoreService.getActive();
        const assignments = await StoreService.getAllAssignments();
        
        res.send(renderAdminPage(req.currentUser, 'assignments', `
            <div class="admin-header">
                <h1>📌 Store Assignments</h1>
                <button class="btn btn-primary" onclick="showAssignModal()">+ Assign Store</button>
            </div>

            <table class="data-table">
                <thead>
                    <tr>
                        <th>Area Manager</th>
                        <th>Email</th>
                        <th>Store</th>
                        <th>Assigned Date</th>
                        <th width="100">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${assignments.length === 0 ? '<tr><td colspan="5" class="center">No assignments yet</td></tr>' : ''}
                    ${assignments.map(a => `
                        <tr>
                            <td>${escapeHtml(a.UserName)}</td>
                            <td>${escapeHtml(a.UserEmail)}</td>
                            <td>${escapeHtml(a.StoreName)}</td>
                            <td>${formatDate(a.AssignedAt)}</td>
                            <td class="center">
                                <button class="btn btn-sm btn-danger" onclick="unassign(${a.StoreId}, ${a.UserId})">Remove</button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>

            <!-- Assign Modal -->
            <div id="assignModal" class="modal">
                <div class="modal-content">
                    <h2>Assign Store to Area Manager</h2>
                    <form action="/admin/assignments/save" method="POST">
                        <div class="form-group">
                            <label>Area Manager</label>
                            <select name="userId" required>
                                <option value="">-- Select Area Manager --</option>
                                ${areaManagers.map(u => `
                                    <option value="${u.Id}">${escapeHtml(u.DisplayName)} (${u.Email})</option>
                                `).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Store</label>
                            <select name="storeId" required>
                                <option value="">-- Select Store --</option>
                                ${stores.map(s => `
                                    <option value="${s.Id}">${escapeHtml(s.StoreName)}</option>
                                `).join('')}
                            </select>
                        </div>
                        <div class="form-actions">
                            <button type="button" class="btn btn-secondary" onclick="closeAssignModal()">Cancel</button>
                            <button type="submit" class="btn btn-primary">Assign</button>
                        </div>
                    </form>
                </div>
            </div>

            <script>
                function showAssignModal() {
                    document.getElementById('assignModal').style.display = 'flex';
                }
                
                function closeAssignModal() {
                    document.getElementById('assignModal').style.display = 'none';
                }
                
                async function unassign(storeId, userId) {
                    if (confirm('Remove this assignment?')) {
                        await fetch('/api/assignments/remove', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ storeId, userId })
                        });
                        location.reload();
                    }
                }
            </script>
        `));
    } catch (error) {
        console.error('[ADMIN] Assignments error:', error);
        res.status(500).send('Error loading assignments');
    }
});

router.post('/assignments/save', async (req, res) => {
    try {
        const { userId, storeId } = req.body;
        await StoreService.assignToUser(storeId, userId, req.currentUser.id);
        res.redirect('/admin/assignments');
    } catch (error) {
        console.error('[ADMIN] Save assignment error:', error);
        res.status(500).send('Error saving assignment');
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

function renderAdminPage(user, activeTab, content) {
    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Admin - Area Manager Checklist</title>
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
                    <a href="/dashboard" class="btn btn-sm btn-secondary">Dashboard</a>
                    <a href="/auth/logout" class="btn btn-sm btn-secondary">Logout</a>
                </div>
            </nav>

            <div class="admin-layout">
                <aside class="admin-sidebar">
                    <a href="/admin/questions" class="sidebar-link ${activeTab === 'questions' ? 'active' : ''}">📋 Questions</a>
                    <a href="/admin/stores" class="sidebar-link ${activeTab === 'stores' ? 'active' : ''}">🏪 Stores</a>
                    <a href="/admin/users" class="sidebar-link ${activeTab === 'users' ? 'active' : ''}">👥 Users</a>
                    <a href="/admin/assignments" class="sidebar-link ${activeTab === 'assignments' ? 'active' : ''}">📌 Assignments</a>
                </aside>
                
                <main class="admin-content">
                    ${content}
                </main>
            </div>
        </body>
        </html>
    `;
}

module.exports = router;
