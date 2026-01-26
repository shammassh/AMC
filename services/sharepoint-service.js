/**
 * SharePoint Sync Service
 * Fetches users from SharePoint Site using DELEGATED permissions
 * 
 * Uses the logged-in user's access token to get both Graph and SharePoint tokens
 */

const { ConfidentialClientApplication } = require('@azure/msal-node');
const DatabaseService = require('./database-service');

class SharePointService {
    
    /**
     * Get Graph token using On-Behalf-Of flow
     */
    static async getGraphToken(userAccessToken) {
        if (!userAccessToken) {
            throw new Error('No user access token provided.');
        }
        
        console.log('[SP SYNC] Using On-Behalf-Of flow to get Graph token...');
        
        const msalClient = new ConfidentialClientApplication({
            auth: {
                clientId: process.env.AZURE_CLIENT_ID,
                clientSecret: process.env.AZURE_CLIENT_SECRET,
                authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`
            }
        });
        
        try {
            const response = await msalClient.acquireTokenOnBehalfOf({
                oboAssertion: userAccessToken,
                scopes: ['https://graph.microsoft.com/Sites.Read.All', 'https://graph.microsoft.com/User.Read.All']
            });
            
            console.log('[SP SYNC] OBO token acquired successfully');
            return response.accessToken;
        } catch (oboError) {
            console.error('[SP SYNC] OBO failed:', oboError.message);
            console.log('[SP SYNC] Trying user token directly...');
            return userAccessToken;
        }
    }

    /**
     * Get SharePoint token using On-Behalf-Of flow
     */
    static async getSharePointToken(userAccessToken) {
        if (!userAccessToken) {
            throw new Error('No user access token provided.');
        }
        
        const siteUrl = process.env.SHAREPOINT_SITE_URL;
        const match = siteUrl.match(/https:\/\/([^\/]+)/);
        if (!match) throw new Error('Invalid SharePoint URL');
        
        const spResource = `https://${match[1]}`;
        console.log(`[SP SYNC] Getting SharePoint token for: ${spResource}`);
        
        const msalClient = new ConfidentialClientApplication({
            auth: {
                clientId: process.env.AZURE_CLIENT_ID,
                clientSecret: process.env.AZURE_CLIENT_SECRET,
                authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`
            }
        });
        
        try {
            const response = await msalClient.acquireTokenOnBehalfOf({
                oboAssertion: userAccessToken,
                scopes: [`${spResource}/AllSites.Read`]
            });
            
            console.log('[SP SYNC] SharePoint OBO token acquired');
            return response.accessToken;
        } catch (oboError) {
            console.error('[SP SYNC] SharePoint OBO failed:', oboError.message);
            return null;
        }
    }
    
    /**
     * Extract tenant name from SharePoint URL
     */
    static extractTenantName(siteUrl) {
        const match = siteUrl.match(/https:\/\/([^.]+)\.sharepoint\.com/);
        return match ? match[1] : 'unknown';
    }

    /**
     * Sync users from SharePoint using user's delegated access
     */
    static async syncUsersWithUserToken(userAccessToken) {
        console.log('[SP SYNC] Starting SharePoint sync with user token...');
        console.log('[SP SYNC] Site URL:', process.env.SHAREPOINT_SITE_URL);
        console.log('[SP SYNC] Group name:', process.env.SHAREPOINT_GROUP_NAME);
        
        try {
            // Get both tokens
            const graphToken = await this.getGraphToken(userAccessToken);
            const spToken = await this.getSharePointToken(userAccessToken);
            
            let members = [];
            
            // First try SharePoint REST API with SharePoint token (for site groups)
            if (spToken) {
                members = await this.getSharePointGroupMembersDirect(spToken);
            }
            
            // If no members found, try Graph API approaches
            if (members.length === 0) {
                console.log('[SP SYNC] Trying Graph API...');
                members = await this.getSiteUsersViaGraph(graphToken);
            }
            
            console.log(`[SP SYNC] Found ${members.length} members total`);
            return await this.saveUsersToDatabase(members);
        } catch (error) {
            console.error('[SP SYNC] Error:', error.message);
            throw error;
        }
    }

    /**
     * Get SharePoint group members directly via SharePoint REST API
     */
    static async getSharePointGroupMembersDirect(spToken) {
        const siteUrl = process.env.SHAREPOINT_SITE_URL;
        const groupName = process.env.SHAREPOINT_GROUP_NAME;
        
        console.log('[SP SYNC] Trying SharePoint REST API with SharePoint token...');
        
        try {
            // Try the specific group first
            const groupUrl = `${siteUrl}/_api/web/sitegroups/getbyname('${encodeURIComponent(groupName)}')/users`;
            console.log('[SP SYNC] Calling:', groupUrl);
            
            const response = await fetch(groupUrl, {
                headers: {
                    'Authorization': `Bearer ${spToken}`,
                    'Accept': 'application/json;odata=nometadata'
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                const users = (data.value || [])
                    .filter(u => u.Email && !u.Email.includes('#EXT#'))
                    .map(u => ({
                        id: u.Id?.toString(),
                        displayName: u.Title || u.Email.split('@')[0],
                        mail: u.Email,
                        userPrincipalName: u.LoginName?.replace('i:0#.f|membership|', '') || u.Email
                    }));
                
                console.log(`[SP SYNC] Found ${users.length} users in group "${groupName}"`);
                return users;
            }
            
            const errorText = await response.text();
            console.log(`[SP SYNC] Group error (${response.status}):`, errorText);
            
            // Try all site users as fallback
            console.log('[SP SYNC] Trying all site users...');
            const allUsersUrl = `${siteUrl}/_api/web/siteusers?$filter=PrincipalType eq 1`;
            
            const allResponse = await fetch(allUsersUrl, {
                headers: {
                    'Authorization': `Bearer ${spToken}`,
                    'Accept': 'application/json;odata=nometadata'
                }
            });
            
            if (allResponse.ok) {
                const data = await allResponse.json();
                const users = (data.value || [])
                    .filter(u => u.Email && !u.Email.includes('#EXT#'))
                    .map(u => ({
                        id: u.Id?.toString(),
                        displayName: u.Title || u.Email.split('@')[0],
                        mail: u.Email,
                        userPrincipalName: u.LoginName?.replace('i:0#.f|membership|', '') || u.Email
                    }));
                
                console.log(`[SP SYNC] Found ${users.length} site users`);
                return users;
            }
            
            console.log('[SP SYNC] All site users failed:', await allResponse.text());
            return [];
            
        } catch (error) {
            console.error('[SP SYNC] SharePoint REST error:', error.message);
            return [];
        }
    }

    /**
     * Get users via Microsoft Graph API
     */
    static async getSiteUsersViaGraph(accessToken) {
        const siteUrl = process.env.SHAREPOINT_SITE_URL;
        const tenantName = this.extractTenantName(siteUrl);
        
        const sitePathMatch = siteUrl.match(/sharepoint\.com\/(.+)/);
        const sitePath = sitePathMatch ? sitePathMatch[1] : '';
        
        const siteIdUrl = `https://graph.microsoft.com/v1.0/sites/${tenantName}.sharepoint.com:/${sitePath}`;
        console.log('[SP SYNC] Getting site via Graph:', siteIdUrl);
        
        const siteResponse = await fetch(siteIdUrl, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        
        if (!siteResponse.ok) {
            const errorText = await siteResponse.text();
            console.error('[SP SYNC] Site error:', siteResponse.status, errorText);
            return [];
        }
        
        const siteData = await siteResponse.json();
        console.log('[SP SYNC] Site found:', siteData.displayName);
        
        // Get ALL Azure AD users with pagination
        console.log('[SP SYNC] Fetching ALL Azure AD users...');
        
        let allUsers = [];
        let nextLink = 'https://graph.microsoft.com/v1.0/users?$top=999&$select=id,displayName,mail,userPrincipalName,jobTitle,department';
        let pageCount = 0;
        
        while (nextLink) {
            pageCount++;
            console.log(`[SP SYNC] Fetching page ${pageCount}...`);
            
            const usersResponse = await fetch(nextLink, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            
            if (!usersResponse.ok) {
                console.log('[SP SYNC] Cannot get Azure AD users:', await usersResponse.text());
                break;
            }
            
            const data = await usersResponse.json();
            
            if (data.value) {
                const users = data.value
                    .filter(u => u.mail && !u.mail.includes('#EXT#'))
                    .map(u => ({
                        id: u.id,
                        displayName: u.displayName || u.mail.split('@')[0],
                        mail: u.mail,
                        userPrincipalName: u.userPrincipalName || u.mail
                    }));
                
                allUsers = allUsers.concat(users);
                console.log(`[SP SYNC] Page ${pageCount}: ${users.length} users (total: ${allUsers.length})`);
            }
            
            // Get next page link
            nextLink = data['@odata.nextLink'] || null;
            
            // Safety limit
            if (allUsers.length > 10000) {
                console.log('[SP SYNC] Reached 10000 user limit, stopping');
                break;
            }
        }
        
        console.log(`[SP SYNC] Found ${allUsers.length} total Azure AD users`);
        return allUsers;
    }

    /**
     * Save users to database
     */
    static async saveUsersToDatabase(members) {
        const results = {
            total: members.length,
            added: 0,
            updated: 0,
            skipped: 0,
            errors: []
        };
        
        if (members.length === 0) {
            return results;
        }
        
        // Get Pending role ID - new users start as Pending for admin review
        const roleResult = await DatabaseService.query(
            "SELECT Id FROM UserRoles WHERE RoleName = 'Pending'"
        );
        const pendingRoleId = roleResult.recordset[0]?.Id || 4;
        
        for (const member of members) {
            try {
                const email = member.mail || member.userPrincipalName;
                if (!email || email.includes('#EXT#')) {
                    results.skipped++;
                    continue;
                }
                
                const displayName = member.displayName || email.split('@')[0];
                const azureOid = member.id || null;
                
                // Check if user exists
                const existingUser = await DatabaseService.query(
                    'SELECT Id, DisplayName FROM Users WHERE LOWER(Email) = LOWER(@email)',
                    { email }
                );
                
                if (existingUser.recordset.length > 0) {
                    if (existingUser.recordset[0].DisplayName !== displayName) {
                        await DatabaseService.query(
                            'UPDATE Users SET DisplayName = @displayName, UpdatedAt = GETDATE() WHERE LOWER(Email) = LOWER(@email)',
                            { displayName, email }
                        );
                        results.updated++;
                    } else {
                        results.skipped++;
                    }
                } else {
                    await DatabaseService.query(`
                        INSERT INTO Users (Email, DisplayName, AzureOid, RoleId, IsApproved, IsActive)
                        VALUES (@email, @displayName, @azureOid, @roleId, 0, 1)
                    `, {
                        email: email.toLowerCase(),
                        displayName,
                        azureOid,
                        roleId: pendingRoleId
                    });
                    results.added++;
                    console.log(`[SP SYNC] Added: ${email}`);
                }
            } catch (err) {
                results.errors.push(`${member.mail}: ${err.message}`);
            }
        }
        
        console.log(`[SP SYNC] Done: ${results.added} added, ${results.updated} updated, ${results.skipped} skipped`);
        return results;
    }
}

module.exports = SharePointService;
