const express = require('express');
const { requireAuth, requireApiKey, requireAuthOrApiKey } = require('../middleware');
const {
    loadTasks, saveTasks, getTaskById, getTaskIndexById,
    loadGeminiApiKey, loadOpenAiApiKey, loadClaudeApiKey, loadOllamaApiKey,
    loadAiModels
} = require('../storage');
const { taskMutex } = require('../state');
const { appendTaskVersion, cloneTaskForVersion } = require('../utils');
const { handleAgent } = require('../../agent/index');
const { fetchWithRedirectValidation } = require('../../../url-utils');

const router = express.Router();

// Parse Ollama config stored as JSON {"url":"...","model":"..."} or plain URL string
function parseOllamaEntry(raw) {
    try {
        const parsed = JSON.parse(raw);
        return { url: (parsed.url || '').replace(/\/$/, ''), model: parsed.model || 'gemma4:e2b' };
    } catch {
        return { url: raw.replace(/\/$/, ''), model: 'gemma4:e2b' };
    }
}

router.get('/', requireAuthOrApiKey, async (req, res) => {
    const tasks = await loadTasks();
    // ⚡ Bolt: Strip large versions history from the list view to reduce payload size by ~95%
    const summary = tasks.map(({ versions, ...rest }) => rest);
    res.json(summary);
});

router.get('/list', requireApiKey, async (req, res) => {
    const tasks = await loadTasks();
    const summary = tasks.map((task) => ({
        id: task.id,
        name: task.name || task.id,
        ...(task.description ? { description: task.description } : {})
    }));
    res.json({ tasks: summary });
});

router.post('/', requireAuthOrApiKey, async (req, res) => {
    await taskMutex.lock();
    try {
        const tasks = await loadTasks();
        const newTask = req.body;
        if (!newTask.id) newTask.id = 'task_' + Date.now();

        const index = getTaskIndexById(newTask.id);
        if (index > -1) {
            const existingTask = tasks[index];
            if (req.query.version === 'true') {
                appendTaskVersion(existingTask);
            }
            // Preserve versions if not creating a new one, as the client might not send them back full
            newTask.versions = existingTask.versions || [];
            tasks[index] = newTask;
        } else {
            newTask.versions = [];
            tasks.push(newTask);
        }

        await saveTasks(tasks);
        res.json(newTask);
    } finally {
        taskMutex.unlock();
    }
});

router.post('/:id/touch', requireAuth, async (req, res) => {
    await taskMutex.lock();
    try {
        const tasks = await loadTasks();
        const task = getTaskById(req.params.id);
        if (!task) return res.status(404).json({ error: 'TASK_NOT_FOUND' });
        task.last_opened = Date.now();
        await saveTasks(tasks);
        res.json(task);
    } finally {
        taskMutex.unlock();
    }
});

router.delete('/:id', requireAuthOrApiKey, async (req, res) => {
    await taskMutex.lock();
    try {
        let tasks = await loadTasks();
        tasks = tasks.filter(t => t.id !== req.params.id);
        await saveTasks(tasks);
        res.json({ success: true });
    } finally {
        taskMutex.unlock();
    }
});

router.get('/:id/versions', requireAuth, async (req, res) => {
    await loadTasks();
    const task = getTaskById(req.params.id);
    if (!task) return res.status(404).json({ error: 'TASK_NOT_FOUND' });
    const versions = (task.versions || []).map(v => ({
        id: v.id,
        timestamp: v.timestamp,
        name: v.snapshot?.name || task.name,
        mode: v.snapshot?.mode || task.mode
    }));
    res.json({ versions });
});

router.get('/:id/versions/:versionId', requireAuth, async (req, res) => {
    await loadTasks();
    const task = getTaskById(req.params.id);
    if (!task) return res.status(404).json({ error: 'TASK_NOT_FOUND' });
    const versions = task.versions || [];
    const version = versions.find(v => v.id === req.params.versionId);
    if (!version || !version.snapshot) return res.status(404).json({ error: 'VERSION_NOT_FOUND' });
    res.json({ snapshot: version.snapshot, metadata: { id: version.id, timestamp: version.timestamp } });
});

