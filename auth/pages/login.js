/**
 * Login Page
 */

class LoginPage {
    static render(req, res) {
        const returnUrl = req.query.returnUrl || '';
        const error = req.query.error || '';
        
        let errorMessage = '';
        if (error === 'no_code') errorMessage = 'Authentication failed. Please try again.';
        if (error === 'auth_failed') errorMessage = 'Login failed. Please try again.';
        
        const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Login - Area Manager Checklist</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #0078d4 0%, #106ebe 100%);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 20px;
        }
        .login-card {
            background: white;
            border-radius: 16px;
            padding: 50px;
            max-width: 400px;
            width: 100%;
            text-align: center;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        }
        .logo {
            font-size: 4em;
            margin-bottom: 10px;
        }
        h1 {
            color: #333;
            margin-bottom: 5px;
            font-size: 1.5em;
        }
        .subtitle {
            color: #666;
            margin-bottom: 30px;
        }
        .error-message {
            background: #fff3f3;
            color: #dc3545;
            padding: 10px;
            border-radius: 8px;
            margin-bottom: 20px;
        }
        .microsoft-btn {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 12px;
            width: 100%;
            padding: 14px 20px;
            border: 1px solid #ddd;
            border-radius: 8px;
            background: white;
            font-size: 1rem;
            cursor: pointer;
            transition: all 0.2s;
        }
        .microsoft-btn:hover {
            background: #f5f5f5;
            border-color: #0078d4;
        }
        .microsoft-icon {
            width: 20px;
            height: 20px;
        }
        .info {
            margin-top: 30px;
            color: #666;
            font-size: 0.875rem;
        }
    </style>
</head>
<body>
    <div class="login-card">
        <div class="logo">📋</div>
        <h1>Area Manager Checklist</h1>
        <p class="subtitle">GMRL</p>
        
        ${errorMessage ? `<div class="error-message">${errorMessage}</div>` : ''}
        
        <button id="loginBtn" class="microsoft-btn">
            <svg class="microsoft-icon" viewBox="0 0 23 23">
                <path fill="#f35325" d="M0 0h11v11H0z"/>
                <path fill="#81bc06" d="M12 0h11v11H12z"/>
                <path fill="#05a6f0" d="M0 12h11v11H0z"/>
                <path fill="#ffba08" d="M12 12h11v11H12z"/>
            </svg>
            <span>Sign in with Microsoft</span>
        </button>
        
        <p class="info">🔒 Secure authentication using your Microsoft account</p>
    </div>
    
    <script>
        const returnUrl = '${returnUrl.replace(/'/g, "\\'")}';
        
        document.getElementById('loginBtn').addEventListener('click', async () => {
            try {
                const response = await fetch('/auth/config');
                const config = await response.json();
                
                const authUrl = 'https://login.microsoftonline.com/' + config.tenantId + '/oauth2/v2.0/authorize' +
                    '?client_id=' + config.clientId +
                    '&response_type=code' +
                    '&redirect_uri=' + encodeURIComponent(config.redirectUri) +
                    '&scope=' + encodeURIComponent(config.scopes.join(' ')) +
                    '&state=' + encodeURIComponent(returnUrl || '/dashboard') +
                    '&prompt=select_account';
                
                window.location.href = authUrl;
            } catch (error) {
                console.error('Login error:', error);
                alert('Failed to start login. Please try again.');
            }
        });
    </script>
</body>
</html>
        `;
        
        res.send(html);
    }

    static getConfig() {
        return {
            clientId: process.env.AZURE_CLIENT_ID,
            tenantId: process.env.AZURE_TENANT_ID,
            redirectUri: process.env.REDIRECT_URI || `http://localhost:${process.env.PORT}/auth/callback`,
            scopes: ['User.Read']
        };
    }
}

module.exports = LoginPage;
