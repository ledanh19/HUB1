/**
 * ESLint Rule: no-raw-link-heavy-route
 *
 * Prevents using raw <Link> from react-router-dom to navigate to heavy routes.
 * Heavy routes MUST use <AppLink> which integrates with the route transition
 * system (prefetch + hold + swap).
 *
 * Rule: error
 * Fix: Replace <Link to="/heavy-route"> with <AppLink to="/heavy-route">
 *
 * Configuration in .eslintrc:
 *   "rules": {
 *     "local/no-raw-link-heavy-route": "error"
 *   }
 *
 * To install, add to eslint.config or .eslintrc:
 *   plugins: { local: require('./eslint-rules') }
 */

// Heavy routes that MUST use AppLink (synced from routeLoadingPolicy.ts)
const HEAVY_ROUTES = [
    '/',
    '/bookings',
    '/stays',
    '/collections',
    '/ota-payouts',
    '/disputes',
    '/host-payables',
    '/host-deposits',
    '/reports/pnl',
    '/reports/cashflow',
    '/reports/collections',
    '/analytics',
    '/ota-messages',
    '/services/orders',
    '/approvals',
    '/payments/requests',
    '/payments/cashout',
];

function isHeavyRoute(path) {
    if (typeof path !== 'string') return false;
    // Strip query params and hash
    const cleanPath = path.split('?')[0].split('#')[0];
    return HEAVY_ROUTES.some(heavy => {
        if (heavy === '/') return cleanPath === '/';
        return cleanPath === heavy || cleanPath.startsWith(heavy + '/');
    });
}

module.exports = {
    meta: {
        type: 'problem',
        docs: {
            description: 'Disallow raw <Link> to heavy routes. Use <AppLink> instead.',
            category: 'Route Transition Governance',
            recommended: true,
        },
        fixable: null, // Not auto-fixable (needs import changes too)
        schema: [],
        messages: {
            useAppLink:
                'Raw <Link to="{{ target }}"> targets a heavy route. Use <AppLink> from @/components/system/AppLink instead. Heavy routes require the route transition pipeline (prefetch + hold + swap).',
        },
    },

    create(context) {
        // Track if the current file is AppLink.tsx itself (skip self)
        const filename = context.getFilename();
        if (filename.includes('AppLink')) return {};

        // Track imported names from react-router-dom
        let linkImportName = null;

        return {
            // Track: import { Link } from "react-router-dom"
            ImportDeclaration(node) {
                if (node.source.value !== 'react-router-dom') return;
                for (const spec of node.specifiers) {
                    if (spec.type === 'ImportSpecifier' && spec.imported.name === 'Link') {
                        linkImportName = spec.local.name;
                    }
                }
            },

            // Check: <Link to="/bookings"> or <Link to={`/bookings/${id}`}>
            JSXOpeningElement(node) {
                if (!linkImportName) return;
                if (node.name.type !== 'JSXIdentifier') return;
                if (node.name.name !== linkImportName) return;

                // Find the `to` prop
                const toProp = node.attributes.find(
                    attr => attr.type === 'JSXAttribute' && attr.name && attr.name.name === 'to'
                );
                if (!toProp || !toProp.value) return;

                let target = null;

                // Case 1: to="/bookings" (StringLiteral)
                if (toProp.value.type === 'Literal' && typeof toProp.value.value === 'string') {
                    target = toProp.value.value;
                }

                // Case 2: to={"/bookings"} (JSXExpressionContainer with StringLiteral)
                if (toProp.value.type === 'JSXExpressionContainer') {
                    const expr = toProp.value.expression;
                    if (expr.type === 'Literal' && typeof expr.value === 'string') {
                        target = expr.value;
                    }
                    // Case 3: to={`/bookings/${id}`} (TemplateLiteral)
                    if (expr.type === 'TemplateLiteral' && expr.quasis.length > 0) {
                        // Check the first part of the template
                        target = expr.quasis[0].value.raw;
                    }
                }

                if (target && isHeavyRoute(target)) {
                    context.report({
                        node,
                        messageId: 'useAppLink',
                        data: { target },
                    });
                }
            },
        };
    },
};
