/**
 * Session Manager
 * Handles user session management
 */

const sql = require('mssql');
const crypto = require('crypto');

class SessionManager {
    static pool = null;

    static async getPool() {
        if (!this.pool) {
            this.pool = await sql.connect({
                server: process.env.SQL_SERVER || 'localhost',
                database: process.env.SQL_DATABASE || 'GMRL_AMC',
                user: process.env.SQL_USER || 'sa',
                password: process.env.SQL_PASSWORD,
                options: {
                    encrypt: process.env.SQL_ENCRYPT === 'true',
                    trustServerCertificate: process.env.SQL_TRUST_CERT === 'true'
                }
            });
        }
        return this.pool;
    }

    static async createSession(userId, azureTokens) {
        const pool = await this.getPool();
        
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
        
        console.log(`[SESSION] Created for user ${userId}`);
        return { sessionToken, expiresAt };
    }

    static async getSession(sessionToken) {
        const pool = await this.getPool();
        
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
        
        return result.recordset[0] || null;
    }

    static async deleteSession(sessionToken) {
        const pool = await this.getPool();
        
        await pool.request()
            .input('sessionId', sql.NVarChar, sessionToken)
            .query('DELETE FROM Sessions WHERE SessionId = @sessionId');
        
        console.log('[SESSION] Deleted');
    }

    static async cleanupExpiredSessions() {
        const pool = await this.getPool();
        
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
