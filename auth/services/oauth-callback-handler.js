/**
 * OAuth Callback Handler
 * Handles Microsoft Azure AD authentication callback
 */

const msal = require('@azure/msal-node');
const sql = require('mssql');
const SessionManager = require('./session-manager');
const DatabaseService = require('../../services/database-service');

class OAuthCallbackHandler {
    constructor() {
        this.msalConfig = {
            auth: {
                clientId: process.env.AZURE_CLIENT_ID,
                authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
                clientSecret: process.env.AZURE_CLIENT_SECRET
            }
        };
        this.pca = new msal.ConfidentialClientApplication(this.msalConfig);
    }

    async handleCallback(req, res) {
        try {
            const code = req.query.code;
            
            if (!code) {
                console.error('[AUTH] No authorization code');
                return res.redirect('/auth/login?error=no_code');
            }

            // Exchange code for tokens
            const tokenRequest = {
                code: code,
                scopes: ['User.Read'],
                redirectUri: process.env.REDIRECT_URI || `http://localhost:${process.env.PORT}/auth/callback`
            };

            const response = await this.pca.acquireTokenByCode(tokenRequest);
            
            // Get user info from Microsoft Graph
            const userInfo = await this.getUserInfo(response.accessToken);
            
            console.log(`[AUTH] Microsoft user info: email=${userInfo.mail || userInfo.userPrincipalName}, oid=${userInfo.id}, displayName=${userInfo.displayName}`);
            
            // Create or update user in database
            const user = await this.createOrUpdateUser(userInfo, response);
            
            console.log(`[AUTH] DB user matched: Id=${user.Id}, Email=${user.Email}, DisplayName=${user.DisplayName}`);
            
            // Create session
            const session = await SessionManager.createSession(user.Id, {
                accessToken: response.accessToken,
                refreshToken: response.refreshToken
            });

            // Set cookie
            res.cookie('auth_token', session.sessionToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                maxAge: 24 * 60 * 60 * 1000 // 24 hours
            });

            console.log(`[AUTH] Login complete: ${userInfo.mail || userInfo.userPrincipalName} => Session ${session.sessionToken.substring(0, 8)}...`);
            
            // Redirect based on role
            const returnUrl = req.query.state || '/dashboard';
            res.redirect(returnUrl);

        } catch (error) {
            console.error('[AUTH] Callback error:', error);
            res.redirect('/auth/login?error=auth_failed');
        }
    }

    async getUserInfo(accessToken) {
        const response = await fetch('https://graph.microsoft.com/v1.0/me', {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });
        
        if (!response.ok) {
            throw new Error('Failed to get user info from Microsoft Graph');
        }
        
        return await response.json();
    }

    async createOrUpdateUser(userInfo, tokens) {
        // Use shared connection pool to avoid race conditions with multiple simultaneous logins
        const pool = DatabaseService.getPool();

        const email = (userInfo.mail || userInfo.userPrincipalName || '').toLowerCase();
        const displayName = userInfo.displayName || email;
        const azureOid = userInfo.id;

        // First, check if user exists by AzureOid (same user, any email domain)
        const existingByOid = await pool.request()
            .input('azureOid', sql.NVarChar, azureOid)
            .query('SELECT * FROM Users WHERE AzureOid = @azureOid');

        if (existingByOid.recordset.length > 0) {
            // User found by AzureOid - update last login and email (in case it changed)
            const updatedUser = await pool.request()
                .input('azureOid', sql.NVarChar, azureOid)
                .input('email', sql.NVarChar, email)
                .input('displayName', sql.NVarChar, displayName)
                .query(`
                    UPDATE Users 
                    SET LastLoginAt = GETDATE(), 
                        Email = @email,
                        DisplayName = @displayName
                    OUTPUT INSERTED.*
                    WHERE AzureOid = @azureOid
                `);
            
            console.log(`[AUTH] User matched by AzureOid: ${existingByOid.recordset[0].Email} -> ${email}`);
            return updatedUser.recordset[0];
        }

        // Second, check if user exists by Email (for users without AzureOid set yet)
        const existingByEmail = await pool.request()
            .input('email', sql.NVarChar, email)
            .query('SELECT * FROM Users WHERE LOWER(Email) = @email');

        if (existingByEmail.recordset.length > 0) {
            // Update last login and set AzureOid
            const updatedUser = await pool.request()
                .input('email', sql.NVarChar, email)
                .input('azureOid', sql.NVarChar, azureOid)
                .input('displayName', sql.NVarChar, displayName)
                .query(`
                    UPDATE Users 
                    SET LastLoginAt = GETDATE(), 
                        AzureOid = @azureOid,
                        DisplayName = @displayName
                    OUTPUT INSERTED.*
                    WHERE LOWER(Email) = @email
                `);
            
            return updatedUser.recordset[0];
        }

        // Check if this is the admin email
        const isAdmin = email === (process.env.ADMIN_EMAIL || '').toLowerCase();
        const roleId = isAdmin ? 1 : 4; // 1 = Admin, 4 = Pending
        const isApproved = isAdmin ? 1 : 0;

        // Create new user
        const result = await pool.request()
            .input('email', sql.NVarChar, email)
            .input('displayName', sql.NVarChar, displayName)
            .input('azureOid', sql.NVarChar, azureOid)
            .input('roleId', sql.Int, roleId)
            .input('isApproved', sql.Bit, isApproved)
            .query(`
                INSERT INTO Users (Email, DisplayName, AzureOid, RoleId, IsApproved, IsActive, LastLoginAt)
                OUTPUT INSERTED.*
                VALUES (@email, @displayName, @azureOid, @roleId, @isApproved, 1, GETDATE())
            `);

        console.log(`[AUTH] New user created: ${email} (${isAdmin ? 'Admin' : 'Pending'})`);
        return result.recordset[0];
    }
}

module.exports = OAuthCallbackHandler;
