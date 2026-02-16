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
        
        const sessionToken = this.generateSessionToken();
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
        
        console.log(`[SESSION] Created token ${sessionToken.substring(0, 8)}... for userId ${userId}`);
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
        return typeof token === 'string' && token.length === 64 && /^[0-9a-f]+$/.test(token);
    }
}

module.exports = SessionManager;
