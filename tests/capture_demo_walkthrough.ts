const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

async function run() {
    console.log('Starting Figranium Demo Walkthrough Recording with Clean State...');

    // ── PHASE 1: Stop existing servers & Clean all stored files ──
    console.log('Stopping any running backend servers...');
    try {
        execSync('kill $(lsof -t -i :11345) 2>/dev/null || true');
        execSync('kill $(lsof -t -i :54311) 2>/dev/null || true');
        execSync('pkill -9 -f Xvfb || true');
        execSync('pkill -9 -f x11vnc || true');
        execSync('pkill -9 -f websockify || true');
        execSync('pkill -9 -f node || true');
        execSync('rm -rf /tmp/.X99-lock 2>/dev/null || true');
        execSync('rm -rf /tmp/.X11-unix/X99 2>/dev/null || true');
    } catch (e) { }

    const dataDir = path.join(__dirname, '../data');
    console.log(`Cleaning files in ${dataDir}...`);
    if (fs.existsSync(dataDir)) {
        ['users.json', 'tasks.json', 'executions.json', 'api_key.json', 'session_secret.txt', 'gemini_api_key.json', 'openai_api_key.json', 'claude_api_key.json', 'ollama_api_key.json'].forEach(file => {
            const filePath = path.join(dataDir, file);
            if (fs.existsSync(filePath)) {
                console.log(`Removing ${file}...`);
                fs.unlinkSync(filePath);
            }
        });
        const sessionsDir = path.join(dataDir, 'sessions');
        if (fs.existsSync(sessionsDir)) {
            fs.readdirSync(sessionsDir).forEach(file => {
                try { fs.unlinkSync(path.join(sessionsDir, file)); } catch (e) { }
            });
        }
    }

    // Clean captures directory
    const capturesDir = path.join(__dirname, '../public/captures');
    if (fs.existsSync(capturesDir)) {
        fs.readdirSync(capturesDir).forEach(file => {
            try { fs.unlinkSync(path.join(capturesDir, file)); } catch (e) { }
        });
    }

    const videosDir = path.join(__dirname, '../verification/videos');
    const screenshotsDir = path.join(__dirname, '../verification/screenshots');
    fs.mkdirSync(videosDir, { recursive: true });
    fs.mkdirSync(screenshotsDir, { recursive: true });

    // Clean previous videos
    fs.readdirSync(videosDir).forEach(file => {
        if (file.endsWith('.webm')) {
            fs.unlinkSync(path.join(videosDir, file));
        }
    });

    // Start fresh server via start-vnc.sh
    console.log('Starting fresh backend server...');
    execSync('SESSION_SECRET=secret bash start-vnc.sh > server_output.log 2>&1 &');

    // Wait for server to be fully ready
    console.log('Waiting for backend server to spin up...');
    let serverReady = false;
    for (let i = 0; i < 15; i++) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        try {
            const res = execSync('curl -s -o /dev/null -w "%{http_code}" http://localhost:11345/').toString().trim();
            if (res === '302' || res === '200') {
                serverReady = true;
                break;
            }
        } catch (e) { }
    }
    if (!serverReady) {
        throw new Error('Backend server failed to start within timeout.');
    }
    console.log('Backend server is ready and listening.');

    console.log('Launching browser...');
    const browser = await chromium.launch({
        headless: true,
        args: [
            '--disable-web-security',
            '--disable-features=IsolateOrigins,site-per-process'
        ]
    });

    // ── PHASE 2: Setup without recording ──
    console.log('Phase 2: Logging in and pre-configuring task...');
    const setupContext = await browser.newContext({
        viewport: { width: 1280, height: 720 }
    });
    const setupPage = await setupContext.newPage();

    console.log('Navigating to login/setup page...');
    await setupPage.goto('http://localhost:11345');
    await setupPage.waitForTimeout(2000);

    // Wait for auth screen input
    await setupPage.waitForSelector('input[id="auth-email"]', { timeout: 10000 });
    const isSetup = await setupPage.locator('input[id="auth-name"]').count() > 0;

    if (isSetup) {
        console.log('Admin account setup detected. Filling setup form...');
        await setupPage.fill('input[id="auth-name"]', 'Admin User');
        await setupPage.fill('input[id="auth-email"]', 'user@example.com');
        await setupPage.fill('input[id="auth-pass"]', 'PASSWORD');
        await setupPage.fill('input[id="auth-pass-confirm"]', 'PASSWORD');
        await setupPage.click('button[type="submit"]');
    } else {
        console.log('Login screen detected. Filling login form...');
        await setupPage.fill('input[id="auth-email"]', 'user@example.com');
        await setupPage.fill('input[id="auth-pass"]', 'PASSWORD');
        await setupPage.click('button[type="submit"]');
    }

    // Wait until on dashboard (Sidebar is rendered)
    await setupPage.waitForSelector('[data-testid="sidebar-dashboard"]', { timeout: 15000 });
    console.log('Successfully arrived on Dashboard. Waiting for session stabilization...');
    await setupPage.waitForTimeout(3000);

    // Bypass/Dismiss the theme intro modal if it is shown
    await setupPage.evaluate(() => {
        localStorage.setItem('figranium.seenThemeIntro', 'true');
    });
    await setupPage.reload();
    await setupPage.waitForSelector('[data-testid="sidebar-dashboard"]', { timeout: 15000 });
    await setupPage.waitForTimeout(2000);

    // Pre-create/Configure the 'Demo Autoscraper Task' directly via API
    console.log('Pre-configuring "Demo Autoscraper Task"...');
    const apiData = await setupPage.evaluate(async () => {
        const headers = { 'X-Requested-With': 'XMLHttpRequest' };

        const safeJson = async (res) => {
            const text = await res.text();
            try {
                return JSON.parse(text);
            } catch (err) {
                throw new Error(`Failed to parse JSON from ${res.url} (status: ${res.status}): ${text.slice(0, 300)}`);
            }
        };

        const keyRes = await fetch('/api/settings/api-key', { headers });
        const keyData = await safeJson(keyRes);
        let apiKey = keyData.apiKey;
        if (!apiKey) {
            const regenRes = await fetch('/api/settings/api-key', { method: 'POST', headers });
            const regenData = await safeJson(regenRes);
            apiKey = regenData.apiKey;
        }

        // Fetch existing tasks to check if "Demo Autoscraper Task" exists
        const listRes = await fetch('/api/tasks', { headers });
        const tasks = await safeJson(listRes);
        let task = tasks.find(t => t.name === 'Demo Autoscraper Task');

        const taskPayload = {
            name: 'Demo Autoscraper Task',
            url: 'https://example.com',
            mode: 'agent',
            wait: 1,
            actions: [
                {
                    id: 'act_' + Date.now() + '_goto',
                    type: 'navigate',
                    value: 'https://example.com'
                },
                {
                    id: 'act_' + Date.now() + '_wait',
                    type: 'wait',
                    value: '1'
                },
                {
                    id: 'act_' + Date.now() + '_click',
                    type: 'click',
                    selector: 'a'
                },
                {
                    id: 'act_' + Date.now() + '_wait2',
                    type: 'wait',
                    value: '1'
                }
            ],
            variables: {}
        };

        if (task) {
            const updateRes = await fetch(`/api/tasks/${task.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', ...headers },
                body: JSON.stringify(taskPayload)
            });
            task = await safeJson(updateRes);
        } else {
            const createRes = await fetch('/api/tasks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...headers },
                body: JSON.stringify(taskPayload)
            });
            task = await safeJson(createRes);
        }

        // Trigger task execution once via API to generate history and video capture
        await fetch(`/api/tasks/${task.id}/api`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, ...headers }
        });

        return { taskId: task.id, apiKey };
    });

    console.log(`Pre-configured task with ID: ${apiData.taskId}`);

    // Wait for the background task run to complete so executions and captures are ready
    console.log('Waiting for initial run to generate assets...');
    await setupPage.waitForTimeout(12000);

    // Save storage state for the recording session
    const storageStatePath = path.join(__dirname, '../verification/storage_state.json');
    await setupContext.storageState({ path: storageStatePath });
    await setupContext.close();
    console.log('Setup phase complete. Storage state saved.');

    // ── PHASE 3: Walkthrough Recording ──
    console.log('Phase 3: Starting recording...');
    const recordingContext = await browser.newContext({
        viewport: { width: 1280, height: 720 },
        storageState: storageStatePath,
        recordVideo: {
            dir: videosDir,
            size: { width: 1280, height: 720 }
        }
    });

    const page = await recordingContext.newPage();

    // Set seenThemeIntro in localstorage of this recording page to make sure we don't hit the theme popup
    await page.addInitScript(() => {
        localStorage.setItem('figranium.seenThemeIntro', 'true');
    });

    // 1. 0:00 – 0:03 (The Hook): Start on the Dashboard and immediately click into a pre-configured task
    console.log('Navigating to Dashboard (0:00)...');
    const startTime = Date.now();
    await page.goto('http://localhost:11345');
    await page.waitForSelector('text=Dashboard', { timeout: 10000 });
    await page.waitForTimeout(1000); // Wait 1s on dashboard

    console.log('Clicking "Edit Task" on "Demo Autoscraper Task" card (0:01)...');
    await page.click('button:has-text("Edit Task")');
    await page.waitForSelector('text=On Execution', { timeout: 10000 });
    console.log('Task Editor loaded.');

    // 2. 0:03 – 0:08 (The Flow): Pan over wired-up node canvas, and add Get Content block
    console.log('Panning canvas (0:03)...');
    await page.mouse.move(600, 350);
    await page.keyboard.down('Space');
    await page.mouse.down();
    await page.mouse.move(500, 200, { steps: 15 });
    await page.mouse.up();
    await page.keyboard.up('Space');
    await page.waitForTimeout(1000);

    console.log('Opening Action Palette (0:05)...');
    await page.click('button:has-text("Add Action")');
    await page.waitForSelector('input[placeholder="Type to filter (e.g., if, click, while)"]');
    await page.waitForTimeout(400);

    console.log('Searching for "Get Content" (0:06)...');
    await page.fill('input[placeholder="Type to filter (e.g., if, click, while)"]', 'Get Content');
    await page.waitForTimeout(600);

    console.log('Selecting "Get Content" block (0:07)...');
    await page.click('button:has-text("Get Content")');
    await page.waitForTimeout(1500);

    // 3. 0:08 – 0:16 (The Execution): Hit "RUN TASK" and watch the live execution
    console.log('Clicking RUN TASK (0:08)...');
    await page.click('button:has-text("Run Task")');
    console.log('Watching execution inside split view...');
    await page.waitForTimeout(8000); // Watch live split view run

    // 4. 0:16 – 0:20 (The Output): Jump to Executions and Captures, play video
    console.log('Navigating to Executions screen (0:16)...');
    await page.click('button[aria-label="Executions (Alt + 3)"]');
    await page.waitForSelector('text=Run History', { timeout: 10000 });
    await page.waitForSelector('text=200', { timeout: 10000 });
    await page.waitForTimeout(2000); // Show success run logs

    console.log('Navigating to Captures screen (0:18)...');
    await page.click('button[aria-label="Captures (Alt + 4)"]');
    await page.waitForSelector('text=All Captures', { timeout: 10000 });
    await page.waitForTimeout(1000);

    console.log('Programmatically playing the live recording capture (0:19)...');
    await page.waitForSelector('video', { timeout: 10000 });
    await page.locator('video').first().evaluate(video => {
        video.muted = true;
        video.play();
    });
    await page.waitForTimeout(2000); // Let video play on screen

    const totalDuration = (Date.now() - startTime) / 1000;
    console.log(`Recording phase complete. Total recorded duration: ${totalDuration.toFixed(1)}s`);

    // Clean up context and save
    await recordingContext.close();
    await browser.close();
    console.log('Browser session finished.');

    // Locate the recorded .webm video file
    const files = fs.readdirSync(videosDir).filter(file => file.endsWith('.webm'));
    if (files.length === 0) {
        throw new Error('No recorded video file found!');
    }
    const rawVideoPath = path.join(videosDir, files[0]);
    console.log(`Raw video captured at: ${rawVideoPath}`);

    // Convert raw video into root demo.webm, demo.mp4, and demo.gif
    console.log('Converting raw video to root demo.webm, demo.mp4, and demo.gif...');
    let ffmpegPath = 'ffmpeg';
    try {
        const pathFromPy = execSync('python3 -c "import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())"').toString().trim();
        if (pathFromPy && fs.existsSync(pathFromPy)) {
            ffmpegPath = pathFromPy;
        }
    } catch (e) { }

    const rootDir = path.join(__dirname, '..');
    const demoWebmPath = path.join(rootDir, 'demo.webm');
    const demoMp4Path = path.join(rootDir, 'demo.mp4');
    const demoGifPath = path.join(rootDir, 'demo.gif');

    console.log('Generating demo.webm...');
    execSync(`"${ffmpegPath}" -y -i "${rawVideoPath}" -c:v libvpx-vp9 -crf 28 -b:v 0 -vf "scale=1280:720" "${demoWebmPath}"`, { stdio: 'inherit' });

    console.log('Generating demo.mp4...');
    execSync(`"${ffmpegPath}" -y -i "${rawVideoPath}" -c:v libx264 -pix_fmt yuv420p -crf 22 -preset fast -vf "scale=1280:720" -movflags +faststart "${demoMp4Path}"`, { stdio: 'inherit' });

    console.log('Generating demo.gif...');
    execSync(`"${ffmpegPath}" -y -i "${rawVideoPath}" -vf "fps=15,scale=1280:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=256:stats_mode=full[p];[s1][p]paletteuse=dither=sierra2_4a" "${demoGifPath}"`, { stdio: 'inherit' });

    console.log('All demo media files generated successfully at repository root.');

    return rawVideoPath;
}

if (require.main === module) {
    run().catch(err => {
        console.error('Recording run failed:', err);
        process.exit(1);
    });
}

module.exports = { run };
