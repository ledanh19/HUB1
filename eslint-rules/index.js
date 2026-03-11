/**
 * Local ESLint rules for Roomrise Control Hub.
 *
 * Usage in eslint.config.js or .eslintrc:
 *   plugins: { local: require('./eslint-rules') }
 *   rules: { 'local/no-raw-link-heavy-route': 'error' }
 */
module.exports = {
    rules: {
        'no-raw-link-heavy-route': require('./no-raw-link-heavy-route'),
    },
};
