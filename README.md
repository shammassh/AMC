# Area Manager Checklist (AMC) App

A tablet-optimized web application for Area Managers to conduct store checklists.

## Features

- 🔐 Azure AD Authentication
- 📋 Dynamic checklist questions with coefficients
- 📸 Photo attachments per question
- 📝 Notes/comments per question
- 👥 User management with role-based access
- 🏪 Store assignments
- 📊 Dashboard with document tracking (GMRL-AMC-0001 format)
- 🔄 Sync users from Azure AD/SharePoint

## Roles

| Role | Permissions |
|------|-------------|
| Admin | Full access - manage users, questions, stores, assignments |
| HeadOfOperations | Define questions and coefficients, view all reports |
| AreaManager | Fill checklists for assigned stores |
| Pending | Awaiting role assignment |

## Setup

### Prerequisites
- Node.js 18+
- SQL Server
- IIS with URL Rewrite module
- Azure AD App Registration

### Installation

1. Clone the repository
```bash
git clone https://github.com/shammassh/AMC.git
```

2. Install dependencies
```bash
cd amc-app
npm install
```

3. Create `.env` file (copy from `.env.example`)
```bash
cp .env.example .env
```

4. Configure your `.env` with:
   - Azure AD credentials
   - SQL Server connection
   - App URL and redirect URI

5. Run database setup
```bash
sqlcmd -S localhost -U sa -P "YourPassword" -d YourDatabase -i sql/setup-database.sql
```

6. Start the app
```bash
npm start
```

## Deployment (IIS)

The app runs as a Windows Service with IIS as reverse proxy:

1. Install the Windows Service:
```bash
cd daemon
node install-service.js
```

2. Create IIS site pointing to `/public` folder

3. Configure web.config for reverse proxy to localhost:PORT

## Environment Variables

| Variable | Description |
|----------|-------------|
| APP_URL | Public URL of the app |
| REDIRECT_URI | Azure AD callback URL |
| PORT | Internal port for Node.js |
| AZURE_TENANT_ID | Azure AD tenant |
| AZURE_CLIENT_ID | Azure AD app client ID |
| AZURE_CLIENT_SECRET | Azure AD app secret |
| SQL_SERVER | SQL Server hostname |
| SQL_DATABASE | Database name |
| SQL_USER | Database user |
| SQL_PASSWORD | Database password |
| ADMIN_EMAIL | Auto-approved admin email |

## Author

GMRL Group - IT Department
