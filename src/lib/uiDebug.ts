/**
 * ══════════════════════════════════════════════════
 *  UI Debug Inspector — Dev/Staging Only
 * ══════════════════════════════════════════════════
 *
 *  Activation:
 *    - env:   VITE_UI_DEBUG=1  (in .env.local)
 *    - query: ?uiDebug=1       (any page)
 *
 *  Detects 4 bug patterns:
 *    1. HOVER_LEAK     — hovering a button changes sibling buttons
 *    2. CONTRAST_FAIL  — dark text on dark background
 *    3. SHADOW_ON_DARK — large shadow on dark surface
 *    4. HOVER_OUTLINE  — visual outline on hover target (buttons/links)
 *
 *  Output: console warnings with route, DOM path, and CSS info.
 *  Zero production impact — entire module no-ops if not enabled.
 */

// ── Types ──

interface UIDebugWarning {
    type: "HOVER_LEAK" | "CONTRAST_FAIL" | "SHADOW_ON_DARK";
    route: string;
    target: string;
    detail: string;
}

// ── Utilities ──

function isEnabled(): boolean {
    // Check query param first (instant toggle)
    if (typeof window !== "undefined") {
        const params = new URLSearchParams(window.location.search);
        if (params.get("uiDebug") === "1") return true;
    }
    // Check env var
    try {
        return import.meta.env?.VITE_UI_DEBUG === "1";
    } catch {
        return false;
    }
}

function getRoute(): string {
    return window.location.pathname + window.location.search;
}

/** Build a short DOM path for logging */
function getDomPath(el: Element): string {
    const parts: string[] = [];
    let current: Element | null = el;
    let depth = 0;

    while (current && depth < 5) {
        const tag = current.tagName.toLowerCase();
        const slot = current.getAttribute("data-slot");
        const id = current.id;
        const variant = current.getAttribute("data-variant");

        let label = tag;
        if (id) label += `#${id}`;
        if (slot) label += `[data-slot="${slot}"]`;
        if (variant) label += `[data-variant="${variant}"]`;

        // Add first meaningful class (skip Tailwind noise)
        const meaningfulClass = Array.from(current.classList).find(
            (c) => !c.includes(":") && !c.includes("/") && !c.startsWith("!") && c.length < 30
        );
        if (meaningfulClass && !id && !slot) label += `.${meaningfulClass}`;

        parts.unshift(label);
        current = current.parentElement;
        depth++;
    }

    return parts.join(" > ");
}

/** Parse rgb/rgba color string → [r, g, b] */
function parseColor(color: string): [number, number, number] | null {
    const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!match) return null;
    return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
}

/** Luminance (simplified — good enough for threshold checks) */
function luminance(r: number, g: number, b: number): number {
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** Check if a color is "dark" (low luminance) */
function isDark(color: string): boolean {
    const rgb = parseColor(color);
    if (!rgb) return false;
    return luminance(...rgb) < 0.4;
}

/** Check if background is transparent/effectively invisible */
function isTransparent(color: string): boolean {
    if (!color || color === "transparent") return true;
    // rgba(0, 0, 0, 0) or similar fully-transparent
    const match = color.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);
    if (match && parseFloat(match[4]) < 0.1) return true;
    return false;
}

/** Parse box-shadow and check if it's "large" */
function hasLargeShadow(shadow: string): boolean {
    if (!shadow || shadow === "none") return false;
    // Match shadow values — look for blur/spread > 4px
    const matches = shadow.matchAll(/(\d+)px/g);
    for (const m of matches) {
        if (parseInt(m[1]) > 4) return true;
    }
    return false;
}

/** Capture computed visual state of a button for comparison */
function captureVisualState(el: Element): Record<string, string> {
    const cs = getComputedStyle(el);
    return {
        backgroundColor: cs.backgroundColor,
        color: cs.color,
        opacity: cs.opacity,
        transform: cs.transform,
        boxShadow: cs.boxShadow,
    };
}

