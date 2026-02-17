/**
 * Session Manager
 * Handles user session management
 */

const sql = require('mssql');
const crypto = require('crypto');
const DatabaseService = require('../../services/database-service');

class SessionManager {
    static getPool() {
        return DatabaseService.getPool();
    }

    static async createSession(userId, azureTokens) {
        const pool = this.getPool();
        
        // Single session per user: Delete all existing sessions for this user
        await pool.request()
            .input('userId', sql.Int, userId)
            .query('DELETE FROM Sessions WHERE UserId = @userId');
        
        const rawToken = this.generateSessionToken();
        const sessionToken = `sess_${userId}_${rawToken}`;
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
        
        await pool.request()
            .input('sessionId', sql.NVarChar, sessionToken)
            .input('userId', sql.Int, userId)
            .input('token', sql.NVarChar, azureTokens.accessToken || '')
            .input('accessToken', sql.NVarChar, azureTokens.accessToken || '')
            .input('refreshToken', sql.NVarChar, azureTokens.refreshToken || '')
            .input('expiresAt', sql.DateTime, expiresAt)
            .query(`
                INSERT INTO Sessions (SessionId, UserId, Token, ExpiresAt, azure_access_token, azure_refresh_token, session_token, last_activity)
                VALUES (@sessionId, @userId, @token, @expiresAt, @accessToken, @refreshToken, @sessionId, GETDATE())
            `);
        
        console.log(`[SESSION] Created token ${sessionToken.substring(0, 20)}... for userId ${userId} (previous sessions cleared)`);
        return { sessionToken, expiresAt };
    }

    static async getSession(sessionToken) {
        const pool = this.getPool();
        
        const result = await pool.request()
            .input('sessionId', sql.NVarChar, sessionToken)
            .query(`
                SELECT 
                    s.Id, s.SessionId, s.UserId, s.ExpiresAt,
                    s.azure_access_token, s.azure_refresh_token,
                    u.Id as UserId, u.Email, u.DisplayName, u.AzureOid,
                    u.IsApproved, u.IsActive,
                    r.RoleName as Role
                FROM Sessions s
                INNER JOIN Users u ON s.UserId = u.Id
                INNER JOIN UserRoles r ON u.RoleId = r.Id
                WHERE s.SessionId = @sessionId
                AND s.ExpiresAt > GETDATE()
                AND u.IsActive = 1
            `);
        
        // Debug logging for session issues
        if (result.recordset[0]) {
            console.log(`[SESSION] Token ${sessionToken.substring(0, 8)}... => User: ${result.recordset[0].Email} (ID: ${result.recordset[0].UserId})`);
        }
        
        return result.recordset[0] || null;
    }

    static async deleteSession(sessionToken) {
        const pool = this.getPool();
        
        await pool.request()
            .input('sessionId', sql.NVarChar, sessionToken)
            .query('DELETE FROM Sessions WHERE SessionId = @sessionId');
        
        console.log('[SESSION] Deleted');
    }

    static async cleanupExpiredSessions() {
        const pool = this.getPool();
        
        const result = await pool.request()
            .query('DELETE FROM Sessions WHERE ExpiresAt < GETDATE()');
        
        const count = result.rowsAffected[0];
        if (count > 0) {
            console.log(`[SESSION] Cleaned ${count} expired`);
        }
        return count;
    }

    static generateSessionToken() {
        return crypto.randomBytes(32).toString('hex');
    }

    static isValidTokenFormat(token) {
        // Support both old format (64 hex chars) and new format (sess_userId_hextoken)
        if (typeof token !== 'string') return false;
        
        // New format: sess_[userId]_[64 hex chars]
        if (token.startsWith('sess_')) {
            const parts = token.split('_');
            if (parts.length >= 3) {
                const hexPart = parts.slice(2).join('_');
                return hexPart.length === 64 && /^[0-9a-f]+$/.test(hexPart);
            }
            return false;
        }
        
        // Old format: 64 hex chars
        return token.length === 64 && /^[0-9a-f]+$/.test(token);
    }

    /**
     * Get all active sessions with user information (Admin only)
     */
    static async getAllActiveSessions() {
        const pool = this.getPool();
        
        const result = await pool.request()
            .query(`
                SELECT 
                    s.Id as SessionId,
                    s.SessionId as SessionToken,
                    s.ExpiresAt,
                    ISNULL(s.last_activity, s.CreatedAt) as LastActivity,
                    s.CreatedAt,
                    u.Id as UserId,
                    u.Email,
                    u.DisplayName,
                    r.RoleName as Role,
                    (SELECT COUNT(*) FROM Sessions s2 WHERE s2.UserId = u.Id AND s2.ExpiresAt > GETDATE()) as SessionCount
                FROM Sessions s
                INNER JOIN Users u ON s.UserId = u.Id
                INNER JOIN UserRoles r ON u.RoleId = r.Id
                WHERE s.ExpiresAt > GETDATE()
                ORDER BY ISNULL(s.last_activity, s.CreatedAt) DESC, u.DisplayName
            `);
        
        return result.recordset;
    }

    /**
     * Get sessions grouped by user with duplicate detection
     */
    static async getSessionsByUser() {
        const pool = this.getPool();
        
        const result = await pool.request()
            .query(`
                SELECT 
                    u.Id as UserId,
                    u.Email,
                    u.DisplayName,
                    r.RoleName as Role,
                    COUNT(s.Id) as SessionCount,
                    MAX(ISNULL(s.last_activity, s.CreatedAt)) as LastActivity,
                    MIN(s.CreatedAt) as FirstSession,
                    MAX(s.ExpiresAt) as LatestExpiry
                FROM Users u
                INNER JOIN UserRoles r ON u.RoleId = r.Id
                INNER JOIN Sessions s ON s.UserId = u.Id
                WHERE s.ExpiresAt > GETDATE()
                GROUP BY u.Id, u.Email, u.DisplayName, r.RoleName
                ORDER BY SessionCount DESC, LastActivity DESC
            `);
        
        return result.recordset;
    }

    /**
     * Delete all sessions for a specific user (Admin only)
     */
    static async deleteUserSessions(userId) {
        const pool = this.getPool();
        
        const result = await pool.request()
            .input('userId', sql.Int, userId)
            .query('DELETE FROM Sessions WHERE UserId = @userId');
        
        const count = result.rowsAffected[0];
        console.log(`[SESSION] Deleted ${count} sessions for userId ${userId}`);
        return count;
    }

    /**
     * Delete a specific session by ID (Admin only)
     */
    static async deleteSessionById(sessionId) {
        const pool = this.getPool();
        
        const result = await pool.request()
            .input('sessionId', sql.Int, sessionId)
            .query('DELETE FROM Sessions WHERE Id = @sessionId');
        
        console.log(`[SESSION] Deleted session ID ${sessionId}`);
        return result.rowsAffected[0];
    }

    /**
     * Update last activity timestamp
     */
    static async updateLastActivity(sessionToken) {
        const pool = this.getPool();
        
        await pool.request()
            .input('sessionId', sql.NVarChar, sessionToken)
            .query('UPDATE Sessions SET last_activity = GETDATE() WHERE SessionId = @sessionId');
    }
}

module.exports = SessionManager;
