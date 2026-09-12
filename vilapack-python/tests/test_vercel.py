"""Serverless integration contracts with a simulated shared PostgREST backend."""
import hashlib
import importlib
import json
from pathlib import Path
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from datetime import datetime, timezone
from unittest.mock import Mock

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import create_app
from data import DataError
from session_store import SupabaseSessionStore

ORIGIN = 'https://localhost'
SECRET = 'test-only-stable-secret-with-more-than-32-characters'
USER = '16b2e321-376c-40c6-b341-c3cf36f86709'


def iso(seconds):
    return datetime.fromtimestamp(seconds, timezone.utc).isoformat()


class FakePostgREST:
    """Shared state at the HTTP boundary; no Flask session store is mocked."""
    def __init__(self):
        self.rows = {}
        self.calls = []
        self.lock = threading.Lock()

    def __call__(self, method, url, headers, params=None, json=None):
        with self.lock:
            self.calls.append((method, url, deepcopy(headers), deepcopy(json)))
            assert headers['apikey'] == 'sb_secret_test'
            assert 'Authorization' not in headers
            if '/rpc/' in url:
                row = self.rows.get((json['p_namespace'], json['p_session_hash']))
                if not row or row['expires_at'] <= iso(time.time()):
                    return False
                if url.endswith('vila_session_claim_refresh'):
                    if row.get('refresh_until') and row['refresh_until'] >= iso(time.time()):
                        return False
                    row.update(refresh_owner=json['p_owner'], refresh_until=iso(time.time()+60))
                    return True
                assert url.endswith('vila_session_finish_refresh')
                if row.get('refresh_owner') != json['p_owner'] or row.get('refresh_until', '') <= iso(time.time()):
                    return False
                row.update(payload=json['p_payload'], refresh_owner=None, refresh_until=None)
                return True
            assert url.endswith('/vila_web_sessions')
            if method == 'POST':
                key = (json['namespace'], json['session_hash'])
                assert key not in self.rows
                self.rows[key] = deepcopy(json)
                return None
            selected = []
            for key, row in self.rows.items():
                matches = True
                for field, expression in (params or {}).items():
                    if field in ('select', 'limit'):
                        continue
                    op, expected = expression.split('.', 1)
                    value = row.get(field)
                    matches &= value is not None and {'eq': lambda: value == expected,
                        'gt': lambda: value > expected, 'lt': lambda: value < expected}[op]()
                if matches:
                    selected.append(key)
            if method == 'GET':
                return [deepcopy(self.rows[k]) for k in selected][:int((params or {}).get('limit', 1000))]
            for key in selected:
                if method == 'DELETE':
                    del self.rows[key]
                elif method == 'PATCH':
                    self.rows[key].update(deepcopy(json))
                else:
                    raise AssertionError(method)
            return None


@pytest.fixture
def serverless(monkeypatch, tmp_path):
    for name, value in {'VERCEL':'1', 'VERCEL_ENV':'production', 'DEMO_MODE':'0',
        'SECRET_KEY':SECRET, 'SUPABASE_URL':'https://test.supabase.co',
        'SUPABASE_ANON_KEY':'sb_publishable_test', 'SUPABASE_SERVICE_ROLE_KEY':'sb_secret_test',
        'VILAPACK_INSTANCE':str(tmp_path/'must-not-exist')}.items():
        monkeypatch.setenv(name, value)
    monkeypatch.delenv('SESSION_BACKEND', raising=False)
    monkeypatch.delenv('SESSION_NAMESPACE', raising=False)
    backend = FakePostgREST()
    monkeypatch.setattr('session_store._request', backend)
    monkeypatch.setattr('requests.request', Mock(side_effect=AssertionError('No live Supabase in tests')))
    helper = Mock()
    helper.login.return_value = {'access_token':'private-access-token', 'refresh_token':'private-refresh-token',
        'expires_in':3600, 'user':{'id':USER}}
    helper.refresh.return_value = dict(helper.login.return_value, access_token='renewed-private-access',
        refresh_token='renewed-private-refresh')
    monkeypatch.setattr('auth.SupabaseAuth', Mock(return_value=helper))
    financial = Mock()
    financial.get.return_value = {'id':USER, 'nome':'Ana', 'role':'admin'}
    financial.list.return_value = []
    stores = Mock(return_value=financial)
    monkeypatch.setattr('auth.SupabaseStore', stores)
    return backend, helper, stores, tmp_path


