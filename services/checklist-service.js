/**
 * Checklist Service
 * Manages checklist submissions and scoring
 */

const DatabaseService = require('./database-service');
const sql = require('mssql');

class ChecklistService {
    /**
     * Generate next document number
     */
    static async generateDocumentNumber() {
        const pool = DatabaseService.getPool();
        const request = pool.request();
        request.input('Prefix', sql.NVarChar, 'GMRL-AMC');
        request.output('DocumentNumber', sql.NVarChar(50));
        
        const result = await request.execute('GetNextDocumentNumber');
        return result.output.DocumentNumber;
    }

    /**
     * Create new checklist with answers
     */
    static async create(storeId, auditDate, submittedBy, answers, notes) {
        const documentNumber = await this.generateDocumentNumber();
        const userId = parseInt(submittedBy, 10);
        
        // Calculate totals
        let totalCoefficient = 0;
        let totalEarned = 0;
        let applicableCoefficient = 0;

        for (const answer of answers) {
            if (answer.answer !== 'NA') {
                applicableCoefficient += answer.coefficient;
                if (answer.answer === 'Yes') {
                    totalEarned += answer.coefficient;
                }
            }
            totalCoefficient += answer.coefficient;
        }

        const scorePercentage = applicableCoefficient > 0 
            ? (totalEarned / applicableCoefficient) * 100 
            : 0;

        // Insert checklist
        const checklistResult = await DatabaseService.query(`
            INSERT INTO Checklists (DocumentNumber, StoreId, AuditDate, SubmittedBy, TotalCoefficient, TotalEarned, ScorePercentage, Notes)
            OUTPUT INSERTED.*
            VALUES (@documentNumber, @storeId, @auditDate, @submittedBy, @totalCoefficient, @totalEarned, @scorePercentage, @notes)
        `, {
            documentNumber,
            storeId,
            auditDate,
            submittedBy: userId,
            totalCoefficient: applicableCoefficient,
            totalEarned,
            scorePercentage: Math.round(scorePercentage * 100) / 100,
            notes
        });

        const checklist = checklistResult.recordset[0];

        // Insert answers
        for (const answer of answers) {
            let earnedValue = 0;
            if (answer.answer === 'Yes') {
                earnedValue = answer.coefficient;
            } else if (answer.answer === 'No') {
                earnedValue = 0;
            }
            // NA = blank (not counted)

            await DatabaseService.query(`
                INSERT INTO ChecklistAnswers (ChecklistId, QuestionId, Answer, Coefficient, EarnedValue, Comment, ImagePath)
                VALUES (@checklistId, @questionId, @answer, @coefficient, @earnedValue, @comment, @imagePath)
            `, {
                checklistId: checklist.Id,
                questionId: answer.questionId,
                answer: answer.answer,
                coefficient: answer.coefficient,
                earnedValue,
                comment: answer.comment || null,
                imagePath: answer.imagePath || null
            });
        }

        return checklist;
    }

    /**
     * Get checklist by ID with answers
     */
    static async getById(id) {
        const checklistResult = await DatabaseService.query(`
            SELECT c.*, s.StoreName, s.StoreCode, u.DisplayName as SubmittedByName
            FROM Checklists c
            INNER JOIN Stores s ON c.StoreId = s.Id
            INNER JOIN Users u ON c.SubmittedBy = u.Id
            WHERE c.Id = @id
        `, { id });

        if (checklistResult.recordset.length === 0) {
            return null;
        }

        const checklist = checklistResult.recordset[0];

        // Get answers
        const answersResult = await DatabaseService.query(`
            SELECT ca.*, q.QuestionText
            FROM ChecklistAnswers ca
            INNER JOIN Questions q ON ca.QuestionId = q.Id
            WHERE ca.ChecklistId = @checklistId
            ORDER BY q.SortOrder, q.Id
        `, { checklistId: id });

        checklist.answers = answersResult.recordset;
        return checklist;
    }

