const { spawn } = require('child_process');
const path = require('path');

async function waitForServer(url, timeoutMs = 30000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        try {
            const res = await fetch(url, { headers: { 'No-Auth': 'true' } });
            if (res.status === 200 || res.status === 401 || res.status === 404) {
                return true;
            }
        } catch (e) {
            // Still starting up
        }
        await new Promise(r => setTimeout(r, 500));
    }
    throw new Error(`Server failed to start within ${timeoutMs}ms`);
}

function runCommand(command, args, cwd) {
    return new Promise((resolve) => {
        const proc = spawn(command, args, { cwd, stdio: 'inherit', shell: true });
        proc.on('close', (code) => {
            resolve(code);
        });
    });
}

async function main() {
    console.log('====================================================');
    console.log('Starting SPH Backend Server for Regression Tests...');
    console.log('====================================================');

    const serverProc = spawn('node', ['server.js'], {
        cwd: __dirname,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, PG_MAX_POOL_SIZE: '20' }
    });

    serverProc.stdout.on('data', (d) => {
        const str = d.toString();
        if (str.includes('Listening') || str.includes('running') || str.includes('PORT')) {
            console.log(`[SERVER] ${str.trim()}`);
        }
    });

    serverProc.stderr.on('data', (d) => {
        const str = d.toString();
        if (!str.includes('SECURITY WARNING')) {
            console.error(`[SERVER ERR] ${str.trim()}`);
        }
    });

    try {
        await waitForServer('http://localhost:3000/api/store');
        console.log('Backend server is alive and responding on http://localhost:3000\n');

        const targetArg = process.argv[2];
        const allSuites = [
            { name: 'Phase 1 Regression Tests', file: 'phase1_regression_tests.js' },
            { name: 'Phase 2 Regression Tests', file: 'phase2_regression_tests.js' },
            { name: 'Phase 3 Regression Tests', file: 'phase3_regression_tests.js' },
            { name: 'Phase 4A Regression Tests', file: 'phase4a_regression_tests.js' },
            { name: 'Phase 4B Security Tests', file: 'phase4b_security_tests.js' },
            { name: 'Phase 4C Infrastructure & DR Tests', file: 'phase4c_infrastructure_tests.js' },
            { name: 'Phase 4D Step 4 Idempotency Tests', file: 'phase4d_step4_idempotency_tests.js' }
        ];
        const suites = targetArg
            ? allSuites.filter(s => s.file === targetArg || s.name.toLowerCase().includes(targetArg.toLowerCase()) || s.file.includes(targetArg))
            : allSuites;

        const results = [];

        for (const suite of suites) {
            console.log('\n----------------------------------------------------');
            console.log(`RUNNING: ${suite.name} (${suite.file})`);
            console.log('----------------------------------------------------');

            const cmdArgs = suite.file === 'phase4c_infrastructure_tests.js' ? [suite.file] : ['--test', suite.file];
            const exitCode = await runCommand('node', cmdArgs, __dirname);
            results.push({ name: suite.name, file: suite.file, exitCode });

            if (exitCode !== 0) {
                console.error(`\n❌ ${suite.name} FAILED with exit code ${exitCode}`);
            } else {
                console.log(`\n✅ ${suite.name} PASSED!`);
            }
        }

        console.log('\n====================================================');
        console.log('FINAL REGRESSION TEST RESULTS SUMMARY');
        console.log('====================================================');
        let allPassed = true;
        for (const r of results) {
            const statusStr = r.exitCode === 0 ? 'PASSED ✅' : 'FAILED ❌';
            console.log(`- ${r.name.padEnd(35)}: ${statusStr}`);
            if (r.exitCode !== 0) allPassed = false;
        }
        console.log('====================================================');

        if (!allPassed) {
            process.exit(1);
        } else {
            console.log('\nALL 6 REGRESSION SUITES PASSED (PHASE 1 + PHASE 2 + PHASE 3 + PHASE 4A + PHASE 4B + PHASE 4C)!');
        }

    } finally {
        console.log('Shutting down backend server...');
        serverProc.kill();
    }
}

main().catch((err) => {
    console.error('Test runner fatal error:', err);
    process.exit(1);
});
