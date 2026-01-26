/**
 * User Service
 * Manages user operations
 */

const DatabaseService = require('./database-service');

class UserService {
    /**
     * Get all users
     */
    static async getAll() {
        const result = await DatabaseService.query(`
            SELECT u.*, r.RoleName
            FROM Users u
            LEFT JOIN UserRoles r ON u.RoleId = r.Id
            ORDER BY u.DisplayName
        `);
        return result.recordset;
    }

    /**
     * Get user by ID
     */
    static async getById(id) {
        const result = await DatabaseService.query(`
            SELECT u.*, r.RoleName
            FROM Users u
            LEFT JOIN UserRoles r ON u.RoleId = r.Id
            WHERE u.Id = @id
        `, { id });
        return result.recordset[0];
    }

    /**
     * Get user by email
     */
    static async getByEmail(email) {
        const result = await DatabaseService.query(`
            SELECT u.*, r.RoleName
            FROM Users u
            LEFT JOIN UserRoles r ON u.RoleId = r.Id
            WHERE LOWER(u.Email) = LOWER(@email)
        `, { email });
        return result.recordset[0];
    }

    /**
     * Get users by role
     */
    static async getByRole(roleName) {
        const result = await DatabaseService.query(`
            SELECT u.*, r.RoleName
            FROM Users u
            INNER JOIN UserRoles r ON u.RoleId = r.Id
            WHERE r.RoleName = @roleName
            ORDER BY u.DisplayName
        `, { roleName });
        return result.recordset;
    }

    /**
     * Get Area Managers
     */
    static async getAreaManagers() {
        return await this.getByRole('AreaManager');
    }

    /**
     * Update user role
     */
    static async updateRole(userId, roleId) {
        const isApproved = roleId !== 4; // Pending role = 4
        const result = await DatabaseService.query(`
            UPDATE Users 
            SET RoleId = @roleId, IsApproved = @isApproved, UpdatedAt = GETDATE()
            OUTPUT INSERTED.*
            WHERE Id = @userId
        `, { userId, roleId, isApproved });
        return result.recordset[0];
    }

    /**
     * Get all roles
     */
    static async getAllRoles() {
        const result = await DatabaseService.query(`
            SELECT * FROM UserRoles ORDER BY Id
        `);
        return result.recordset;
    }

    /**
     * Toggle user active status
     */
    static async toggleActive(userId) {
        const result = await DatabaseService.query(`
            UPDATE Users 
            SET IsActive = CASE WHEN IsActive = 1 THEN 0 ELSE 1 END, UpdatedAt = GETDATE()
            OUTPUT INSERTED.*
            WHERE Id = @userId
        `, { userId });
        return result.recordset[0];
    }

    /**
     * Create new user manually
     */
    static async create(email, displayName, roleId) {
        // Check if user already exists
        const existing = await this.getByEmail(email);
        if (existing) {
            throw new Error('User with this email already exists');
        }
        
        const isApproved = roleId !== 4; // Not pending
        
        const result = await DatabaseService.query(`
            INSERT INTO Users (Email, DisplayName, RoleId, IsApproved, IsActive)
            OUTPUT INSERTED.*
            VALUES (@email, @displayName, @roleId, @isApproved, 1)
        `, { 
            email: email.toLowerCase(), 
            displayName, 
            roleId: parseInt(roleId, 10), 
            isApproved 
        });
        
        console.log(`[USER] Created: ${email} as role ${roleId}`);
        return result.recordset[0];
    }
}

module.exports = UserService;