/** Check if two visual states differ meaningfully */
function statesAreDifferent(
    a: Record<string, string>,
    b: Record<string, string>
): string[] {
    const diffs: string[] = [];
    for (const key of Object.keys(a) as string[]) {
        if (a[key] !== b[key]) {
            diffs.push(`${key}: "${a[key]}" → "${b[key]}"`);
        }
    }
    return diffs;
}

// ── Logging ──

const _logged = new Set<string>();

function logWarning(warning: UIDebugWarning): void {
    const key = `${warning.type}:${warning.target}`;
    if (_logged.has(key)) return; // deduplicate
    _logged.add(key);

    const style =
        warning.type === "HOVER_LEAK"
            ? "color: #ff6b35; font-weight: bold"
            : warning.type === "CONTRAST_FAIL"
                ? "color: #e74c3c; font-weight: bold"
                : "color: #f39c12; font-weight: bold";

    console.warn(
        `%c[UI_DEBUG] type=${warning.type}`,
        style,
        `\n  route=${warning.route}`,
        `\n  target=${warning.target}`,
        `\n  ${warning.detail}`
    );
}

// ── Detectors ──

/** 1. Hover outline — add red outline on button/link hover */
function setupHoverOutline(): () => void {
    let currentOutlined: HTMLElement | null = null;
    const OUTLINE_STYLE = "2px solid rgba(255, 0, 0, 0.6)";
    const OUTLINE_OFFSET = "2px";

    function onMouseOver(e: MouseEvent) {
        const target = (e.target as HTMLElement).closest(
            'button, a[role="button"], [role="button"]'
        ) as HTMLElement | null;

        if (currentOutlined && currentOutlined !== target) {
            currentOutlined.style.outline = "";
            currentOutlined.style.outlineOffset = "";
        }

        if (target) {
            target.style.outline = OUTLINE_STYLE;
            target.style.outlineOffset = OUTLINE_OFFSET;
            currentOutlined = target;
        }
    }

    function onMouseOut(e: MouseEvent) {
        if (currentOutlined) {
            const related = e.relatedTarget as HTMLElement | null;
            if (!related || !currentOutlined.contains(related)) {
                currentOutlined.style.outline = "";
                currentOutlined.style.outlineOffset = "";
                currentOutlined = null;
            }
        }
    }

    document.addEventListener("mouseover", onMouseOver, { passive: true });
    document.addEventListener("mouseout", onMouseOut, { passive: true });

    return () => {
        document.removeEventListener("mouseover", onMouseOver);
        document.removeEventListener("mouseout", onMouseOut);
        if (currentOutlined) {
            currentOutlined.style.outline = "";
            currentOutlined.style.outlineOffset = "";
        }
    };
}

/** 2. Hover leak detection — check if sibling buttons change when one is hovered */
function setupHoverLeakDetector(): () => void {
    const siblingStatesMap = new WeakMap<Element, Record<string, string>[]>();

    function onMouseEnter(e: MouseEvent) {
        const button = (e.target as HTMLElement).closest("button") as HTMLElement | null;
        if (!button) return;

        const container = button.parentElement;
        if (!container) return;

        const siblings = Array.from(container.querySelectorAll("button")).filter(
            (b) => b !== button
        );
        if (siblings.length === 0) return;

        // Capture sibling states BEFORE hover effects settle
        siblingStatesMap.set(
            button,
            siblings.map((s) => captureVisualState(s))
        );

        // Check again after a tick (after CSS transitions)
        requestAnimationFrame(() => {
            setTimeout(() => {
                const beforeStates = siblingStatesMap.get(button);
                if (!beforeStates) return;

                siblings.forEach((sibling, i) => {
                    const afterState = captureVisualState(sibling);
                    const diffs = statesAreDifferent(beforeStates[i], afterState);

                    if (diffs.length > 0) {
                        logWarning({
                            type: "HOVER_LEAK",
                            route: getRoute(),
                            target: getDomPath(button),
                            detail: `Sibling changed: ${getDomPath(sibling)}\n    Changes: ${diffs.join(", ")}`,
                        });
                    }
                });
            }, 100); // wait for transitions
        });
    }

    document.addEventListener("mouseenter", onMouseEnter, {
        passive: true,
        capture: true,
    });

    return () => {
        document.removeEventListener("mouseenter", onMouseEnter, { capture: true });
    };
}

