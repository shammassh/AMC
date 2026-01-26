/**
 * Checklist Routes
 * Fill and submit checklists
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const QuestionService = require('../services/question-service');
const StoreService = require('../services/store-service');
const ChecklistService = require('../services/checklist-service');

// Configure multer for image uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../public/uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        if (extname && mimetype) {
            cb(null, true);
        } else {
            cb(new Error('Only images are allowed'));
        }
    }
});

// ==========================================
// New Checklist Form
// ==========================================

router.get('/new', async (req, res) => {
    try {
        const userId = parseInt(req.currentUser.id, 10);
        const questions = await QuestionService.getAll();
        
        // If user is Admin or HeadOfOperations, show all stores
        let allStores;
        if (req.currentUser.role === 'Admin' || req.currentUser.role === 'HeadOfOperations') {
            allStores = await StoreService.getActive();
        } else {
            allStores = userId ? await StoreService.getStoresForUser(userId) : [];
        }

        if (allStores.length === 0) {
            return res.send(renderChecklistPage(req.currentUser, `
                <div class="empty-state">
                    <h2>No Stores Assigned</h2>
                    <p>You don't have any stores assigned yet. Please contact your administrator.</p>
                    <a href="/dashboard" class="btn btn-primary">Back to Dashboard</a>
                </div>
            `));
        }

        if (questions.length === 0) {
            return res.send(renderChecklistPage(req.currentUser, `
                <div class="empty-state">
                    <h2>No Questions Available</h2>
                    <p>The checklist has not been configured yet. Please contact your administrator.</p>
                    <a href="/dashboard" class="btn btn-primary">Back to Dashboard</a>
                </div>
            `));
        }
        
        res.send(renderChecklistPage(req.currentUser, `
            <div class="checklist-header">
                <h1>📝 New Checklist Audit</h1>
            </div>

            <form id="checklistForm" action="/checklist/submit" method="POST" enctype="multipart/form-data">
                <div class="checklist-setup">
                    <div class="form-row">
                        <div class="form-group">
                            <label>Store</label>
                            <select name="storeId" required>
                                <option value="">-- Select Store --</option>
                                ${allStores.map(s => `
                                    <option value="${s.Id}">${escapeHtml(s.StoreName)}</option>
                                `).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Audit Date</label>
                            <input type="date" name="auditDate" value="${new Date().toISOString().split('T')[0]}" required>
                        </div>
                    </div>
                </div>

                <div class="questions-container">
                    ${questions.map((q, i) => `
                        <div class="question-card" data-question-id="${q.Id}">
                            <div class="question-header">
                                <span class="question-number">${i + 1}</span>
                                <span class="question-text">${escapeHtml(q.QuestionText)}</span>
                                <span class="question-coef">Coef: ${q.Coefficient}</span>
                            </div>
                            
                            <input type="hidden" name="questions[${i}][id]" value="${q.Id}">
                            <input type="hidden" name="questions[${i}][coefficient]" value="${q.Coefficient}">
                            
                            <div class="question-body">
                                <div class="answer-section">
                                    <label class="section-label">Answer</label>
                                    <div class="answer-buttons">
                                        <label class="answer-option yes">
                                            <input type="radio" name="questions[${i}][answer]" value="Yes" required>
                                            <span>✓ Yes</span>
                                        </label>
                                        <label class="answer-option no">
                                            <input type="radio" name="questions[${i}][answer]" value="No">
                                            <span>✗ No</span>
                                        </label>
                                        <label class="answer-option na">
                                            <input type="radio" name="questions[${i}][answer]" value="NA">
                                            <span>N/A</span>
                                        </label>
                                    </div>
                                </div>
                                
                                <div class="notes-section">
                                    <label class="section-label">Notes / Description</label>
                                    <textarea name="questions[${i}][comment]" placeholder="Add notes or description for this item..." rows="2"></textarea>
                                </div>
                                
                                <div class="image-section">
                                    <label class="section-label">Photo Evidence</label>
                                    <div class="image-upload-area" data-index="${i}">
                                        <input type="file" name="image_${q.Id}" accept="image/*" capture="environment" class="image-input" id="image_${i}">
                                        <label for="image_${i}" class="image-upload-btn">
                                            <span class="upload-icon">📷</span>
                                            <span class="upload-text">Tap to add photo</span>
                                        </label>
                                        <div class="image-preview" style="display:none;">
                                            <img src="" alt="Preview">
                                            <button type="button" class="remove-image" onclick="removeImage(${i})">✕</button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>

                <div class="checklist-footer">
                    <div class="form-group">
                        <label>Notes (optional)</label>
                        <textarea name="notes" rows="3" placeholder="Any additional comments..."></textarea>
                    </div>
                    
                    <div class="score-preview">
                        <div class="score-item">
                            <span class="score-label">Applicable Coef:</span>
                            <span id="applicableCoef">0</span>
                        </div>
                        <div class="score-item">
                            <span class="score-label">Earned:</span>
                            <span id="earnedValue">0</span>
                        </div>
                        <div class="score-item score-total">
                            <span class="score-label">Score:</span>
                            <span id="scorePercent">0%</span>
                        </div>
                    </div>

                    <div class="form-actions">
                        <a href="/dashboard" class="btn btn-secondary">Cancel</a>
                        <button type="submit" class="btn btn-primary btn-lg">Submit Checklist</button>
                    </div>
                </div>
            </form>

            <script>
                // Live score calculation
                document.querySelectorAll('input[type="radio"]').forEach(radio => {
                    radio.addEventListener('change', updateScore);
                });

                function updateScore() {
                    let applicableCoef = 0;
                    let earned = 0;

                    document.querySelectorAll('.question-card').forEach(card => {
                        const coef = parseFloat(card.querySelector('input[name$="[coefficient]"]').value);
                        const checked = card.querySelector('input[type="radio"]:checked');
                        
                        if (checked) {
                            if (checked.value === 'Yes') {
                                applicableCoef += coef;
                                earned += coef;
                            } else if (checked.value === 'No') {
                                applicableCoef += coef;
                                earned += 0;
                            }
                            // NA = not counted
                        }
                    });

                    const percent = applicableCoef > 0 ? (earned / applicableCoef * 100).toFixed(1) : 0;
                    
                    document.getElementById('applicableCoef').textContent = applicableCoef.toFixed(2);
                    document.getElementById('earnedValue').textContent = earned.toFixed(2);
                    document.getElementById('scorePercent').textContent = percent + '%';
                    
                    // Color code
                    const scoreEl = document.getElementById('scorePercent');
                    scoreEl.className = percent >= 80 ? 'score-good' : percent >= 60 ? 'score-warning' : 'score-bad';
                }

                // Image preview functionality
                document.querySelectorAll('.image-input').forEach(input => {
                    input.addEventListener('change', function(e) {
                        const file = e.target.files[0];
                        const area = this.closest('.image-upload-area');
                        const preview = area.querySelector('.image-preview');
                        const uploadBtn = area.querySelector('.image-upload-btn');
                        
                        if (file) {
                            const reader = new FileReader();
                            reader.onload = function(e) {
                                preview.querySelector('img').src = e.target.result;
                                preview.style.display = 'block';
                                uploadBtn.style.display = 'none';
                            };
                            reader.readAsDataURL(file);
                        }
                    });
                });

                function removeImage(index) {
                    const input = document.getElementById('image_' + index);
                    const area = input.closest('.image-upload-area');
                    const preview = area.querySelector('.image-preview');
                    const uploadBtn = area.querySelector('.image-upload-btn');
                    
                    input.value = '';
                    preview.style.display = 'none';
                    uploadBtn.style.display = 'flex';
                }
            </script>
        `));
    } catch (error) {
        console.error('[CHECKLIST] New form error:', error);
        res.status(500).send('Error loading checklist form');
    }
});

// ==========================================
// Submit Checklist
// ==========================================

router.post('/submit', upload.any(), async (req, res) => {
    try {
        const { storeId, auditDate, questions, notes } = req.body;
        
        // Build a map of uploaded images: questionId -> filename
        const imageMap = {};
        if (req.files) {
            for (const file of req.files) {
                // Field name is like "image_123" where 123 is the question ID
                const match = file.fieldname.match(/^image_(\d+)$/);
                if (match) {
                    const questionId = match[1];
                    imageMap[questionId] = file.filename;
                }
            }
        }
        
        // Parse answers with image paths
        const answers = [];
        for (const q of questions) {
            answers.push({
                questionId: parseInt(q.id),
                coefficient: parseFloat(q.coefficient),
                answer: q.answer,
                comment: q.comment || null,
                imagePath: imageMap[q.id] || null
            });
        }

        const checklist = await ChecklistService.create(
            parseInt(storeId),
            auditDate,
            req.currentUser.id,
            answers,
            notes
        );

        res.redirect(`/checklist/success/${checklist.DocumentNumber}`);
    } catch (error) {
        console.error('[CHECKLIST] Submit error:', error);
        res.status(500).send('Error submitting checklist');
    }
});

// ==========================================
// Success Page
// ==========================================

router.get('/success/:documentNumber', async (req, res) => {
    try {
        const checklist = await ChecklistService.getByDocumentNumber(req.params.documentNumber);
        
        if (!checklist) {
            return res.status(404).send('Checklist not found');
        }

        res.send(renderChecklistPage(req.currentUser, `
            <div class="success-container">
                <div class="success-icon">✓</div>
                <h1>Checklist Submitted!</h1>
                <div class="success-details">
                    <p><strong>Document Number:</strong> ${checklist.DocumentNumber}</p>
                    <p><strong>Store:</strong> ${escapeHtml(checklist.StoreName)}</p>
                    <p><strong>Date:</strong> ${new Date(checklist.AuditDate).toLocaleDateString('en-GB')}</p>
                    <p><strong>Score:</strong> <span class="score-badge ${checklist.ScorePercentage >= 80 ? 'score-good' : checklist.ScorePercentage >= 60 ? 'score-warning' : 'score-bad'}">${checklist.ScorePercentage.toFixed(1)}%</span></p>
                </div>
                <div class="success-actions">
                    <a href="/checklist/view/${checklist.Id}" class="btn btn-secondary">View Details</a>
                    <a href="/checklist/new" class="btn btn-primary">New Checklist</a>
                    <a href="/dashboard" class="btn btn-secondary">Dashboard</a>
                </div>
            </div>
        `));
    } catch (error) {
        console.error('[CHECKLIST] Success page error:', error);
        res.status(500).send('Error loading success page');
    }
});

// ==========================================
// View Checklist Details
// ==========================================

router.get('/view/:id', async (req, res) => {
    try {
        const checklist = await ChecklistService.getById(req.params.id);
        
        if (!checklist) {
            return res.status(404).send('Checklist not found');
        }

        res.send(renderChecklistPage(req.currentUser, `
            <div class="checklist-view">
                <div class="view-header">
                    <div>
                        <h1>📄 ${checklist.DocumentNumber}</h1>
                        <p class="view-meta">
                            <span>🏪 ${escapeHtml(checklist.StoreName)}</span>
                            <span>📅 ${new Date(checklist.AuditDate).toLocaleDateString('en-GB')}</span>
                            <span>👤 ${escapeHtml(checklist.SubmittedByName)}</span>
                        </p>
                    </div>
                    <div class="view-score ${checklist.ScorePercentage >= 80 ? 'score-good' : checklist.ScorePercentage >= 60 ? 'score-warning' : 'score-bad'}">
                        ${checklist.ScorePercentage.toFixed(1)}%
                    </div>
                </div>

                <div class="score-summary">
                    <div class="score-card">
                        <span class="score-label">Total Coefficient</span>
                        <span class="score-value">${checklist.TotalCoefficient}</span>
                    </div>
                    <div class="score-card">
                        <span class="score-label">Total Earned</span>
                        <span class="score-value">${checklist.TotalEarned}</span>
                    </div>
                </div>

                <table class="checklist-table">
                    <thead>
                        <tr>
                            <th width="50">#</th>
                            <th>Question</th>
                            <th width="80">Coef</th>
                            <th width="80">Answer</th>
                            <th width="80">Earned</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${checklist.answers.map((a, i) => `
                            <tr class="answer-row ${a.Answer.toLowerCase()}">
                                <td class="center">${i + 1}</td>
                                <td>${escapeHtml(a.QuestionText)}</td>
                                <td class="center">${a.Coefficient}</td>
                                <td class="center">
                                    <span class="answer-badge answer-${a.Answer.toLowerCase()}">${a.Answer}</span>
                                </td>
                                <td class="center">${a.Answer === 'NA' ? '-' : a.EarnedValue}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>

                ${checklist.Notes ? `
                    <div class="notes-section">
                        <h3>Notes</h3>
                        <p>${escapeHtml(checklist.Notes)}</p>
                    </div>
                ` : ''}

                <div class="view-actions">
                    <a href="/dashboard" class="btn btn-secondary">← Back to Dashboard</a>
                    <button onclick="window.print()" class="btn btn-primary">🖨️ Print</button>
                </div>
            </div>
        `));
    } catch (error) {
        console.error('[CHECKLIST] View error:', error);
        res.status(500).send('Error loading checklist');
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

function renderChecklistPage(user, content) {
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
            <title>Checklist - Area Manager Checklist</title>
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
                    <a href="/dashboard" class="btn btn-sm btn-secondary">Dashboard</a>
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