def login(app, client):
    assert client.get('/login', base_url=ORIGIN).status_code == 200
    state = cookie(app, client)
    response = client.post('/login', base_url=ORIGIN, data={'csrf_token':state['csrf'],
        'email':'ana@example.com', 'password':'test-password'})
    assert response.status_code == 302
    return response


def cookie(app, client):
    value = client.get_cookie('__Host-vilapack').value
    return app.session_interface.get_signing_serializer(app).loads(value)


def second_instance(first_client):
    app = create_app({'TESTING':True})
    client = app.test_client()
    client.set_cookie('__Host-vilapack', first_client.get_cookie('__Host-vilapack').value, secure=True)
    return app, client


def test_login_survives_cold_start_and_never_writes_local_disk(serverless, monkeypatch):
    backend, _, financial, tmp = serverless
    def forbidden(*args, **kwargs):
        raise AssertionError('Serverless runtime must not create local databases or directories')
    monkeypatch.setattr('sqlite3.connect', forbidden)
    monkeypatch.setattr(Path, 'mkdir', forbidden)
    entrypoint = importlib.reload(sys.modules['index']) if 'index' in sys.modules else importlib.import_module('index')
    app = entrypoint.app
    client = app.test_client()
    response = login(app, client)
    assert all(flag in response.headers['Set-Cookie'] for flag in ('Secure', 'HttpOnly', 'SameSite=Lax', 'Path=/'))
    assert 'Domain=' not in response.headers['Set-Cookie']
    state = cookie(app, client)
    assert set(state) == {'csrf', 'sid'}
    row = next(iter(backend.rows.values()))
    assert row['session_hash'] == hashlib.sha256(state['sid'].encode()).hexdigest()
    assert all(secret not in json.dumps(row) for secret in (state['sid'], 'private-access-token', 'private-refresh-token'))
    app2, client2 = second_instance(client)
    assert app.extensions['vilapack_sessions'] is not app2.extensions['vilapack_sessions']
    assert client2.get('/painel/clientes', base_url=ORIGIN).status_code == 200
    financial.assert_called_with('https://test.supabase.co', 'sb_publishable_test', 'private-access-token')
    assert app2.extensions['vilapack_sessions'].online_users() == {USER}
    assert not (tmp/'must-not-exist').exists()


def test_logout_invalidates_same_cookie_in_all_instances(serverless):
    backend, helper, _, _ = serverless
    app = create_app({'TESTING':True})
    client = app.test_client()
    login(app, client)
    _, client2 = second_instance(client)
    response = client.post('/logout', base_url=ORIGIN, data={'csrf_token':cookie(app, client)['csrf']})
    assert response.status_code == 302
    helper.logout.assert_called_once_with('private-access-token')
    assert not backend.rows
    assert client2.get('/painel/clientes', base_url=ORIGIN).location.endswith('/login')


def test_concurrent_requests_only_rotate_refresh_token_once(serverless):
    backend, helper, financial, _ = serverless
    app = create_app({'TESTING':True})
    client = app.test_client()
    login(app, client)
    _, client2 = second_instance(client)
    vault = app.extensions['vilapack_sessions']
    row = next(iter(backend.rows.values()))
    row['payload'] = vault._encode(dict(helper.login.return_value, expires_at=time.time()-1))
    started, release = threading.Event(), threading.Event()
    def refresh(token):
        assert token == 'private-refresh-token'
        started.set()
        assert release.wait(5)
        return helper.refresh.return_value
    helper.refresh.side_effect = refresh
    with ThreadPoolExecutor(max_workers=1) as pool:
        first = pool.submit(client.get, '/painel/clientes', base_url=ORIGIN)
        try:
            assert started.wait(5)
            assert client2.get('/painel/clientes', base_url=ORIGIN).status_code == 503
            assert helper.refresh.call_count == 1
        finally:
            release.set()
        assert first.result(timeout=5).status_code == 200
    assert client2.get('/painel/clientes', base_url=ORIGIN).status_code == 200
    assert helper.refresh.call_count == 1
    financial.assert_called_with('https://test.supabase.co', 'sb_publishable_test', 'renewed-private-access')