/** 3. Contrast checker — scan buttons for dark-on-dark text */
function runContrastScan(): void {
    const buttons = document.querySelectorAll(
        'button, a[role="button"], [role="button"]'
    );

    buttons.forEach((btn) => {
        // Skip buttons inside header-actions (Header.tsx already handles contrast)
        if ((btn as HTMLElement).closest('[data-slot="header-actions"]')) return;

        const cs = getComputedStyle(btn);
        const bgColor = cs.backgroundColor;
        const textColor = cs.color;

        // Skip transparent backgrounds — ghost/outline buttons inherit from parent
        if (isTransparent(bgColor)) return;

        if (isDark(bgColor) && isDark(textColor)) {
            logWarning({
                type: "CONTRAST_FAIL",
                route: getRoute(),
                target: getDomPath(btn),
                detail: `bg=${bgColor} fg=${textColor} buttonText="${(btn as HTMLElement).innerText?.slice(0, 30)}"`,
            });
        }
    });
}

/** 4. Shadow-on-dark surface detector */
function runShadowOnDarkScan(): void {
    const buttons = document.querySelectorAll("button");

    buttons.forEach((btn) => {
        // Skip buttons inside header-actions (Header.tsx already applies !shadow-none)
        if ((btn as HTMLElement).closest('[data-slot="header-actions"]')) return;

        const cs = getComputedStyle(btn);
        if (!hasLargeShadow(cs.boxShadow)) return;

        // Walk up to find if sitting on a dark surface
        let parent: Element | null = btn.parentElement;
        let depth = 0;
        while (parent && depth < 8) {
            const parentCs = getComputedStyle(parent);
            const parentBg = parentCs.backgroundColor;

            if (isDark(parentBg)) {
                logWarning({
                    type: "SHADOW_ON_DARK",
                    route: getRoute(),
                    target: getDomPath(btn),
                    detail: `shadow="${cs.boxShadow.slice(0, 80)}..." darkSurface=${getDomPath(parent)} bg=${parentBg}`,
                });
                break;
            }
            parent = parent.parentElement;
            depth++;
        }
    });
}

// ── Main init ──

let _cleanup: (() => void) | null = null;
let _scanInterval: ReturnType<typeof setInterval> | null = null;

export function initUIDebug(): () => void {
    if (!isEnabled()) {
        return () => { };
    }

    console.log(
        "%c[UI_DEBUG] 🔍 Inspector ACTIVE — hover outline, leak detection, contrast & shadow scans enabled",
        "color: #2ecc71; font-weight: bold; font-size: 14px"
    );
    console.log(
        "%c[UI_DEBUG] Disable with ?uiDebug=0 or remove VITE_UI_DEBUG from env",
        "color: #7f8c8d"
    );

    // Install event-based detectors
    const cleanupOutline = setupHoverOutline();
    const cleanupLeak = setupHoverLeakDetector();

    // Run static scans periodically (catch dynamically loaded content)
    const runScans = () => {
        runContrastScan();
        runShadowOnDarkScan();
    };

    // Initial scan after page settles
    setTimeout(runScans, 2000);

    // Rescan on route changes (via popstate) and periodically
    window.addEventListener("popstate", () => setTimeout(runScans, 1000));
    _scanInterval = setInterval(runScans, 15000); // every 15s

    _cleanup = () => {
        cleanupOutline();
        cleanupLeak();
        if (_scanInterval) clearInterval(_scanInterval);
        window.removeEventListener("popstate", runScans);
        console.log("%c[UI_DEBUG] Inspector disabled", "color: #95a5a6");
    };

    return _cleanup;
}

/** Re-trigger scans manually (e.g. after dialog opens) */
export function uiDebugRescan(): void {
    if (!isEnabled()) return;
    console.log("%c[UI_DEBUG] Manual rescan triggered", "color: #3498db");
    runContrastScan();
    runShadowOnDarkScan();
}
