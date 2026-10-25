"""Produce reproducible CSV/plots from V8 allowlisted raw measurements."""
import argparse
import csv
import json
import math
from pathlib import Path


def percentile(values, fraction):
    """Nearest-rank percentile; missing data is None, never an invented zero."""
    if not 0 < fraction <= 1:
        raise ValueError('percentile must be in (0, 1]')
    numbers = sorted(values)
    if any(not isinstance(n, (int, float)) or not math.isfinite(n) or n < 0 for n in numbers):
        raise ValueError('Invalid timing sample')
    return numbers[max(0, math.ceil(fraction * len(numbers)) - 1)] if numbers else None


def validate(metadata, records, expected):
    if metadata.get('status') != 'PASS' or metadata.get('failed') != 0:
        raise ValueError('Campaign did not pass; raw failures must be reviewed')
    if len(records) != expected or metadata.get('completedCases') != expected:
        raise ValueError('Incomplete campaign')
    if any(row.get('status') != 'PASS' for row in records):
        raise ValueError('A case failed despite its campaign metadata')


def write_csv(path, rows):
    if not rows:
        raise ValueError('No CSV rows')
    with path.open('w', encoding='utf-8', newline='') as stream:
        writer = csv.DictWriter(stream, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


def analyze(root):
    def read(path):
        return json.loads((root / path).read_text(encoding='utf-8-sig'))
    recovery, load = read('recovery/results.json'), read('load/results.json')
    recovery_meta, load_meta = read('recovery/metadata.json'), read('load/metadata.json')
    validate(recovery_meta, recovery, 24 * recovery_meta['repetitions'])
    validate(load_meta, load, len(load_meta['counts']) * load_meta['repetitions'])
    recovery_rows, policy_rows, load_rows, flow_rows, http_rows = [], [], [], [], []
    metrics = ['duplicateOrders', 'unconfirmedOrderEffects', 'expiredNeedServiceEffects', 'wrongVisitEffects', 'confirmRequired']
    for row in recovery:
        percentile([row['recoveryMs']], .95)
        recovery_rows.append({key: row[key] for key in ['case', 'repeat', 'scenario', 'policy', 'status', 'recoveryMs', 'orders', 'tickets'] + metrics})
        for index, sample in enumerate(row['http']):
            http_rows.append({'campaign': 'recovery', 'case': row['case'], 'actor': '', 'sample': index, **sample})
    for policy in ['REPLAY_ALL', 'REVIEW', 'SEMANTIC']:
        rows = [row for row in recovery if row['policy'] == policy]
        policy_rows.append({'policy': policy, 'cases': len(rows), **{key: sum(r[key] for r in rows) for key in metrics}, 'p50RecoveryMs': percentile([r['recoveryMs'] for r in rows], .5), 'p95RecoveryMs': percentile([r['recoveryMs'] for r in rows], .95), 'httpSamples': sum(len(r['http']) for r in rows)})
    for index, row in enumerate(load):
        flows = [flow for actor in row['actors'] for flow in actor['flows']]
        if not flows or row['successfulFlows'] != len(flows) or row['errors']:
            raise ValueError('Invalid load flow/error counts')
        http = [sample for actor in row['actors'] for sample in actor['http']]
        load_rows.append({'case': index + 1, 'repeat': row['repeat'], 'clients': row['clients'], 'successfulFlows': len(flows), 'errors': len(row['errors']), 'missedSlots': row['missedSlots'], 'elapsedMs': row['elapsedMs'], 'throughputFlowsPerSecond': row['throughputFlowsPerSecond'], 'p50ResponseMs': percentile([f['responseMs'] for f in flows], .5), 'p95ResponseMs': percentile([f['responseMs'] for f in flows], .95), 'p95RenderDetectionMs': percentile([f['renderMs'] for f in flows], .95), 'p95OrderPaymentMs': percentile([f['totalMs'] for f in flows], .95), 'httpSamples': len(http), 'httpErrors': sum(s['status'] < 200 or s['status'] >= 400 for s in http), 'httpDecodedBodyBytes': sum(s['requestBodyBytes'] + s['responseBodyBytes'] for s in http)})
        for actor in row['actors']:
            for flow in actor['flows']:
                flow_rows.append({'case': index + 1, 'repeat': row['repeat'], 'clients': row['clients'], 'actor': actor['actor'], **flow})
            for sample_index, sample in enumerate(actor['http']):
                http_rows.append({'campaign': 'load', 'case': index + 1, 'actor': actor['actor'], 'sample': sample_index, **sample})
    write_csv(root / 'recovery-cases.csv', recovery_rows)
    write_csv(root / 'policy-summary.csv', policy_rows)
    write_csv(root / 'load-summary.csv', load_rows)
    write_csv(root / 'load-flows.csv', flow_rows)
    write_csv(root / 'http-samples.csv', http_rows)
    summary = {'status': 'PASS', 'percentileMethod': 'nearest-rank ceil(p*n), no interpolation', 'recoveryCases': len(recovery), 'policies': policy_rows, 'loadCases': len(load), 'measuredFlows': len(flow_rows), 'load': load_rows, 'limits': ['Loopback on one shared host, not physical LAN/Internet/phone acceptance', 'Controlled expired-need service scenario; customer need is assumed ended during outage', 'Correlated operations within runs; no confidence interval or significance claim', 'DOM detection after receipt is an upper bound on first visible render, not WebSocket transport latency', 'Decoded HTTP body bytes exclude headers, WebSocket, TCP, TLS and retransmissions', 'Throughput is offered bounded workload, not measured maximum capacity']}
    (root / 'analysis.json').write_text(json.dumps(summary, indent=2), encoding='utf-8')
    return summary


def plots(root, summary):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    plt.rcParams.update({'svg.hashsalt': 'cafelink-v8', 'font.family': 'DejaVu Sans'})
    figure, axes = plt.subplots(1, 2, figsize=(11, 4), layout='constrained')
    policies = summary['policies']
    for offset, (metric, label, color) in enumerate([('unconfirmedOrderEffects', 'Unconfirmed orders', '#99633d'), ('expiredNeedServiceEffects', 'Expired service effects', '#c45b55')]):
        axes[0].bar([i + offset * .34 for i in range(3)], [p[metric] for p in policies], width=.34, label=label, color=color)
    axes[0].set_xticks([i + .17 for i in range(3)], [p['policy'] for p in policies])
    axes[0].set_ylabel('Effects in controlled scenarios')
    axes[0].set_title(f"Recovery campaign ({summary['recoveryCases']} cases)")
    axes[0].legend(fontsize=8)
    rows = summary['load']
    counts = sorted({row['clients'] for row in rows})
    for repeat in sorted({row['repeat'] for row in rows}):
        series = sorted([row for row in rows if row['repeat'] == repeat], key=lambda r: r['clients'])
        axes[1].plot([r['clients'] for r in series], [r['p95ResponseMs'] for r in series], marker='o', label=f'Run {repeat}')
    axes[1].set_xticks(counts)
    axes[1].set_xlabel('Concurrent guest browsers')
    axes[1].set_ylabel('Order flow response p95 (ms)')
    axes[1].set_title('Bounded loopback workload')
    axes[1].legend(fontsize=8)
    for axis in axes:
        axis.grid(axis='y', alpha=.2)
        axis.set_axisbelow(True)
    figure.savefig(root / 'results.svg')
    figure.savefig(root / 'results.png', dpi=160)
    plt.close(figure)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', required=True, type=Path)
    parser.add_argument('--no-plots', action='store_true')
    args = parser.parse_args()
    summary = analyze(args.input)
    if not args.no_plots:
        plots(args.input, summary)
    print(json.dumps({'status': summary['status'], 'recoveryCases': summary['recoveryCases'], 'loadCases': summary['loadCases'], 'flows': summary['measuredFlows']}))
