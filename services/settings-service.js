/**
 * Settings Service
 * Manage system settings
 */

const DatabaseService = require('./database-service');

class SettingsService {
    /**
     * Get a setting by key
     */
    static async get(key) {
        const result = await DatabaseService.query(`
            SELECT SettingValue FROM Settings WHERE SettingKey = @key
        `, { key });
        
        if (result.recordset.length > 0) {
            return result.recordset[0].SettingValue;
        }
        return null;
    }

    /**
     * Get passing score threshold
     */
    static async getPassingScore() {
        const value = await this.get('PassingScore');
        return value ? parseFloat(value) : 80; // Default 80%
    }

    /**
     * Set a setting value
     */
    static async set(key, value, updatedBy) {
        const existing = await this.get(key);
        const updatedByInt = updatedBy ? parseInt(updatedBy, 10) : null;
        
        if (existing !== null) {
            await DatabaseService.query(`
                UPDATE Settings 
                SET SettingValue = @value, UpdatedAt = GETDATE(), UpdatedBy = @updatedBy
                WHERE SettingKey = @key
            `, { key, value: String(value), updatedBy: updatedByInt });
        } else {
            await DatabaseService.query(`
                INSERT INTO Settings (SettingKey, SettingValue, UpdatedBy)
                VALUES (@key, @value, @updatedBy)
            `, { key, value: String(value), updatedBy: updatedByInt });
        }
    }

    /**
     * Get all settings
     */
    static async getAll() {
        const result = await DatabaseService.query(`
            SELECT s.*, u.DisplayName as UpdatedByName
            FROM Settings s
            LEFT JOIN Users u ON s.UpdatedBy = u.Id
            ORDER BY s.SettingKey
        `);
        return result.recordset;
    }
}

module.exports = SettingsService;
