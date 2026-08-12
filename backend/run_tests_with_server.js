const { spawn } = require('child_process');

async function run() {
    console.log("Starting backend server...");
    const server = spawn('node', ['server.js'], { cwd: __dirname });
    
    server.stdout.on('data', data => console.log(`[SERVER] ${data.toString().trim()}`));
    server.stderr.on('data', data => console.error(`[SERVER ERR] ${data.toString().trim()}`));
    
    // Wait for server to initialize
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    console.log("Starting tests...");
    const tests = spawn('node', ['e2e.js'], { cwd: __dirname });
    
    tests.stdout.on('data', data => console.log(`[TESTS] ${data.toString().trim()}`));
    tests.stderr.on('data', data => console.error(`[TESTS ERR] ${data.toString().trim()}`));
    
    tests.on('close', code => {
        console.log(`Tests finished with code ${code}`);
        if (code !== 0) {
            server.kill();
            process.exit(code);
        }
        console.log("Starting PUT tests...");
        const putTests = spawn('node', ['e2e_put_tests.js'], { cwd: __dirname });
        putTests.stdout.on('data', data => console.log(`[PUT TESTS] ${data.toString().trim()}`));
        putTests.stderr.on('data', data => console.error(`[PUT TESTS ERR] ${data.toString().trim()}`));
        putTests.on('close', code2 => {
            console.log(`PUT Tests finished with code ${code2}`);
            server.kill();
            process.exit(code2);
        });
    });
}
run();