router.post('/:id/versions/clear', requireAuth, async (req, res) => {
    await taskMutex.lock();
    try {
        const tasks = await loadTasks();
        const task = getTaskById(req.params.id);
        if (!task) return res.status(404).json({ error: 'TASK_NOT_FOUND' });
        task.versions = [];
        await saveTasks(tasks);
        res.json({ success: true });
    } finally {
        taskMutex.unlock();
    }
});

router.post('/:id/rollback', requireAuth, async (req, res) => {
    await taskMutex.lock();
    try {
        const { versionId } = req.body || {};
        if (!versionId) return res.status(400).json({ error: 'MISSING_VERSION_ID' });
        const tasks = await loadTasks();
        const index = getTaskIndexById(req.params.id);
        if (index === -1) return res.status(404).json({ error: 'TASK_NOT_FOUND' });

        const task = tasks[index];
        const versions = task.versions || [];
        const version = versions.find(v => v.id === versionId);
        if (!version || !version.snapshot) return res.status(404).json({ error: 'VERSION_NOT_FOUND' });

        appendTaskVersion(task);
        const restored = { ...cloneTaskForVersion(version.snapshot), id: task.id, versions: task.versions };
        restored.last_opened = Date.now();

        tasks[index] = restored;

        await saveTasks(tasks);
        res.json(restored);
    } finally {
        taskMutex.unlock();
    }
});

