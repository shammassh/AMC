/**
 * Question Service
 * Manages checklist questions and coefficients
 */

const DatabaseService = require('./database-service');

class QuestionService {
    /**
     * Get all active questions
     */
    static async getAll() {
        const result = await DatabaseService.query(`
            SELECT q.*, u.DisplayName as CreatedByName
            FROM Questions q
            LEFT JOIN Users u ON q.CreatedBy = u.Id
            WHERE q.IsActive = 1
            ORDER BY q.SortOrder, q.Id
        `);
        return result.recordset;
    }

    /**
     * Get all questions (including inactive) for admin
     */
    static async getAllForAdmin() {
        const result = await DatabaseService.query(`
            SELECT q.*, u.DisplayName as CreatedByName
            FROM Questions q
            LEFT JOIN Users u ON q.CreatedBy = u.Id
            ORDER BY q.SortOrder, q.Id
        `);
        return result.recordset;
    }

    /**
     * Get question by ID
     */
    static async getById(id) {
        const result = await DatabaseService.query(`
            SELECT * FROM Questions WHERE Id = @id
        `, { id });
        return result.recordset[0];
    }

    /**
     * Create new question
     */
    static async create(questionText, coefficient, sortOrder) {
        const result = await DatabaseService.query(`
            INSERT INTO Questions (QuestionText, Coefficient, SortOrder, IsActive)
            OUTPUT INSERTED.*
            VALUES (@questionText, @coefficient, @sortOrder, 1)
        `, { 
            questionText, 
            coefficient: coefficient || 1.00, 
            sortOrder: sortOrder || 0
        });
        return result.recordset[0];
    }

    /**
     * Update question
     */
    static async update(id, questionText, coefficient, sortOrder) {
        const result = await DatabaseService.query(`
            UPDATE Questions 
            SET QuestionText = @questionText, 
                Coefficient = @coefficient, 
                SortOrder = @sortOrder,
                UpdatedAt = GETDATE()
            OUTPUT INSERTED.*
            WHERE Id = @id
        `, { id, questionText, coefficient, sortOrder });
        return result.recordset[0];
    }

    /**
     * Toggle question active status
     */
    static async toggleActive(id) {
        const result = await DatabaseService.query(`
            UPDATE Questions 
            SET IsActive = CASE WHEN IsActive = 1 THEN 0 ELSE 1 END,
                UpdatedAt = GETDATE()
            OUTPUT INSERTED.*
            WHERE Id = @id
        `, { id });
        return result.recordset[0];
    }

    /**
     * Delete question (soft delete)
     */
    static async delete(id) {
        await DatabaseService.query(`
            UPDATE Questions SET IsActive = 0, UpdatedAt = GETDATE() WHERE Id = @id
        `, { id });
    }

    /**
     * Get total coefficient of active questions
     */
    static async getTotalCoefficient() {
        const result = await DatabaseService.query(`
            SELECT SUM(Coefficient) as TotalCoefficient FROM Questions WHERE IsActive = 1
        `);
        return result.recordset[0].TotalCoefficient || 0;
    }

    /**
     * Reorder questions
     */
    static async reorder(questionIds) {
        for (let i = 0; i < questionIds.length; i++) {
            await DatabaseService.query(`
                UPDATE Questions SET SortOrder = @sortOrder WHERE Id = @id
            `, { id: questionIds[i], sortOrder: i + 1 });
        }
    }
}

module.exports = QuestionService;
