#!/usr/bin/env python3
"""Read-only explicit-handle NanoClaw task query. Run --help or --self-test."""
import argparse
import json
import shutil
import subprocess
import sys
import unittest


class TaskQueryError(RuntimeError):
    """A native error is not a successful/empty/unstarted task."""


def decode_response(text, task_id, session_id):
    try:
        envelope = json.loads(text)
    except (TypeError, ValueError) as exc:
        raise TaskQueryError('invalid-native-json') from exc
    if not isinstance(envelope, dict) or envelope.get('ok') is not True:
        code = envelope.get('error', {}) if isinstance(envelope, dict) else {}
        code = code.get('code', 'native-api-error') if isinstance(code, dict) else 'native-api-error'
        # Do not echo raw stderr, prompts, credential advice or provider responses.
        raise TaskQueryError(f'native-api-error:{code}')
    data = envelope.get('data')
    if not isinstance(data, dict):
        raise TaskQueryError('invalid-task-payload')
    if data.get('session_id') != session_id:
        raise TaskQueryError('session-id-mismatch')
    if data.get('series_id') != task_id:
        raise TaskQueryError('task-id-mismatch')
    if data.get('status') not in {'pending', 'paused', 'completed'}:
        raise TaskQueryError('missing-or-unknown-native-task-status')
    logs = data.get('recent_log', [])
    if not isinstance(logs, list) or not all(isinstance(line, str) for line in logs):
        raise TaskQueryError('invalid-native-log-tail')
    return envelope


def query_task(task_id, session_id, *, runner=None, executable='ncl'):
    runner = runner or subprocess.run
    args = [executable, 'tasks', 'get', '--id', task_id, '--session', session_id, '--json']
    try:
        result = runner(args, capture_output=True, text=True, timeout=60)
    except subprocess.TimeoutExpired as exc:
        raise TaskQueryError('native-cli-timeout') from exc
    except OSError as exc:
        raise TaskQueryError('native-cli-unavailable') from exc
    if result.returncode != 0:
        raise TaskQueryError(f'native-cli-exit:{result.returncode}')
    return decode_response(result.stdout, task_id, session_id)


def summarize(envelope):
    data = envelope['data']
    return {
        'ok': True,
        'task_id': data['series_id'],
        'session_id': data['session_id'],
        'native_status': data['status'],
        'completed_runs': data.get('completed_runs'),
        'failed_runs': data.get('failed_runs'),
        'recent_log_lines': len(data.get('recent_log', [])),
        'acceptance': 'not-assessed; inspect required full evidence and blockers',
    }


class RegressionTests(unittest.TestCase):
    """Synthetic parser/command fixtures, not agent or security-scan results."""
    def setUp(self):
        self.task = 'fixture-task-A_case'
        self.session = 'fixture-session-closed'
        self.envelope = {'ok': True, 'data': {
            'series_id': self.task, 'session_id': self.session, 'status': 'completed',
            'completed_runs': 1, 'failed_runs': 0, 'recent_log': ['fixture blocker, not acceptance'],
        }}

    def decode(self):
        return decode_response(json.dumps(self.envelope), self.task, self.session)

    def test_closed_session_payload_is_readable_not_assumed_accepted(self):
        self.assertIn('not-assessed', summarize(self.decode())['acceptance'])

    def test_pending_stays_pending_not_unstarted(self):
        self.envelope['data']['status'] = 'pending'
        self.assertEqual(summarize(self.decode())['native_status'], 'pending')

    def test_paused_stays_paused(self):
        self.envelope['data']['status'] = 'paused'
        self.assertEqual(summarize(self.decode())['native_status'], 'paused')

    def test_api_false_is_error(self):
        self.envelope = {'ok': False, 'error': {'code': 'handler-error', 'message': 'task not found'}}
        with self.assertRaises(TaskQueryError): self.decode()

    def test_invalid_json_is_error(self):
        with self.assertRaises(TaskQueryError): decode_response('not JSON', self.task, self.session)

    def test_missing_data_is_error(self):
        del self.envelope['data']
        with self.assertRaises(TaskQueryError): self.decode()

    def test_wrong_session_is_error(self):
        self.envelope['data']['session_id'] = 'another-session'
        with self.assertRaises(TaskQueryError): self.decode()

    def test_wrong_task_is_error(self):
        self.envelope['data']['series_id'] = 'another-task'
        with self.assertRaises(TaskQueryError): self.decode()

    def test_unknown_status_is_error(self):
        self.envelope['data']['status'] = 'probably done'
        with self.assertRaises(TaskQueryError): self.decode()

    def test_invalid_log_tail_is_error(self):
        self.envelope['data']['recent_log'] = 'truncated text'
        with self.assertRaises(TaskQueryError): self.decode()

    def test_nonzero_cli_exit_is_error_even_if_json_says_ok(self):
        def runner(args, **kwargs): return subprocess.CompletedProcess(args, 1, json.dumps(self.envelope), '')
        with self.assertRaises(TaskQueryError): query_task(self.task, self.session, runner=runner)

    def test_timeout_is_error(self):
        def runner(args, **kwargs): raise subprocess.TimeoutExpired(args, 60)
        with self.assertRaises(TaskQueryError): query_task(self.task, self.session, runner=runner)

    def test_exact_argv_includes_session_and_never_shell(self):
        captured = {}
        def runner(args, **kwargs):
            captured.update(args=args, kwargs=kwargs)
            return subprocess.CompletedProcess(args, 0, json.dumps(self.envelope), '')
        query_task(self.task, self.session, runner=runner)
        self.assertEqual(captured['args'], ['ncl', 'tasks', 'get', '--id', self.task, '--session', self.session, '--json'])
        self.assertFalse(captured['kwargs'].get('shell', False))


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--id', dest='task_id', help='Exact native task series ID; never normalized')
    parser.add_argument('--session', help='Exact recorded native session ID, including archived sessions')
    parser.add_argument('--raw-json', action='store_true', help='Explicitly print the full validated native envelope; keep private')
    parser.add_argument('--self-test', action='store_true', help='Run synthetic regression fixtures only; no native calls')
    args = parser.parse_args(argv)
    if args.self_test:
        if args.task_id or args.session or args.raw_json:
            parser.error('--self-test cannot be combined with native query options')
        suite = unittest.defaultTestLoader.loadTestsFromTestCase(RegressionTests)
        return 0 if unittest.TextTestRunner(verbosity=2).run(suite).wasSuccessful() else 1
    if not args.task_id or not args.session:
        parser.error('both --id and --session are required for a native read-only query')
    executable = shutil.which('ncl')
    if not executable:
        print(json.dumps({'ok': False, 'error': 'ncl-not-on-PATH'}))
        return 1
    try:
        envelope = query_task(args.task_id, args.session, executable=executable)
    except TaskQueryError as exc:
        print(json.dumps({'ok': False, 'error': str(exc), 'task_id': args.task_id, 'session_id': args.session}))
        return 1
    print(json.dumps(envelope if args.raw_json else summarize(envelope), indent=2))
    return 0


if __name__ == '__main__':
    sys.exit(main())