router.post('/generate-selector', requireAuth, async (req, res) => {
    const { task, actionIndex, prompt } = req.body;

    if (!task || !task.actions || typeof actionIndex !== 'number' || !prompt) {
        return res.status(400).json({ error: 'Missing task, actionIndex, or prompt.' });
    }

    // Copy task and slice actions up to actionIndex
    const mockTask = { ...task };
    mockTask.actions = mockTask.actions.slice(0, actionIndex);
    mockTask.wait = 0; // minimize wait

    const mockReq = {
        method: 'POST',
        body: mockTask,
        query: {},
        protocol: req.protocol,
        socket: req.socket
    };

    let agentResult = null;
    let statusCode = 200;

    const mockRes = {
        status: (code) => { statusCode = code; return mockRes; },
        json: (data) => { agentResult = data; }
    };

    try {
        await handleAgent(mockReq, mockRes);

        if (statusCode !== 200 || !agentResult || !agentResult.html) {
            return res.status(statusCode !== 200 ? statusCode : 500).json({ error: 'Failed to extract DOM.' });
        }

        const geminiKeys = await loadGeminiApiKey();
        const openAiKeys = await loadOpenAiApiKey();
        const claudeKeys = await loadClaudeApiKey();
        const ollamaBaseUrls = await loadOllamaApiKey();
        const aiModels = await loadAiModels();

        const hasAnyKeys = geminiKeys.length > 0 || openAiKeys.length > 0 || claudeKeys.length > 0 || ollamaBaseUrls.length > 0;
        if (!hasAnyKeys) {
            return res.status(400).json({ error: 'No AI API keys configured. Please add a Gemini, OpenAI, Anthropic, or Ollama key in Settings.' });
        }

        const llmPrompt = `Given this HTML:\n${agentResult.html}\n\nFind a reliable CSS selector for: "${prompt}"\n\nCRITICAL RULES:\n- Content-based selectors (e.g., using placeholder text, aria-labels, or has-text filters) are the MOST reliable.\n- NEVER use dynamic, numeric, or random-looking IDs (e.g., #APjFqb, #popup-170970, #id-9812).\n- NEVER use auto-generated utility classes that look like hashes (e.g., .css-1h2p).\n- Avoid long, fragile element chains (e.g., body > div > div > span).\n- Prefer specific, semantic, human-readable classes or data attributes (\`[data-testid="xyz"]\`, \`[aria-label="xyz"]\`).\n- If no good class/id exists, prefer structural pseudo-classes (e.g., \`button:nth-of-type(2)\`) or nearby stable anchors.\n\nOnly reply with the exact CSS selector, nothing else. Do not include markdown formatting or backticks.`;

        let selector = null;
        let errors = [];

        // Try Gemini
        for (const key of geminiKeys) {
            try {
                const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${aiModels.gemini}:generateContent`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-goog-api-key': key
                    },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: llmPrompt }] }]
                    })
                });
                if (response.ok) {
                    const data = await response.json();
                    selector = data.candidates?.[0]?.content?.parts?.[0]?.text;
                    if (selector) break;
                    errors.push(`Gemini: Success response but no selector found in data.`);
                } else {
                    const text = await response.text();
                    errors.push(`Gemini (Status ${response.status}): ${text}`);
                }
            } catch (e) { errors.push(`Gemini Error: ${e.message}`); }
        }

        // Try OpenAI if no selector yet
        if (!selector) {
            for (const key of openAiKeys) {
                try {
                    const response = await fetch('https://api.openai.com/v1/chat/completions', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${key}`
                        },
                        body: JSON.stringify({
                            model: aiModels.openai,
                            messages: [{ role: 'user', content: llmPrompt }]
                        })
                    });
                    if (response.ok) {
                        const data = await response.json();
                        selector = data.choices?.[0]?.message?.content;
                        if (selector) break;
                        errors.push(`OpenAI: Success response but no selector found in data.`);
                    } else {
                        const text = await response.text();
                        errors.push(`OpenAI (Status ${response.status}): ${text}`);
                    }
                } catch (e) { errors.push(`OpenAI Error: ${e.message}`); }
            }
        }

        // Try Claude if no selector yet
        if (!selector) {
            for (const key of claudeKeys) {
                try {
                    const response = await fetch('https://api.anthropic.com/v1/messages', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'x-api-key': key,
                            'anthropic-version': '2023-06-01'
                        },
                        body: JSON.stringify({
                            model: aiModels.claude,
                            max_tokens: 1024,
                            messages: [{ role: 'user', content: llmPrompt }]
                        })
                    });
                    if (response.ok) {
                        const data = await response.json();
                        selector = data.content?.[0]?.text;
                        if (selector) break;
                        errors.push(`Claude: Success response but no selector found in data.`);
                    } else {
                        const text = await response.text();
                        errors.push(`Claude (Status ${response.status}): ${text}`);
                    }
                } catch (e) { errors.push(`Claude Error: ${e.message}`); }
            }
        }

        // Try Ollama if no selector yet
        if (!selector) {
            for (const raw of ollamaBaseUrls) {
                try {
                    const { url: baseUrl } = parseOllamaEntry(raw);
                    const response = await fetchWithRedirectValidation(baseUrl + '/v1/chat/completions', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ollama' },
                        body: JSON.stringify({ model: aiModels.ollama, messages: [{ role: 'user', content: llmPrompt }] })
                    });
                    if (response.ok) {
                        const data = await response.json();
                        selector = data.choices?.[0]?.message?.content;
                        if (selector) break;
                        errors.push(`Ollama: Success response but no selector found in data.`);
                    } else {
                        const text = await response.text();
                        errors.push(`Ollama (Status ${response.status}): ${text}`);
                    }
                } catch (e) { errors.push(`Ollama Error: ${e.message}`); }
            }
        }

        if (!selector) {
            return res.status(500).json({
                error: 'Failed to generate selector using configured AI keys.',
                details: errors.join(' | ')
            });
        }

        selector = selector.trim();
        // Remove markdown formatting
        if (selector.startsWith('```') && selector.endsWith('```')) {
            selector = selector.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '').trim();
        } else if (selector.startsWith('`') && selector.endsWith('`')) {
            selector = selector.replace(/^`+|`+$/g, '').trim();
        }

        res.json({ selector });
    } catch (e) {
        console.error('Generate selector error:', e);
        res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
});

