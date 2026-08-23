const { captchaModelManager, checksumBuffer } = require('./captcha-model-manager');

const PROVIDERS = Object.freeze({
    recaptcha_v2: Object.freeze({
        framePatterns: ['/recaptcha/api2/bframe', '/recaptcha/enterprise/bframe'],
        instruction: '.rc-imageselect-desc-wrapper, .rc-imageselect-instructions',
        grid: '.rc-imageselect-table-33, .rc-imageselect-table-44',
        cells: '.rc-imageselect-tile',
        submit: '#recaptcha-verify-button',
        noMatch: '#recaptcha-verify-button',
        error: '.rc-imageselect-error-select-more, .rc-imageselect-error-dynamic-more, .rc-imageselect-incorrect-response',
        cleanPrompt(text) {
            return text.replace(/select all (images|squares) with/ig, '')
                .replace(/click verify once there are none left/ig, '')
                .replace(/if there are none, click skip/ig, '');
        }
    }),
    hcaptcha: Object.freeze({
        framePatterns: ['hcaptcha.com/captcha', 'newassets.hcaptcha.com/captcha'],
        instruction: '.prompt-text, .challenge-header .prompt-text, h2',
        grid: '.task-grid',
        cells: '.task-grid .task-image',
        submit: '.button-submit, button[type="submit"]',
        noMatch: '.button-submit, button[type="submit"]',
        error: '.error-text, .challenge-error',
        cleanPrompt(text) {
            return text.replace(/please (click|select) (on )?(all|each) (the )?(images|squares) (containing|with)/ig, '')
                .replace(/if there are none, (click|select) (skip|next)/ig, '');
        }
    })
});

async function findChallengeFrame(page, adapter) {
    for (const frame of page.frames()) {
        if (!adapter.framePatterns.some((pattern) => frame.url().includes(pattern))) continue;
        if (await frame.locator(adapter.grid).first().isVisible({ timeout: 250 }).catch(() => false)) return frame;
    }
    return null;
}

function normalizePrompt(adapter, text) {
    return adapter.cleanPrompt(String(text || '')).replace(/\s+/g, ' ').replace(/[.!]+$/, '').trim();
}

function normalizeBox(detection) {
    const box = detection?.box || detection?.bbox;
    if (Array.isArray(box) && box.length >= 4) {
        const [xmin, ymin, xmax, ymax] = box.map(Number);
        return { xmin, ymin, xmax, ymax };
    }
    if (box && typeof box === 'object') {
        const xmin = Number(box.xmin ?? box.x ?? box.left);
        const ymin = Number(box.ymin ?? box.y ?? box.top);
        const xmax = Number(box.xmax ?? box.right ?? (Number.isFinite(xmin) ? xmin + Number(box.width) : NaN));
        const ymax = Number(box.ymax ?? box.bottom ?? (Number.isFinite(ymin) ? ymin + Number(box.height) : NaN));
        if ([xmin, ymin, xmax, ymax].every(Number.isFinite)) return { xmin, ymin, xmax, ymax };
    }
    return null;
}

function pngDimensions(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length < 24 || buffer.toString('ascii', 1, 4) !== 'PNG') return null;
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function mapDetectionsToCells(detections, gridBox, cellBoxes, imageSize = null) {
    const indexes = new Set();
    const scaleX = imageSize?.width ? gridBox.width / imageSize.width : 1;
    const scaleY = imageSize?.height ? gridBox.height / imageSize.height : 1;
    for (const detection of detections) {
        const box = normalizeBox(detection);
        if (!box) continue;
        const centerX = gridBox.x + (((box.xmin + box.xmax) / 2) * scaleX);
        const centerY = gridBox.y + (((box.ymin + box.ymax) / 2) * scaleY);
        const index = cellBoxes.findIndex((cell) => cell
            && centerX >= cell.x && centerX <= cell.x + cell.width
            && centerY >= cell.y && centerY <= cell.y + cell.height);
        if (index >= 0) indexes.add(index);
    }
    return [...indexes];
}

