/**
 * Store Service
 * Manages stores and assignments
 */

const DatabaseService = require('./database-service');

class StoreService {
    /**
     * Get all stores
     */
    static async getAll() {
        const result = await DatabaseService.query(`
            SELECT * FROM Stores ORDER BY StoreName
        `);
        return result.recordset;
    }

    /**
     * Get active stores
     */
    static async getActive() {
        const result = await DatabaseService.query(`
            SELECT * FROM Stores WHERE IsActive = 1 ORDER BY StoreName
        `);
        return result.recordset;
    }

    /**
     * Get store by ID
     */
    static async getById(id) {
        const result = await DatabaseService.query(`
            SELECT * FROM Stores WHERE Id = @id
        `, { id });
        return result.recordset[0];
    }

    /**
     * Create new store
     */
    static async create(storeName, storeCode) {
        const result = await DatabaseService.query(`
            INSERT INTO Stores (StoreName, StoreCode, IsActive)
            OUTPUT INSERTED.*
            VALUES (@storeName, @storeCode, 1)
        `, { storeName, storeCode });
        return result.recordset[0];
    }

    /**
     * Update store
     */
    static async update(id, storeName, storeCode) {
        const result = await DatabaseService.query(`
            UPDATE Stores 
            SET StoreName = @storeName, StoreCode = @storeCode, UpdatedAt = GETDATE()
            OUTPUT INSERTED.*
            WHERE Id = @id
        `, { id, storeName, storeCode });
        return result.recordset[0];
    }

    /**
     * Toggle store active status
     */
    static async toggleActive(id) {
        const result = await DatabaseService.query(`
            UPDATE Stores 
            SET IsActive = CASE WHEN IsActive = 1 THEN 0 ELSE 1 END, UpdatedAt = GETDATE()
            OUTPUT INSERTED.*
            WHERE Id = @id
        `, { id });
        return result.recordset[0];
    }

    /**
     * Get stores assigned to a user
     */
    static async getStoresForUser(userId) {
        const result = await DatabaseService.query(`
            SELECT s.* 
            FROM Stores s
            INNER JOIN StoreAssignments sa ON s.Id = sa.StoreId
            WHERE sa.UserId = @userId AND sa.IsActive = 1 AND s.IsActive = 1
            ORDER BY s.StoreName
        `, { userId });
        return result.recordset;
    }

    /**
     * Get users assigned to a store
     */
    static async getUsersForStore(storeId) {
        const result = await DatabaseService.query(`
            SELECT u.Id, u.Email, u.DisplayName
            FROM Users u
            INNER JOIN StoreAssignments sa ON u.Id = sa.UserId
            WHERE sa.StoreId = @storeId AND sa.IsActive = 1
            ORDER BY u.DisplayName
        `, { storeId });
        return result.recordset;
    }

    /**
     * Assign store to user
     */
    static async assignToUser(storeId, userId, assignedBy) {
        // Check if assignment already exists
        const existing = await DatabaseService.query(`
            SELECT * FROM StoreAssignments WHERE StoreId = @storeId AND UserId = @userId
        `, { storeId, userId });

        if (existing.recordset.length > 0) {
            // Reactivate if exists
            await DatabaseService.query(`
                UPDATE StoreAssignments SET IsActive = 1, AssignedAt = GETDATE(), AssignedBy = @assignedBy
                WHERE StoreId = @storeId AND UserId = @userId
            `, { storeId, userId, assignedBy });
        } else {
            // Create new assignment
            await DatabaseService.query(`
                INSERT INTO StoreAssignments (StoreId, UserId, AssignedBy, IsActive)
                VALUES (@storeId, @userId, @assignedBy, 1)
            `, { storeId, userId, assignedBy });
        }
    }

    /**
     * Unassign store from user
     */
    static async unassignFromUser(storeId, userId) {
        await DatabaseService.query(`
            UPDATE StoreAssignments SET IsActive = 0 WHERE StoreId = @storeId AND UserId = @userId
        `, { storeId, userId });
    }

    /**
     * Get all assignments with details
     */
    static async getAllAssignments() {
        const result = await DatabaseService.query(`
            SELECT 
                sa.Id,
                sa.UserId,
                sa.StoreId,
                sa.AssignedAt,
                sa.IsActive,
                u.DisplayName as UserName,
                u.Email as UserEmail,
                s.StoreName,
                s.StoreCode,
                ab.DisplayName as AssignedByName
            FROM StoreAssignments sa
            INNER JOIN Users u ON sa.UserId = u.Id
            INNER JOIN Stores s ON sa.StoreId = s.Id
            LEFT JOIN Users ab ON sa.AssignedBy = ab.Id
            WHERE sa.IsActive = 1
            ORDER BY u.DisplayName, s.StoreName
        `);
        return result.recordset;
    }
}

module.exports = StoreService;