router.post('/generate-script', requireAuth, async (req, res) => {
    const { description } = req.body;

    if (!description || typeof description !== 'string' || !description.trim()) {
        return res.status(400).json({ error: 'Missing description.' });
    }

    const geminiKeys = await loadGeminiApiKey();
    const openAiKeys = await loadOpenAiApiKey();
    const claudeKeys = await loadClaudeApiKey();
    const ollamaBaseUrls = await loadOllamaApiKey();
    const aiModels = await loadAiModels();

    const hasAnyKeys = geminiKeys.length > 0 || openAiKeys.length > 0 || claudeKeys.length > 0 || ollamaBaseUrls.length > 0;
    if (!hasAnyKeys) {
        return res.status(400).json({ error: 'No AI API keys configured. Please add a Gemini, OpenAI, Anthropic, or Ollama key in Settings.' });
    }

    const llmPrompt = `Write a JavaScript extraction script that runs in a browser page context (via Playwright's page.evaluate). The script must use \`return\` to output structured data.

Task: ${description.trim()}

RULES:
- Use standard DOM APIs (document.querySelector, document.querySelectorAll, etc.)
- Always return a value (object, array, or primitive)
- Keep the script concise and focused
- Do not use async/await — page.evaluate is already async on the outside
- Do not wrap in a function definition — write only the script body

Only reply with the raw JavaScript code, no markdown, no backticks, no explanation.`;

    let script = null;
    let errors = [];

    for (const key of geminiKeys) {
        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${aiModels.gemini}:generateContent`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-goog-api-key': key
                },
                body: JSON.stringify({ contents: [{ parts: [{ text: llmPrompt }] }] })
            });
            if (response.ok) {
                const data = await response.json();
                script = data.candidates?.[0]?.content?.parts?.[0]?.text;
                if (script) break;
            } else {
                errors.push(`Gemini (${response.status}): ${await response.text()}`);
            }
        } catch (e) { errors.push(`Gemini Error: ${e.message}`); }
    }

    if (!script) {
        for (const key of openAiKeys) {
            try {
                const response = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
                    body: JSON.stringify({ model: aiModels.openai, messages: [{ role: 'user', content: llmPrompt }] })
                });
                if (response.ok) {
                    const data = await response.json();
                    script = data.choices?.[0]?.message?.content;
                    if (script) break;
                } else {
                    errors.push(`OpenAI (${response.status}): ${await response.text()}`);
                }
            } catch (e) { errors.push(`OpenAI Error: ${e.message}`); }
        }
    }

    if (!script) {
        for (const key of claudeKeys) {
            try {
                const response = await fetch('https://api.anthropic.com/v1/messages', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
                    body: JSON.stringify({ model: aiModels.claude, max_tokens: 1024, messages: [{ role: 'user', content: llmPrompt }] })
                });
                if (response.ok) {
                    const data = await response.json();
                    script = data.content?.[0]?.text;
                    if (script) break;
                } else {
                    errors.push(`Claude (${response.status}): ${await response.text()}`);
                }
            } catch (e) { errors.push(`Claude Error: ${e.message}`); }
        }
    }

    if (!script) {
        for (const raw of ollamaBaseUrls) {
            try {
                const { url: baseUrl, model } = parseOllamaEntry(raw);
                const response = await fetchWithRedirectValidation(baseUrl + '/v1/chat/completions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ollama' },
                    body: JSON.stringify({ model, messages: [{ role: 'user', content: llmPrompt }] })
                });
                if (response.ok) {
                    const data = await response.json();
                    script = data.choices?.[0]?.message?.content;
                    if (script) break;
                } else {
                    errors.push(`Ollama (${response.status}): ${await response.text()}`);
                }
            } catch (e) { errors.push(`Ollama Error: ${e.message}`); }
        }
    }

    if (!script) {
        return res.status(502).json({ error: 'All AI providers failed.', details: errors.join(' | ') });
    }

    // Strip markdown code fences if any provider wrapped the output
    script = script.trim();
    if (script.startsWith('```')) {
        script = script.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '').trim();
    }

    res.json({ script });
});

module.exports = router;
