import Styles from 'SuiteScripts/BlueCollar/CashFlow/modules/bc_cf_styles';

describe('bc_cf_styles', () => {
    describe('getStyles()', () => {
        it('returns a string wrapped in <style> tags', () => {
            const out = Styles.getStyles();
            expect(out).toMatch(/^<style>/);
            expect(out).toMatch(/<\/style>$/);
        });

        it('defines all design tokens from spec §3.1', () => {
            const out = Styles.getStyles();
            // Brand
            expect(out).toContain('--bccf-brand-500: #1f3b5e');
            expect(out).toContain('--bccf-brand-600: #16304d');
            expect(out).toContain('--bccf-brand-50: #eaeef4');
            // Ink scale
            expect(out).toContain('--bccf-ink-500: #5b6472');
            expect(out).toContain('--bccf-ink-700: #2f3742');
            expect(out).toContain('--bccf-ink-900: #121821');
            // Backgrounds
            expect(out).toContain('--bccf-bg-50: #f7f8fa');
            expect(out).toContain('--bccf-bg-100: #eef0f4');
            expect(out).toContain('--bccf-surface: #ffffff');
            // Border + status
            expect(out).toContain('--bccf-border: #e2e6ec');
            expect(out).toContain('--bccf-success-500: #1f9d55');
            expect(out).toContain('--bccf-warn-500: #c97a0b');
            expect(out).toContain('--bccf-danger-500: #c2361d');
        });

        it('defines core primitive classes from spec §3.15', () => {
            const out = Styles.getStyles();
            expect(out).toMatch(/\.bccf-panel\b/);
            expect(out).toMatch(/\.bccf-btn\b/);
            expect(out).toMatch(/\.bccf-btn-pri\b/);
            expect(out).toMatch(/\.bccf-btn-ghost\b/);
            expect(out).toMatch(/\.bccf-btn-danger-ghost\b/);
            expect(out).toMatch(/\.bccf-add-row-btn\b/);
            expect(out).toMatch(/\.bccf-toggle\b/);
            expect(out).toMatch(/\.bccf-pane-toggle\b/);
            expect(out).toMatch(/\.bccf-tabs\b/);
            expect(out).toMatch(/\.bccf-kpi\b/);
            expect(out).toMatch(/\.bccf-badge\b/);
            expect(out).toMatch(/\.bccf-skel\b/);
            expect(out).toMatch(/\.bccf-toast\b/);
            expect(out).toMatch(/\.bccf-modal\b/);
        });

        it('defines bccf-bar primitive', () => {
            const out = Styles.getStyles();
            expect(out).toMatch(/\.bccf-bar\b/);
        });

        it('defines bccf-daterange primitives from E1 spec §3.2', () => {
            const out = Styles.getStyles();
            expect(out).toMatch(/\.bccf-daterange\b/);
            expect(out).toMatch(/\.bccf-daterange-trigger\b/);
            expect(out).toMatch(/\.bccf-daterange-panel\b/);
            expect(out).toMatch(/\.bccf-daterange-presets\b/);
            expect(out).toMatch(/\.bccf-daterange-custom\b/);
            expect(out).toMatch(/\.bccf-daterange-actions\b/);
            expect(out).toMatch(/\.bccf-daterange-hint\b/);
            expect(out).toMatch(/\.bccf-daterange-label\b/);
        });

        it('defines --bccf-cost-500 coral token', () => {
            const out = Styles.getStyles();
            expect(out).toContain('--bccf-cost-500: #f97316');
        });

        it('uses slim KPI dimensions (E1.5 §3.2.3)', () => {
            const out = Styles.getStyles();
            // Slim padding on .bccf-kpi
            expect(out).toMatch(/\.bccf-kpi\s*\{[^}]*padding:\s*8px\s+12px/);
            // Slim value type
            expect(out).toMatch(/\.bccf-kpi\s+\.bccf-v\s*\{[^}]*font-size:\s*var\(--bccf-text-xl\)/);
        });

        it('namespaces every class with bccf- prefix', () => {
            const out = Styles.getStyles();
            // Match only top-level class selectors: a dot preceded by whitespace, comma, or { (not chained
            // modifier classes like .bccf-badge.success where .success is a compound suffix).
            const orphans = out.match(/(?<=[\s,{])\.([a-zA-Z][a-zA-Z0-9_-]*)/g) || [];
            const violations = orphans.filter(c => !c.trimStart().startsWith('.bccf-'));
            expect(violations).toEqual([]);
        });
    });
});