def test_refresh_cannot_recreate_session_deleted_by_logout(serverless):
    _, helper, _, _ = serverless
    app = create_app({'TESTING':True})
    vault = app.extensions['vilapack_sessions']
    vault.save('random-sid', helper.login.return_value)
    assert vault.claim_refresh('random-sid', 'worker1')
    assert not vault.claim_refresh('random-sid', 'worker2')
    vault.delete('random-sid')
    with pytest.raises(DataError, match='encerrada'):
        vault.replace_tokens('random-sid', helper.refresh.return_value, 'worker1')
    vault.release_refresh('random-sid', 'worker1')
    assert vault.get('random-sid') is None


@pytest.mark.parametrize('reason', ['expired', 'corrupted', 'different-secret'])
def test_invalid_shared_session_never_authenticates(serverless, reason):
    backend, helper, _, _ = serverless
    vault = create_app().extensions['vilapack_sessions']
    vault.save('sid', helper.login.return_value)
    row = next(iter(backend.rows.values()))
    if reason == 'expired':
        row['expires_at'] = iso(time.time()-1)
        assert vault.get('sid') is None
    else:
        if reason == 'corrupted':
            row['payload'] = 'not-valid-encrypted-data'
        else:
            vault = create_app({'SECRET_KEY':'changed-secret-with-more-than-32-characters'}).extensions['vilapack_sessions']
        with pytest.raises(DataError, match='validada'):
            vault.get('sid')


def test_preview_namespace_isolated_but_production_stable(serverless, monkeypatch):
    _, helper, _, _ = serverless
    production = create_app().extensions['vilapack_sessions']
    production.save('sid', helper.login.return_value)
    monkeypatch.setenv('VERCEL_URL', 'new-production-deploy.vercel.app')
    assert create_app().extensions['vilapack_sessions'].get('sid')
    monkeypatch.setenv('VERCEL_ENV', 'preview')
    monkeypatch.setenv('VERCEL_URL', 'preview-a.vercel.app')
    preview = create_app().extensions['vilapack_sessions']
    assert preview.get('sid') is None
    preview.save('sid', helper.login.return_value)
    preview.delete('sid')
    assert production.get('sid')


@pytest.mark.parametrize('changes', [
    {'SECRET_KEY':''}, {'SECRET_KEY':'short'}, {'SUPABASE_SERVICE_ROLE_KEY':''},
    {'SUPABASE_SERVICE_ROLE_KEY':'sb_publishable_wrong'}, {'SUPABASE_URL':''},
    {'SUPABASE_ANON_KEY':''}, {'SESSION_BACKEND':'sqlite'}, {'DEMO_MODE':True},
])
def test_invalid_vercel_configuration_fails_before_serving(serverless, changes):
    with pytest.raises(ValueError):
        create_app(changes)


def test_public_assets_and_request_size_limit(serverless):
    app = create_app({'TESTING':True})
    client = app.test_client()
    for path in ('/static/app.css', '/static/app.js', '/static/logo-vilapack.png', '/static/favicon.svg', '/health'):
        assert client.get(path, base_url=ORIGIN).status_code == 200
    assert client.post('/login', base_url=ORIGIN, data=b'x'*(4*1024*1024+1),
        content_type='application/x-www-form-urlencoded').status_code == 413


def test_privileged_endpoint_failure_is_redacted(serverless, monkeypatch):
    vault = create_app().extensions['vilapack_sessions']
    monkeypatch.setattr('session_store._request', Mock(side_effect=DataError('secret key and upstream body')))
    with pytest.raises(DataError) as error:
        vault.get('sid')
    assert 'secret key' not in str(error.value)
    assert 'supabase_sessions.sql' in str(error.value)


def test_dependency_and_entrypoint_manifests_agree():
    import tomllib
    root = Path(__file__).resolve().parents[1]
    project = tomllib.loads((root/'pyproject.toml').read_text(encoding='utf-8'))
    requirements = {line for line in (root/'requirements.txt').read_text().splitlines() if line and not line.startswith('#')}
    assert requirements == set(project['project']['dependencies'])
    assert project['tool']['vercel']['entrypoint'] == 'index:app'
    assert (root/'index.py').is_file()
    assert 'index.py' in json.loads((root/'vercel.json').read_text())['functions']
