const SystemLog = require('../models/SystemLog');

const logger = {
    async log(level, module, message, details = null, admin = null, ip = null, method = null, path = null) {
        try {
            const logEntry = new SystemLog({
                level,
                module,
                message,
                details,
                admin,
                ip,
                method,
                path
            });
            await logEntry.save();
            // console.log(`[${level}] [${module}] ${message}`);
        } catch (error) {
            console.error('Logging failed:', error);
        }
    },

    info(module, message, details = null, admin = null, ip = null, method = null, path = null) {
        return this.log('INFO', module, message, details, admin, ip, method, path);
    },

    warn(module, message, details = null, admin = null, ip = null, method = null, path = null) {
        return this.log('WARN', module, message, details, admin, ip, method, path);
    },

    error(module, message, details = null, admin = null, ip = null, method = null, path = null) {
        return this.log('ERROR', module, message, details, admin, ip, method, path);
    }
};

module.exports = logger;
