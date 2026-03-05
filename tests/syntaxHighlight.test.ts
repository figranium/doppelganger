import { highlightCode } from "../src/utils/syntaxHighlight.ts";
import assert from "assert";

console.log("Testing syntaxHighlight utility...");

function testHighlightVariables() {
    console.log("  Testing highlightVariables...");

    const variables = {
        name: { value: "World" },
        empty: { value: "" },
        notSet: { value: undefined }
    };

    // Existing variable with value
    const res1 = highlightCode("Hello {$name}", "plain", variables);
    assert.ok(res1.includes('class="var-highlight-default"'), "Should use var-highlight-default for set variables");
    assert.ok(res1.includes('{$name}'), "Should contain the variable placeholder");

    // Existing variable with empty value
    const res2 = highlightCode("Empty {$empty}", "plain", variables);
    assert.ok(res2.includes('class="var-highlight"'), "Should use var-highlight for empty variables");

    // Existing variable with undefined value
    const res3 = highlightCode("Not set {$notSet}", "plain", variables);
    assert.ok(res3.includes('class="var-highlight"'), "Should use var-highlight for undefined variables");

    // Non-existent variable
    const res4 = highlightCode("Missing {$missing}", "plain", variables);
    assert.ok(res4.includes('class="var-highlight-undefined"'), "Should use var-highlight-undefined for missing variables");

    // Special 'now' variable
    const res5 = highlightCode("Time: {$now}", "plain", variables);
    assert.ok(res5.includes('class="var-highlight-default"'), "Should use var-highlight-default for 'now'");

    // HTML Escaping
    const res6 = highlightCode("<b>{$name}</b>", "plain", variables);
    assert.ok(res6.includes("&lt;b&gt;"), "Should escape HTML tags in plain text");
    assert.ok(res6.includes("&lt;/b&gt;"), "Should escape HTML tags in plain text");

    console.log("  ✓ highlightVariables passed");
}

function testHighlightJson() {
    console.log("  Testing highlightJson...");

    const json = '{"key": "value", "num": 123, "bool": true, "null": null}';
    const res = highlightCode(json, "json");

    assert.ok(res.includes('class="code-token-key"'), "Should highlight keys");
    assert.ok(res.includes('class="code-token-string"'), "Should highlight strings");
    assert.ok(res.includes('class="code-token-number"'), "Should highlight numbers");
    assert.ok(res.includes('class="code-token-boolean"'), "Should highlight booleans/null");

    // Check specific token
    assert.ok(res.includes('<span class="code-token-key">&quot;key&quot;</span>'), "Key should be correctly wrapped");

    console.log("  ✓ highlightJson passed");
}

function testHighlightHtml() {
    console.log("  Testing highlightHtml...");

    const html = '<div class="container" id="main">Hello</div>';
    const res = highlightCode(html, "html");

    assert.ok(res.includes('class="code-token-tag"'), "Should highlight tags");
    assert.ok(res.includes('class="code-token-attr"'), "Should highlight attributes");
    assert.ok(res.includes('class="code-token-string"'), "Should highlight attribute values");
    assert.ok(res.includes('class="code-token-punct"'), "Should highlight punctuation/tags");

    // Check tag
    assert.ok(res.includes('<span class="code-token-tag">div</span>'), "Tag name should be highlighted");

    console.log("  ✓ highlightHtml passed");
}

function testHighlightJavascript() {
    console.log("  Testing highlightJavascript...");

    const js = 'const x = 10; // comment\nreturn "hello" + {$var};';
    const variables = { var: { value: "world" } };
    const res = highlightCode(js, "javascript", variables);

    assert.ok(res.includes('class="code-token-keyword"'), "Should highlight keywords");
    assert.ok(res.includes('class="code-token-identifier"'), "Should highlight identifiers");
    assert.ok(res.includes('class="code-token-comment"'), "Should highlight comments");
    assert.ok(res.includes('class="code-token-string"'), "Should highlight strings");
    assert.ok(res.includes('class="var-highlight-default"'), "Should highlight variables inside JS");

    assert.ok(res.includes('<span class="code-token-keyword">const</span>'), "Keyword should be highlighted");
    assert.ok(res.includes('// comment'), "Comment should be present");

    console.log("  ✓ highlightJavascript passed");
}

function testHighlightCodeDispatch() {
    console.log("  Testing highlightCode dispatch...");

    const text = "some text";

    // Plain/default
    const resPlain = highlightCode(text, "plain");
    assert.strictEqual(resPlain, text, "Plain should just return escaped text (if no variables)");

    // Invalid language should fallback to highlightVariables (plain)
    // @ts-ignore
    const resFallback = highlightCode(text, "unknown");
    assert.strictEqual(resFallback, text);

    console.log("  ✓ highlightCode dispatch passed");
}

try {
    testHighlightVariables();
    testHighlightJson();
    testHighlightHtml();
    testHighlightJavascript();
    testHighlightCodeDispatch();
    console.log("All syntaxHighlight tests passed!");
} catch (error) {
    console.error("Tests failed!");
    console.error(error);
    process.exit(1);
}
