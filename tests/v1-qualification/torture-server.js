const express = require('express');
const http = require('http');
const cookieParser = require('cookie');

function createTortureApp() {
    const app = express();
    app.use(express.urlencoded({ extended: true }));
    app.use(express.json());

    // Helper to parse cookies
    app.use((req, res, next) => {
        const header = req.headers.cookie;
        req.cookies = header ? cookieParser.parse(header) : {};
        next();
    });

    // 1. Index
    app.get('/', (req, res) => {
        res.send(`
            <!DOCTYPE html>
            <html>
            <head><title>Figranium Torture Site</title></head>
            <body>
                <h1 id="title">Figranium Deterministic Torture Site</h1>
                <ul>
                    <li><a id="link-form" href="/form">Form Test Page</a></li>
                    <li><a id="link-interactions" href="/interactions">Interactions Page</a></li>
                    <li><a id="link-delayed" href="/delayed">Delayed Elements Page</a></li>
                    <li><a id="link-spa" href="/spa">SPA Routing Page</a></li>
                    <li><a id="link-redirect" href="/redirect-302">302 Redirect</a></li>
                    <li><a id="link-popups" href="/popups">Popups & New Tabs</a></li>
                    <li><a id="link-iframes" href="/iframes">Iframes Test Page</a></li>
                    <li><a id="link-shadow" href="/shadow-dom">Shadow DOM Page</a></li>
                    <li><a id="link-storage" href="/storage">Storage & Cookies Page</a></li>
                    <li><a id="link-auth" href="/auth/login">Auth Login Page</a></li>
                    <li><a id="link-download" href="/files/download">Download File</a></li>
                    <li><a id="link-upload" href="/files/upload">Upload File</a></li>
                    <li><a id="link-captcha" href="/captcha">Captcha Challenge</a></li>
                    <li><a id="link-malformed" href="/malformed">Malformed HTML</a></li>
                </ul>
            </body>
            </html>
        `);
    });

    // 2. Form Page
    app.get('/form', (req, res) => {
        res.send(`
            <!DOCTYPE html>
            <html>
            <head><title>Form Page</title></head>
            <body>
                <h2>Form Controls</h2>
                <form id="test-form" action="/form/submit" method="POST">
                    <label>Username: <input type="text" id="username-input" name="username" value="" /></label><br/>
                    <label>Password: <input type="password" id="password-input" name="password" value="" /></label><br/>
                    <label>Comments: <textarea id="comments-textarea" name="comments"></textarea></label><br/>
                    <label>Subscribe: <input type="checkbox" id="subscribe-checkbox" name="subscribe" value="yes" /></label><br/>
                    <label>Gender:
                        <input type="radio" id="gender-m" name="gender" value="m" /> M
                        <input type="radio" id="gender-f" name="gender" value="f" /> F
                    </label><br/>
                    <label>Country:
                        <select id="country-select" name="country">
                            <option value="">--Select--</option>
                            <option value="us">United States</option>
                            <option value="ca">Canada</option>
                            <option value="uk">United Kingdom</option>
                        </select>
                    </label><br/>
                    <label>Date: <input type="date" id="date-input" name="date" value="2025-01-01" /></label><br/>
                    <button type="submit" id="submit-btn">Submit Form</button>
                </form>
                <div id="form-result"></div>
            </body>
            </html>
        `);
    });

    app.post('/form/submit', (req, res) => {
        res.send(`
            <!DOCTYPE html>
            <html><body>
                <h3 id="form-submitted">Form Submitted Successfully</h3>
                <pre id="submitted-data">${JSON.stringify(req.body)}</pre>
            </body></html>
        `);
    });

    // 3. Interactions Page
    app.get('/interactions', (req, res) => {
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Interactions Page</title>
                <style>
                    #click-box, #dblclick-box, #context-box, #hover-box {
                        width: 150px; height: 50px; border: 2px solid black; margin: 10px 0; display: flex; align-items: center; justify-content: center;
                    }
                    #scroll-container { width: 200px; height: 100px; overflow-y: scroll; border: 1px solid gray; }
                    #scroll-content { height: 500px; }
                    #drag-source { width: 80px; height: 40px; background: lightblue; cursor: move; }
                    #drop-zone { width: 120px; height: 80px; border: 2px dashed green; margin-top: 10px; }
                </style>
            </head>
            <body>
                <h2>User Interactions</h2>
                <button id="btn-single-click" onclick="document.getElementById('click-result').innerText = 'Single Clicked'">Click Me</button>
                <div id="click-result">None</div>

                <div id="click-box" onclick="this.innerText = 'Box Clicked'">Box Target</div>

                <div id="dblclick-box" ondblclick="this.innerText = 'Double Clicked'">Double Click Target</div>

                <div id="context-box" oncontextmenu="event.preventDefault(); this.innerText = 'Right Clicked';">Right Click Target</div>

                <div id="hover-box" onmouseenter="this.innerText = 'Hovered'">Hover Target</div>

                <h3>Keyboard Input</h3>
                <input type="text" id="keyboard-input" onkeyup="document.getElementById('key-output').innerText = this.value" />
                <div id="key-output"></div>

                <h3>Scroll Container</h3>
                <div id="scroll-container" onscroll="document.getElementById('scroll-status').innerText = 'Scrolled: ' + this.scrollTop">
                    <div id="scroll-content">
                        <p>Top</p>
                        <p style="margin-top: 300px;" id="bottom-target">Bottom Target Element</p>
                    </div>
                </div>
                <div id="scroll-status">Scrolled: 0</div>

                <h3>Drag and Drop</h3>
                <div id="drag-source" draggable="true" ondragstart="event.dataTransfer.setData('text', 'dragged')">Drag Me</div>
                <div id="drop-zone" ondragover="event.preventDefault()" ondrop="event.preventDefault(); this.innerText = 'Dropped!'; document.getElementById('drag-status').innerText = 'Drop Success';">Drop Here</div>
                <div id="drag-status">No Drop</div>
            </body>
            </html>
        `);
    });

    // 4. Delayed Elements Page
    app.get('/delayed', (req, res) => {
        res.send(`
            <!DOCTYPE html>
            <html>
            <head><title>Delayed Elements</title></head>
            <body>
                <h2>Delayed Render</h2>
                <button id="start-delay-btn" onclick="triggerDelay()">Trigger Delay</button>
                <div id="delay-container"></div>

                <h3>Changing Selectors</h3>
                <button id="changing-btn" class="step-1" onclick="this.className='step-2'; this.innerText='Clicked!';">Initial Button</button>

                <script>
                    function triggerDelay() {
                        setTimeout(() => {
                            const el = document.createElement('div');
                            el.id = 'delayed-element';
                            el.innerText = 'I appeared after 500ms!';
                            document.getElementById('delay-container').appendChild(el);
                        }, 500);
                    }
                    // Auto delay on load
                    setTimeout(() => {
                        const autoEl = document.createElement('div');
                        autoEl.id = 'auto-delayed-element';
                        autoEl.innerText = 'Loaded automatically after 400ms';
                        document.body.appendChild(autoEl);
                    }, 400);
                </script>
            </body>
            </html>
        `);
    });

    // 5. SPA Page
    app.get('/spa', (req, res) => {
        res.send(`
            <!DOCTYPE html>
            <html>
            <head><title>SPA Page</title></head>
            <body>
                <h2 id="spa-title">Single Page Application</h2>
                <nav>
                    <button id="spa-nav-home" onclick="navigate('home')">Home</button>
                    <button id="spa-nav-about" onclick="navigate('about')">About</button>
                    <button id="spa-nav-contact" onclick="navigate('contact')">Contact</button>
                </nav>
                <div id="spa-content">Current View: Home Page</div>
                <script>
                    function navigate(view) {
                        history.pushState({ view }, '', '/spa#' + view);
                        document.getElementById('spa-content').innerText = 'Current View: ' + view.toUpperCase() + ' Page';
                    }
                </script>
            </body>
            </html>
        `);
    });

    // 6. Redirect Page
    app.get('/redirect-302', (req, res) => {
        res.redirect(302, '/redirect-target');
    });

    app.get('/redirect-target', (req, res) => {
        res.send(`
            <!DOCTYPE html>
            <html>
            <head><title>Redirect Target</title></head>
            <body>
                <h2 id="redirect-header">Redirect Success Target Page</h2>
            </body>
            </html>
        `);
    });

    // 7. Popups / Tabs Page
    app.get('/popups', (req, res) => {
        res.send(`
            <!DOCTYPE html>
            <html>
            <head><title>Popups Page</title></head>
            <body>
                <h2>Popups and Tabs</h2>
                <a id="blank-link" href="/popup-target" target="_blank">Open Target Blank</a>
                <button id="open-window-btn" onclick="window.open('/popup-target', '_blank')">Window Open</button>
            </body>
            </html>
        `);
    });

    app.get('/popup-target', (req, res) => {
        res.send(`
            <!DOCTYPE html>
            <html>
            <head><title>Popup Target</title></head>
            <body>
                <h2 id="popup-title">Popup New Window Target</h2>
            </body>
            </html>
        `);
    });

    // 8. Iframes Page
    app.get('/iframes', (req, res) => {
        res.send(`
            <!DOCTYPE html>
            <html>
            <head><title>Iframes Test Page</title></head>
            <body>
                <h2>Iframe Parent Page</h2>
                <iframe id="test-iframe" src="/iframe-content" width="400" height="200"></iframe>
            </body>
            </html>
        `);
    });

    app.get('/iframe-content', (req, res) => {
        res.send(`
            <!DOCTYPE html>
            <html>
            <body>
                <h3 id="iframe-header">Inside Iframe Document</h3>
                <button id="iframe-btn" onclick="document.getElementById('iframe-status').innerText = 'Iframe Button Clicked'">Iframe Click</button>
                <div id="iframe-status">Ready</div>
            </body>
            </html>
        `);
    });

    // 9. Shadow DOM Page
    app.get('/shadow-dom', (req, res) => {
        res.send(`
            <!DOCTYPE html>
            <html>
            <head><title>Shadow DOM Test Page</title></head>
            <body>
                <h2>Shadow DOM Page</h2>
                <div id="shadow-host"></div>
                <script>
                    const host = document.getElementById('shadow-host');
                    const root = host.attachShadow({ mode: 'open' });
                    root.innerHTML = \`
                        <div id="shadow-inner">
                            <h3 id="shadow-title">Shadow Root Title</h3>
                            <button id="shadow-btn" onclick="document.getElementById('shadow-output').innerText = 'Shadow Clicked'">Shadow Button</button>
                            <input id="shadow-input" type="text" placeholder="Shadow Input" />
                            <div id="shadow-output">Shadow Ready</div>
                        </div>
                    \`;
                </script>
            </body>
            </html>
        `);
    });

    // 10. Storage & Cookies Page
    app.get('/storage', (req, res) => {
        const currentCookie = req.cookies.test_cookie || 'none';
        res.send(`
            <!DOCTYPE html>
            <html>
            <head><title>Storage & Cookies Page</title></head>
            <body>
                <h2>Storage & Cookies</h2>
                <div id="cookie-val">Cookie: ${currentCookie}</div>
                <button id="set-cookie-btn" onclick="document.cookie = 'test_cookie=hello_figranium; path=/'; location.reload();">Set Cookie</button>

                <div id="local-storage-val">LocalStorage: Empty</div>
                <button id="set-ls-btn" onclick="localStorage.setItem('figranium_key', 'ls_value_123'); updateLS();">Set LocalStorage</button>

                <script>
                    function updateLS() {
                        document.getElementById('local-storage-val').innerText = 'LocalStorage: ' + (localStorage.getItem('figranium_key') || 'Empty');
                    }
                    updateLS();
                </script>
            </body>
            </html>
        `);
    });

    // 11. Auth Page
    app.get('/auth/login', (req, res) => {
        if (req.cookies.auth_session === 'valid_token') {
            return res.redirect('/auth/dashboard');
        }
        res.send(`
            <!DOCTYPE html>
            <html>
            <head><title>Auth Login</title></head>
            <body>
                <h2>Login Page</h2>
                <form action="/auth/login" method="POST">
                    <input type="text" id="auth-username" name="username" placeholder="Username" />
                    <input type="password" id="auth-password" name="password" placeholder="Password" />
                    <button type="submit" id="auth-submit-btn">Login</button>
                </form>
            </body>
            </html>
        `);
    });

    app.post('/auth/login', (req, res) => {
        const { username, password } = req.body;
        if (username === 'admin' && password === 'secret123') {
            res.setHeader('Set-Cookie', 'auth_session=valid_token; Path=/; HttpOnly');
            return res.redirect('/auth/dashboard');
        }
        res.status(401).send('<h3>Invalid Credentials</h3>');
    });

    app.get('/auth/dashboard', (req, res) => {
        if (req.cookies.auth_session !== 'valid_token') {
            return res.redirect('/auth/login');
        }
        res.send(`
            <!DOCTYPE html>
            <html>
            <head><title>Protected Dashboard</title></head>
            <body>
                <h2 id="dashboard-title">Welcome to Protected Auth Dashboard</h2>
                <a id="logout-btn" href="/auth/logout">Logout</a>
            </body>
            </html>
        `);
    });

    app.get('/auth/logout', (req, res) => {
        res.setHeader('Set-Cookie', 'auth_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT');
        res.redirect('/auth/login');
    });

    // 12. File Download & Upload
    app.get('/files/download', (req, res) => {
        res.setHeader('Content-Type', 'text/plain');
        res.setHeader('Content-Disposition', 'attachment; filename="torture_sample.txt"');
        res.send('This is a test download file from Figranium Torture Site.');
    });

    app.get('/files/upload', (req, res) => {
        res.send(`
            <!DOCTYPE html>
            <html>
            <head><title>File Upload Page</title></head>
            <body>
                <h2>Upload Test File</h2>
                <form action="/files/upload" method="POST" enctype="multipart/form-data">
                    <input type="file" id="file-input" name="sample_file" />
                    <button type="submit" id="upload-btn">Upload</button>
                </form>
            </body>
            </html>
        `);
    });

    app.post('/files/upload', express.raw({ type: '*/*', limit: '10mb' }), (req, res) => {
        res.send(`
            <!DOCTYPE html>
            <html><body>
                <h3 id="upload-success">Upload Completed</h3>
                <div id="upload-size">Received ${req.body ? req.body.length : 0} bytes</div>
            </body></html>
        `);
    });

    // 13. Captcha Mock Page
    app.get('/captcha', (req, res) => {
        res.send(`
            <!DOCTYPE html>
            <html>
            <head><title>Captcha Mock Page</title></head>
            <body>
                <h2>Mock Captcha Challenge</h2>
                <div id="captcha-container" class="cf-turnstile" data-sitekey="0x4AAAAAA000000000000000">
                    Mock Turnstile Widget
                </div>
                <button id="captcha-solved-btn" onclick="document.getElementById('captcha-status').innerText = 'Solved'">Solve Mock Captcha</button>
                <div id="captcha-status">Unsolved</div>
            </body>
            </html>
        `);
    });

    // 14. Malformed Page
    app.get('/malformed', (req, res) => {
        res.send(`
            <!DOCTYPE html>
            <html>
            <head><title>Malformed Page</title>
            <body>
                <h2 id="malformed-header">Malformed HTML Page</h2>
                <div><p>Unclosed paragraph element
                <span>Nested missing closing span
                <button id="malformed-btn" onclick="document.getElementById('malformed-out').innerText='Clicked'">Click Me
                <div id="malformed-out">Ready</div>
        `);
    });

    // 15. Network failure & echo endpoints
    app.get('/network/failure', (req, res) => {
        res.status(500).send('500 Internal Server Error');
    });

    app.all('/api/echo', (req, res) => {
        res.json({
            method: req.method,
            headers: req.headers,
            query: req.query,
            body: req.body
        });
    });

    return app;
}

function startTortureServer(port = 11346) {
    const app = createTortureApp();
    return new Promise((resolve, reject) => {
        const server = http.createServer(app);
        server.listen(port, '127.0.0.1', () => {
            console.log(`[TORTURE SERVER] Running at http://127.0.0.1:${port}`);
            resolve(server);
        });
        server.on('error', reject);
    });
}

if (require.main === module) {
    const port = process.env.TORTURE_PORT || 11346;
    startTortureServer(port).catch(err => {
        console.error('Failed to start torture server:', err);
        process.exit(1);
    });
}

module.exports = {
    createTortureApp,
    startTortureServer
};
