import UI from 'SuiteScripts/BlueCollar/CashFlow/modules/bc_cf_ui';

describe('bc_cf_ui', () => {

    describe('panel({ header, body, footer })', () => {
        it('wraps in .bccf-panel and includes header/body/footer regions', () => {
            const out = UI.panel({ header: '<h1>T</h1>', body: '<p>B</p>', footer: '<i>F</i>' });
            expect(out).toContain('class="bccf-panel"');
            expect(out).toContain('class="bccf-panel-header"');
            expect(out).toContain('<h1>T</h1>');
            expect(out).toContain('class="bccf-panel-body"');
            expect(out).toContain('<p>B</p>');
            expect(out).toContain('class="bccf-panel-footer"');
            expect(out).toContain('<i>F</i>');
        });
        it('omits header/footer when not provided', () => {
            const out = UI.panel({ body: '<p>B</p>' });
            expect(out).not.toContain('bccf-panel-header');
            expect(out).not.toContain('bccf-panel-footer');
        });
    });

    describe('kpi({ k, v, sub, accent })', () => {
        it('builds a KPI card with label / value / subline using prefixed inner classes', () => {
            const out = UI.kpi({ k: 'Total Cost', v: '$33,000', sub: '3 lines' });
            expect(out).toContain('class="bccf-kpi"');
            expect(out).toContain('class="bccf-k"');
            expect(out).toContain('class="bccf-v"');
            expect(out).toContain('class="bccf-sub"');
            expect(out).toContain('Total Cost');
            expect(out).toContain('$33,000');
            expect(out).toContain('3 lines');
        });
        it('adds accent class when accent=true', () => {
            const out = UI.kpi({ k: 'X', v: '$1', accent: true });
            expect(out).toContain('class="bccf-kpi accent"');
        });
    });

    describe('badge(type, label)', () => {
        it('applies success class', () => {
            expect(UI.badge('success', '✓ Balanced')).toContain('class="bccf-badge success"');
        });
        it('applies warn class', () => {
            expect(UI.badge('warn', '⚠ 108%')).toContain('class="bccf-badge warn"');
        });
    });

    describe('skeletonKpi() / skeletonChart(periods) / skeletonRows(cols, rows)', () => {
        it('skeletonKpi returns N KPI cards with shimmer bars', () => {
            const out = UI.skeletonKpi(4);
            const matches = (out.match(/class="bccf-kpi"/g) || []).length;
            expect(matches).toBe(4);
            expect(out).toContain('class="bccf-skel"');
        });
        it('skeletonChart returns N bars with varied heights', () => {
            const out = UI.skeletonChart(6);
            const bars = (out.match(/class="bccf-skel bar-skel"/g) || []).length;
            expect(bars).toBe(6);
        });
        it('skeletonRows returns rows × cols shimmer cells', () => {
            const out = UI.skeletonRows(7, 5);
            const tds = (out.match(/<td/g) || []).length;
            expect(tds).toBe(35);  // 5 rows × 7 cols
        });
    });

    describe('errorCard(message)', () => {
        it('wraps the error in a .bccf-error-card with retry hint', () => {
            const out = UI.errorCard('Boom');
            expect(out).toContain('class="bccf-error-card"');
            expect(out).toContain('Boom');
            expect(out).toContain('data-action="retry"');  // for the Retry button
        });
    });

    describe('toggle({ id, options, activeValue })', () => {
        it('renders pill buttons with the active option marked', () => {
            const out = UI.toggle({
                id: 'mode',
                options: [{ value: 'cash', label: 'Cash' }, { value: 'accrual', label: 'Accrual' }],
                activeValue: 'cash',
            });
            expect(out).toContain('class="bccf-toggle"');
            expect(out).toMatch(/data-value="cash"[^>]*class="active"/);
            expect(out).toMatch(/data-value="accrual"(?![^>]*active)/);
        });
    });

    describe('esc(s)', () => {
        it('escapes < > & " \' ', () => {
            expect(UI.esc('<a href="x">&"\''+'</a>')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&quot;&#39;&lt;/a&gt;');
        });
        it('handles null and undefined as empty string', () => {
            expect(UI.esc(null)).toBe('');
            expect(UI.esc(undefined)).toBe('');
        });
    });
});
