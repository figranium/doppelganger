import assert from 'assert';
import { JSDOM } from 'jsdom';
import {
    CaptchaDetectionObserver,
    collectDetectionsInPage,
    type DetectionCapablePage,
} from '../src/agent/figranite/captcha/detectionObserver';
import type { DetectionResult, CaptchaCategory } from '../src/agent/figranite/captcha/types';

function buildDom(bodyHtml: string) {
    const dom = new JSDOM(`<!DOCTYPE html><html><body>${bodyHtml}</body></html>`, {
        url: 'http://localhost',
    });
    (global as any).window = dom.window;
    (global as any).document = dom.window.document;
    (global as any).Element = dom.window.Element;
    return dom;
}

async function testClassifiesEachElementType() {
    buildDom(`
        <div class="slider-handle" style="width:40px;height:40px;"></div>
        <audio class="audio-captcha-prompt"></audio>
        <div class="image-grid-tile-matrix" style="width:120px;height:120px;"></div>
        <div class="rotate-orientation-widget" style="width:80px;height:80px;"></div>
        <div class="distorted-obfuscated-text" style="width:100px;height:30px;"></div>
        <iframe src="https://www.google.com/recaptcha/api2/anchor"></iframe>
        <form id="login-form"></form>
        <div class="unrelated-widget"></div>
    `);

    const raw = collectDetectionsInPage();
    const categories = new Set(raw.map((r) => r.category));

    const expected: CaptchaCategory[] = ['slider', 'audio', 'grid', 'rotational', 'distorted-text', 'widget-frame', 'form'];
    for (const category of expected) {
        assert.ok(categories.has(category), `Expected category "${category}" to be detected`);
    }
    console.log('PASS: collectDetectionsInPage classifies each supported category');
}

async function testShadowDomTraversal() {
    const dom = buildDom(`<div id="host"></div>`);
    const host = dom.window.document.getElementById('host')!;
    const shadow = host.attachShadow({ mode: 'open' });
    const slider = dom.window.document.createElement('div');
    slider.className = 'slider-container';
    shadow.appendChild(slider);

    const raw = collectDetectionsInPage();
    const found = raw.find((r) => r.inShadowDom && r.category === 'slider');
    assert.ok(found, 'Expected slider inside shadow DOM to be detected with inShadowDom=true');
    console.log('PASS: shadow DOM roots are traversed and flagged');
}

async function testObserverRoutesToListeners() {
    buildDom(`<div class="slider-handle"></div><form id="f"></form>`);

    const fakePage: DetectionCapablePage = {
        evaluate: async <T,>(fn: () => T) => fn(),
        url: () => 'http://localhost',
    };

    const observer = new CaptchaDetectionObserver(fakePage);
    const routed: Record<string, DetectionResult[]> = { slider: [], form: [] };
    observer.onDetection((result) => {
        if (routed[result.category]) {
            routed[result.category].push(result);
        }
    });

    const results = await observer.scan();
    assert.ok(results.length >= 2, 'Expected at least slider + form detections');
    assert.strictEqual(routed.slider.length, 1, 'Slider payload should route to the slider handler');
    assert.strictEqual(routed.form.length, 1, 'Form payload should route to the form handler');
    assert.ok(routed.slider[0].coordinates, 'Routed payload must include coordinates');
    console.log('PASS: CaptchaDetectionObserver auto-routes payloads by category');
}

async function main() {
    try {
        await testClassifiesEachElementType();
        await testShadowDomTraversal();
        await testObserverRoutesToListeners();
        console.log('All detection router tests passed.');
        process.exitCode = 0;
    } catch (err) {
        console.error(err);
        process.exitCode = 1;
    }
}

main();
