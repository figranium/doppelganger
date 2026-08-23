function metricsAtThreshold(samples, threshold) {
    let truePositive = 0;
    let falsePositive = 0;
    let falseNegative = 0;
    for (const sample of samples) {
        const predicted = Number(sample.score) >= threshold;
        if (predicted && sample.match) truePositive += 1;
        else if (predicted) falsePositive += 1;
        else if (sample.match) falseNegative += 1;
    }
    const recall = truePositive / Math.max(1, truePositive + falseNegative);
    const precision = truePositive / Math.max(1, truePositive + falsePositive);
    const f1 = (2 * precision * recall) / Math.max(Number.EPSILON, precision + recall);
    return { threshold, truePositive, falsePositive, falseNegative, precision, recall, f1 };
}

function selectConfidenceThreshold(samples, { minimumRecall = 0.9, minimumF1 = 0.8 } = {}) {
    const candidates = [...new Set(samples.map((sample) => Number(sample.score)).filter(Number.isFinite))].sort((a, b) => a - b);
    const selected = candidates.map((threshold) => metricsAtThreshold(samples, threshold))
        .find((metrics) => metrics.recall >= minimumRecall && metrics.f1 >= minimumF1);
    if (!selected) throw new Error(`No threshold reaches recall ${minimumRecall} and F1 ${minimumF1}`);
    return selected;
}

module.exports = { metricsAtThreshold, selectConfidenceThreshold };