async function classifyGrid(frame, adapter, cells, label, seenTiles) {
    const grid = frame.locator(adapter.grid).first();
    const gridBox = await grid.boundingBox().catch(() => null);
    if (gridBox) {
        const image = await grid.screenshot({ type: 'png' });
        const detections = await captchaModelManager.detect(image, label);
        if (detections.length === 0) return [];
        const cellBoxes = [];
        for (let index = 0; index < await cells.count(); index += 1) cellBoxes.push(await cells.nth(index).boundingBox().catch(() => null));
        const mapped = mapDetectionsToCells(detections, gridBox, cellBoxes, pngDimensions(image));
        if (mapped.length || detections.every((item) => normalizeBox(item))) {
            const changed = [];
            for (const index of mapped) {
                const image = await cells.nth(index).screenshot({ type: 'png' });
                const fingerprint = checksumBuffer(image);
                if (seenTiles.get(index) === fingerprint) continue;
                seenTiles.set(index, fingerprint);
                changed.push(index);
            }
            return changed;
        }
    }

    const selected = [];
    for (let index = 0; index < await cells.count(); index += 1) {
        const cell = cells.nth(index);
        const image = await cell.screenshot({ type: 'png' });
        const fingerprint = checksumBuffer(image);
        if (seenTiles.get(index) === fingerprint) continue;
        seenTiles.set(index, fingerprint);
        if ((await captchaModelManager.detect(image, label)).length) selected.push(index);
    }
    return selected;
}

async function visibleText(frame, selector) {
    return frame.locator(selector).first().innerText({ timeout: 1500 }).catch(() => '');
}

async function solveImageGrid(page, { captchaType, deadline, waitForToken, logs = [] }) {
    const adapter = PROVIDERS[captchaType];
    if (!adapter) throw new Error(`No image-grid adapter for ${captchaType}`);
    const seenTiles = new Map();
    let previousPrompt = '';
    for (let round = 0; round < 6 && Date.now() < deadline; round += 1) {
        const frame = await findChallengeFrame(page, adapter);
        if (!frame) throw new Error(`${captchaType} image challenge frame disappeared`);
        const rejection = await visibleText(frame, adapter.error);
        if (rejection) throw new Error(`${captchaType} rejected the previous selection: ${rejection.replace(/\s+/g, ' ').trim()}`);
        const prompt = normalizePrompt(adapter, await visibleText(frame, adapter.instruction));
        if (!prompt) throw new Error(`${captchaType} solver could not read the image challenge instruction`);
        if (prompt !== previousPrompt) {
            seenTiles.clear();
            previousPrompt = prompt;
        }
        let totalSelections = 0;
        for (let sweep = 0; sweep < 4 && Date.now() < deadline; sweep += 1) {
            const cells = frame.locator(adapter.cells);
            const count = await cells.count();
            if (![9, 16].includes(count)) throw new Error(`Unsupported ${captchaType} grid size (${count} cells)`);
            const selected = await classifyGrid(frame, adapter, cells, prompt, seenTiles);
            for (const index of selected) await cells.nth(index).click({ timeout: 2000 });
            totalSelections += selected.length;
            if (!selected.length) break;
            await page.waitForTimeout(600);
        }
        logs.push(`Local ${captchaType} grid round ${round + 1}: selected ${totalSelections} cells for "${prompt}"`);
        await frame.locator(totalSelections ? adapter.submit : adapter.noMatch).first().click({ timeout: 2000 });
        const token = await waitForToken(page, captchaType, Math.min(2500, Math.max(0, deadline - Date.now())));
        if (token) return token;
        await page.waitForTimeout(350);
    }
    return null;
}

module.exports = { PROVIDERS, normalizePrompt, normalizeBox, pngDimensions, mapDetectionsToCells, solveImageGrid };
