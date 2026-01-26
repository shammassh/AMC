/**
 * Database Service
 * Handles SQL Server connection pooling
 */

const sql = require('mssql');

class DatabaseService {
    static pool = null;
    static config = null;

    /**
     * Initialize database connection
     */
    static async initialize() {
        if (this.pool) {
            return this.pool;
        }

        this.config = {
            server: process.env.SQL_SERVER || 'localhost',
            database: process.env.SQL_DATABASE || 'GMRL_AMC',
            user: process.env.SQL_USER || 'sa',
            password: process.env.SQL_PASSWORD,
            options: {
                encrypt: process.env.SQL_ENCRYPT === 'true',
                trustServerCertificate: process.env.SQL_TRUST_CERT === 'true'
            },
            pool: {
                max: 10,
                min: 0,
                idleTimeoutMillis: 30000
            }
        };

        try {
            this.pool = await sql.connect(this.config);
            console.log('[DB] Connected to SQL Server:', this.config.database);
            return this.pool;
        } catch (error) {
            console.error('[DB] Connection failed:', error.message);
            throw error;
        }
    }

    /**
     * Get connection pool
     */
    static getPool() {
        if (!this.pool) {
            throw new Error('Database not initialized. Call initialize() first.');
        }
        return this.pool;
    }

    /**
     * Execute a query
     */
    static async query(queryText, params = {}) {
        const pool = this.getPool();
        const request = pool.request();

        // Add parameters
        for (const [key, value] of Object.entries(params)) {
            request.input(key, value);
        }

        return await request.query(queryText);
    }

    /**
     * Execute a stored procedure
     */
    static async execute(procedureName, params = {}) {
        const pool = this.getPool();
        const request = pool.request();

        for (const [key, value] of Object.entries(params)) {
            request.input(key, value);
        }

        return await request.execute(procedureName);
    }

    /**
     * Close connection
     */
    static async close() {
        if (this.pool) {
            await this.pool.close();
            this.pool = null;
            console.log('[DB] Connection closed');
        }
    }
}

module.exports = DatabaseService;
