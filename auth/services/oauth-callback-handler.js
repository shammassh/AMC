/**
 * OAuth Callback Handler
 * Handles Microsoft Azure AD authentication callback
 */

const msal = require('@azure/msal-node');
const sql = require('mssql');
const SessionManager = require('./session-manager');

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
            
            // Create or update user in database
            const user = await this.createOrUpdateUser(userInfo, response);
            
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

            console.log(`[AUTH] User logged in: ${userInfo.mail || userInfo.userPrincipalName}`);
            
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
        const pool = await sql.connect({
            server: process.env.SQL_SERVER || 'localhost',
            database: process.env.SQL_DATABASE || 'GMRL_AMC',
            user: process.env.SQL_USER || 'sa',
            password: process.env.SQL_PASSWORD,
            options: {
                encrypt: process.env.SQL_ENCRYPT === 'true',
                trustServerCertificate: process.env.SQL_TRUST_CERT === 'true'
            }
        });

        const email = (userInfo.mail || userInfo.userPrincipalName || '').toLowerCase();
        const displayName = userInfo.displayName || email;
        const azureOid = userInfo.id;

        // Check if user exists
        const existing = await pool.request()
            .input('email', sql.NVarChar, email)
            .query('SELECT * FROM Users WHERE LOWER(Email) = @email');

        if (existing.recordset.length > 0) {
            // Update last login
            await pool.request()
                .input('email', sql.NVarChar, email)
                .input('azureOid', sql.NVarChar, azureOid)
                .input('displayName', sql.NVarChar, displayName)
                .query(`
                    UPDATE Users 
                    SET LastLoginAt = GETDATE(), 
                        AzureOid = @azureOid,
                        DisplayName = @displayName
                    WHERE LOWER(Email) = @email
                `);
            
            return existing.recordset[0];
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
