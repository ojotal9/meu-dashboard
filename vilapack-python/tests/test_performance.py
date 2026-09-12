"""Performance regressions: unnecessary reads, complete data and safe TCP reuse."""
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import threading
from unittest.mock import Mock

import pytest

import app as application
from data import DataError, FINANCIAL_TABLES, LocalStore, SupabaseStore, _request


@pytest.fixture
def demo(tmp_path, monkeypatch):
    monkeypatch.setenv('VILAPACK_INSTANCE', str(tmp_path))
    app = application.create_app({'TESTING':True, 'DEMO_MODE':True, 'VERCEL_MODE':False,
        'SESSION_BACKEND':'sqlite', 'SECRET_KEY':'test-performance-only',
        'DEMO_DB':str(tmp_path/'demo.sqlite3'), 'AUTH_DB':str(tmp_path/'sessions.sqlite3')})
    return app.test_client()


@pytest.mark.parametrize('page,expected', [
    ('inicio', {'transacoes','clientes','contas_receber','contas_pagar','metas'}),
    ('clientes', {'clientes'}), ('configuracoes', set()), ('usuarios', set()),
    ('transacoes', {'transacoes','clientes'}),
    ('contas-receber', {'contas_receber','transacoes','clientes'}),
    ('contas-pagar', {'contas_pagar','transacoes'}),
    ('materia-prima', {'materia_primas','transacoes'}),
    ('resumo-cliente', {'transacoes'}), ('margem-produto', {'transacoes'}),
    ('historico', {'transacoes','contas_receber','contas_pagar'}),
])
def test_pages_read_only_needed_tables_and_keep_identical_html(demo, monkeypatch, page, expected):
    calls = []
    original = LocalStore.list
    def read(store, table):
        calls.append(table)
        return original(store, table)
    monkeypatch.setattr(LocalStore, 'list', read)
    optimized = demo.get(f'/painel/{page}?mes=todos')
    assert optimized.status_code == 200
    assert set(calls) == expected
    assert len(calls) == len(expected)
    # Compare the same records and CSRF cookie with the original all-table load.
    monkeypatch.setitem(application.PAGE_DATA, page, FINANCIAL_TABLES)
    reference = demo.get(f'/painel/{page}?mes=todos')
    assert reference.status_code == 200
    assert optimized.data == reference.data


@pytest.mark.parametrize('page,expected', [
    ('inicio','transacoes'), ('transacoes','transacoes'), ('clientes','clientes'),
    ('materia-prima','materia_primas'), ('contas-receber','contas_receber'),
    ('contas-pagar','contas_pagar'), ('resumo-cliente','transacoes'),
    ('margem-produto','transacoes'), ('historico','transacoes'),
])
def test_exports_read_one_table_and_keep_identical_csv(demo, monkeypatch, page, expected):
    calls = []
    original = LocalStore.list
    def read(store, table):
        calls.append(table)
        return original(store, table)
    monkeypatch.setattr(LocalStore, 'list', read)
    optimized = demo.get(f'/exportar/{page}?mes=todos')
    assert optimized.status_code == 200
    assert calls == [expected]
    monkeypatch.setitem(application.EXPORT_DATA, page, FINANCIAL_TABLES)
    reference = demo.get(f'/exportar/{page}?mes=todos')
    assert optimized.data == reference.data


@pytest.mark.parametrize('count,cap,expected_offsets', [
    (0,1000,[0]), (5,1000,[0]), (5,2,[0,2,4]), (4,2,[0,2]), (1001,1000,[0,1000]),
])
def test_exact_count_avoids_empty_probe_and_respects_lower_server_caps(monkeypatch, count, cap, expected_offsets):
    records = [{'id':str(i)} for i in range(count)]
    def respond(method, url, headers, *, params, response_headers):
        assert headers['Authorization'] == 'Bearer user-jwt'
        start = params['offset']
        rows = records[start:start+cap]
        if start == 0:
            assert headers['Prefer'] == 'count=exact'
            response_headers['content-range'] = f'0-{len(rows)-1}/{count}' if rows else '*/0'
        else:
            assert 'Prefer' not in headers
            response_headers['content-range'] = f'{start}-{start+len(rows)-1}/*'
        return rows
    request = Mock(side_effect=respond)
    monkeypatch.setattr('data._request', request)
    store = SupabaseStore('https://test.supabase.co','public-key','user-jwt')
    assert store.list('clientes') == records
    assert [call.kwargs['params']['offset'] for call in request.call_args_list] == expected_offsets


@pytest.mark.parametrize('header', ['', '0-0/*', 'malformed'])
def test_unknown_count_falls_back_without_dropping_records(monkeypatch, header):
    records = [{'id':'first'}, {'id':'second'}]
    def respond(method, url, headers, *, params, response_headers):
        response_headers['content-range'] = header
        return records[params['offset']:params['offset']+1]
    request = Mock(side_effect=respond)
    monkeypatch.setattr('data._request', request)
    assert SupabaseStore('https://test.supabase.co','public','jwt').list('clientes') == records
    assert request.call_count == 3


@pytest.fixture
def http_backend():
    class Handler(BaseHTTPRequestHandler):
        protocol_version = 'HTTP/1.1'

        def log_message(self, *args):
            pass

        def do_GET(self):
            body = json.dumps({'authorization':self.headers.get('Authorization'),
                'apikey':self.headers.get('apikey'), 'cookie':self.headers.get('Cookie'),
                'port':self.client_address[1]}).encode()
            self.send_response(200)
            self.send_header('Content-Type','application/json')
            self.send_header('Content-Length',str(len(body)))
            self.send_header('Content-Range','0-0/1')
            self.send_header('Set-Cookie','upstream_session=test-only; Path=/')
            self.end_headers()
            self.wfile.write(body)

        def do_POST(self):
            self.server.posts += 1
            self.rfile.read(int(self.headers.get('Content-Length', 0)))
            body = b'{"message":"simulated failure"}'
            self.send_response(503)
            self.send_header('Content-Length',str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    server = ThreadingHTTPServer(('127.0.0.1',0),Handler)
    server.posts = 0
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f'http://127.0.0.1:{server.server_port}', server
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=3)


def test_connections_reused_without_sharing_authorization_or_cookies(http_backend):
    url, _ = http_backend
    meta = {}
    first = _request('GET',url,{'Authorization':'Bearer user-a','apikey':'public-a'}, response_headers=meta)
    second = _request('GET',url,{'Authorization':'Bearer user-b','apikey':'public-b'})
    third = _request('GET',url,{})
    assert first['port'] == second['port'] == third['port']
    assert [first['authorization'],second['authorization'],third['authorization']] == ['Bearer user-a','Bearer user-b',None]
    assert [first['apikey'],second['apikey'],third['apikey']] == ['public-a','public-b',None]
    assert all(row['cookie'] is None for row in (first,second,third))
    assert meta['content-range'] == '0-0/1'


def test_new_worker_threads_reuse_existing_tcp_pool(http_backend):
    url, _ = http_backend
    responses = []
    for token in ('first-worker','second-worker'):
        with ThreadPoolExecutor(max_workers=1) as executor:
            responses.append(executor.submit(_request,'GET',url,{'Authorization':token}).result(timeout=5))
    assert responses[0]['port'] == responses[1]['port']
    assert [r['authorization'] for r in responses] == ['first-worker','second-worker']


def test_failed_write_is_not_retried(http_backend):
    url, server = http_backend
    with pytest.raises(DataError, match='simulated failure'):
        _request('POST',url,{'Authorization':'Bearer user-a'},json={'test':'record'})
    assert server.posts == 1