    /**
     * Get checklist by document number
     */
    static async getByDocumentNumber(documentNumber) {
        const result = await DatabaseService.query(`
            SELECT Id FROM Checklists WHERE DocumentNumber = @documentNumber
        `, { documentNumber });
        
        if (result.recordset.length === 0) {
            return null;
        }
        
        return await this.getById(result.recordset[0].Id);
    }

    /**
     * Get all checklists (with filters)
     */
    static async getAll(filters = {}) {
        let query = `
            SELECT c.*, s.StoreName, s.StoreCode, u.DisplayName as SubmittedByName
            FROM Checklists c
            INNER JOIN Stores s ON c.StoreId = s.Id
            INNER JOIN Users u ON c.SubmittedBy = u.Id
            WHERE 1=1
        `;
        
        const params = {};

        if (filters.storeId) {
            query += ` AND c.StoreId = @storeId`;
            params.storeId = filters.storeId;
        }

        if (filters.submittedBy) {
            query += ` AND c.SubmittedBy = @submittedBy`;
            params.submittedBy = filters.submittedBy;
        }

        if (filters.fromDate) {
            query += ` AND c.AuditDate >= @fromDate`;
            params.fromDate = filters.fromDate;
        }

        if (filters.toDate) {
            query += ` AND c.AuditDate <= @toDate`;
            params.toDate = filters.toDate;
        }

        query += ` ORDER BY c.CreatedAt DESC`;

        if (filters.limit) {
            query += ` OFFSET 0 ROWS FETCH NEXT @limit ROWS ONLY`;
            params.limit = filters.limit;
        }

        const result = await DatabaseService.query(query, params);
        return result.recordset;
    }

    /**
     * Get checklists for user's assigned stores
     */
    static async getForUser(userId) {
        const result = await DatabaseService.query(`
            SELECT c.*, s.StoreName, s.StoreCode, u.DisplayName as SubmittedByName
            FROM Checklists c
            INNER JOIN Stores s ON c.StoreId = s.Id
            INNER JOIN Users u ON c.SubmittedBy = u.Id
            INNER JOIN StoreAssignments sa ON c.StoreId = sa.StoreId
            WHERE sa.UserId = @userId AND sa.IsActive = 1
            ORDER BY c.CreatedAt DESC
        `, { userId });
        return result.recordset;
    }

    /**
     * Get checklists submitted by user
     */
    static async getSubmittedByUser(userId) {
        const result = await DatabaseService.query(`
            SELECT c.*, s.StoreName, s.StoreCode, u.DisplayName as SubmittedByName
            FROM Checklists c
            INNER JOIN Stores s ON c.StoreId = s.Id
            INNER JOIN Users u ON c.SubmittedBy = u.Id
            WHERE c.SubmittedBy = @userId
            ORDER BY c.CreatedAt DESC
        `, { userId });
        return result.recordset;
    }

    /**
     * Get dashboard statistics
     */
    static async getStats(filters = {}) {
        let whereClause = 'WHERE 1=1';
        const params = {};

        if (filters.storeId) {
            whereClause += ` AND c.StoreId = @storeId`;
            params.storeId = filters.storeId;
        }

        if (filters.fromDate) {
            whereClause += ` AND c.AuditDate >= @fromDate`;
            params.fromDate = filters.fromDate;
        }

        if (filters.toDate) {
            whereClause += ` AND c.AuditDate <= @toDate`;
            params.toDate = filters.toDate;
        }

        const result = await DatabaseService.query(`
            SELECT 
                COUNT(*) as TotalChecklists,
                AVG(c.ScorePercentage) as AverageScore,
                MIN(c.ScorePercentage) as MinScore,
                MAX(c.ScorePercentage) as MaxScore
            FROM Checklists c
            ${whereClause}
        `, params);

        return result.recordset[0];
    }

    /**
     * Delete checklist (admin only)
     */
    static async delete(id) {
        await DatabaseService.query(`DELETE FROM Checklists WHERE Id = @id`, { id });
    }
}

module.exports = ChecklistService;
