document.addEventListener('DOMContentLoaded', () => {
    // Feature role tabs (Players / Coaches / Everyone)
    document.querySelectorAll('.v2-feature-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const role = tab.dataset.role;
            document.querySelectorAll('.v2-feature-tab').forEach(t => t.classList.remove('v2-feature-tab-active'));
            tab.classList.add('v2-feature-tab-active');
            document.querySelectorAll('.v2-feature-panel').forEach(p => {
                p.style.display = p.dataset.rolePanel === role ? '' : 'none';
                p.classList.toggle('v2-feature-panel-active', p.dataset.rolePanel === role);
            });
        });
    });

    // Demo video tabs (AI RA / AI PI / AI Rep)
    document.querySelectorAll('.v2-demo-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const demo = tab.dataset.demo;
            document.querySelectorAll('.v2-demo-tab').forEach(t => t.classList.remove('v2-demo-tab-active'));
            tab.classList.add('v2-demo-tab-active');
            document.querySelectorAll('.v2-demo-panel').forEach(p => {
                p.style.display = p.dataset.demoPanel === demo ? '' : 'none';
                p.classList.toggle('v2-demo-panel-active', p.dataset.demoPanel === demo);
            });
        });
    });
});
