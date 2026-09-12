"""Opaque web sessions: local SQLite or shared, encrypted Supabase storage.

The privileged key is used only for this private token vault. Financial queries
continue to use SupabaseStore and the authenticated user's bearer token.
"""
import base64
import hashlib
import json
import sqlite3
import time
from contextlib import contextmanager, closing
from datetime import datetime, timezone
from pathlib import Path

from data import DataError, _request, _privileged_key

LIFETIME = 7 * 86400


class SQLiteSessionStore:
    def __init__(self, path):
        self.path = path

    @contextmanager
    def connection(self):
        Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        with closing(sqlite3.connect(self.path, timeout=10)) as con:
            with con:
                con.execute('CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, payload TEXT, expires REAL)')
                con.execute('CREATE TABLE IF NOT EXISTS activity (user_id TEXT PRIMARY KEY, seen REAL)')
                con.execute('CREATE TABLE IF NOT EXISTS refresh_locks (id TEXT PRIMARY KEY, owner TEXT, expires REAL)')
                yield con

    def get(self, sid):
        with self.connection() as con:
            row = con.execute('SELECT payload FROM sessions WHERE id=? AND expires>?', (sid, time.time())).fetchone()
        return json.loads(row[0]) if row else None

    def save(self, sid, tokens):
        with self.connection() as con:
            con.execute('DELETE FROM sessions WHERE expires<?', (time.time(),))
            con.execute('DELETE FROM refresh_locks WHERE expires<?', (time.time(),))
            con.execute('INSERT OR REPLACE INTO sessions VALUES (?,?,?)', (sid, json.dumps(tokens), time.time() + LIFETIME))

    def delete(self, sid):
        with self.connection() as con:
            row = con.execute('SELECT payload FROM sessions WHERE id=?', (sid,)).fetchone()
            con.execute('DELETE FROM sessions WHERE id=?', (sid,))
            con.execute('DELETE FROM refresh_locks WHERE id=?', (sid,))
            if row:
                uid = json.loads(row[0]).get('user', {}).get('id')
                con.execute('DELETE FROM activity WHERE user_id=?', (uid,))

    def touch(self, sid, user_id):
        with self.connection() as con:
            con.execute('INSERT OR REPLACE INTO activity VALUES (?,?)', (user_id, time.time()))

    def online_users(self):
        with self.connection() as con:
            return {r[0] for r in con.execute('SELECT user_id FROM activity WHERE seen>?', (time.time() - 120,))}

    def claim_refresh(self, sid, owner):
        with self.connection() as con:
            result = con.execute('INSERT INTO refresh_locks VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET owner=excluded.owner,expires=excluded.expires WHERE refresh_locks.expires<?',
                                 (sid, owner, time.time() + 60, time.time()))
            return result.rowcount == 1

    def replace_tokens(self, sid, tokens, owner):
        with self.connection() as con:
            result = con.execute('UPDATE sessions SET payload=? WHERE id=? AND expires>? AND EXISTS (SELECT 1 FROM refresh_locks WHERE id=? AND owner=?)',
                                 (json.dumps(tokens), sid, time.time(), sid, owner))
            if result.rowcount != 1:
                raise DataError('A sessão foi encerrada. Entre novamente.')

    def release_refresh(self, sid, owner):
        with self.connection() as con:
            con.execute('DELETE FROM refresh_locks WHERE id=? AND owner=?', (sid, owner))


def _iso(timestamp):
    return datetime.fromtimestamp(timestamp, timezone.utc).isoformat()


class SupabaseSessionStore:
    def __init__(self, url, service_key, secret_key, namespace):
        if not url or not service_key or not _privileged_key(service_key):
            raise ValueError('Sessões compartilhadas exigem SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY válidas no servidor.')
        if not secret_key or len(secret_key) < 32:
            raise ValueError('Configure uma SECRET_KEY estável com pelo menos 32 caracteres.')
        from cryptography.fernet import Fernet
        self.fernet = Fernet(base64.urlsafe_b64encode(hashlib.sha256(b'vilapack-session-v1\0' + secret_key.encode()).digest()))
        self.url = url.rstrip('/')
        self.namespace = namespace
        self.headers = {'apikey': service_key, 'Content-Type': 'application/json'}
        if not service_key.startswith('sb_secret_'):
            self.headers['Authorization'] = f'Bearer {service_key}'

    def _call(self, method, path='vila_web_sessions', **kwargs):
        try:
            return _request(method, f'{self.url}/rest/v1/{path}', self.headers, **kwargs)
        except DataError:
            # Never expose raw responses from a privileged endpoint to the UI.
            raise DataError('Não foi possível acessar as sessões compartilhadas. Confira as variáveis do servidor e aplique supabase_sessions.sql.') from None

    def _filter(self, sid):
        return {'namespace': f'eq.{self.namespace}', 'session_hash': f'eq.{hashlib.sha256(sid.encode()).hexdigest()}'}

    def _encode(self, tokens):
        return self.fernet.encrypt(json.dumps(tokens, separators=(',', ':')).encode()).decode()

    def get(self, sid):
        from cryptography.fernet import InvalidToken
        rows = self._call('GET', params={**self._filter(sid), 'select': 'payload', 'expires_at': f'gt.{_iso(time.time())}', 'limit': 1})
        if not rows:
            return None
        try:
            return json.loads(self.fernet.decrypt(rows[0]['payload'].encode()))
        except (InvalidToken, ValueError, KeyError):
            raise DataError('A sessão não pôde ser validada. Entre novamente.') from None

    def save(self, sid, tokens):
        # Logins always get a fresh random sid. Do not upsert revoked sessions.
        self._call('DELETE', params={'namespace': f'eq.{self.namespace}', 'expires_at': f'lt.{_iso(time.time())}'})
        self._call('POST', json={
            'namespace': self.namespace, 'session_hash': hashlib.sha256(sid.encode()).hexdigest(),
            'payload': self._encode(tokens), 'user_id': tokens['user']['id'],
            'expires_at': _iso(time.time() + LIFETIME), 'last_seen': _iso(time.time()),
        })

    def delete(self, sid):
        self._call('DELETE', params=self._filter(sid))

    def touch(self, sid, user_id):
        self._call('PATCH', params={**self._filter(sid), 'user_id': f'eq.{user_id}', 'expires_at': f'gt.{_iso(time.time())}'},
                   json={'last_seen': _iso(time.time())})

    def online_users(self):
        rows = self._call('GET', params={'namespace': f'eq.{self.namespace}', 'select': 'user_id',
            'last_seen': f'gt.{_iso(time.time() - 120)}', 'expires_at': f'gt.{_iso(time.time())}', 'limit': 1000})
        return {r['user_id'] for r in rows}

    def claim_refresh(self, sid, owner):
        return self._call('POST', 'rpc/vila_session_claim_refresh', json={
            'p_namespace': self.namespace, 'p_session_hash': hashlib.sha256(sid.encode()).hexdigest(), 'p_owner': owner,
        }) is True

    def replace_tokens(self, sid, tokens, owner):
        result = self._call('POST', 'rpc/vila_session_finish_refresh', json={
            'p_namespace': self.namespace, 'p_session_hash': hashlib.sha256(sid.encode()).hexdigest(),
            'p_owner': owner, 'p_payload': self._encode(tokens),
        })
        if result is not True:
            raise DataError('A sessão foi encerrada. Entre novamente.')

    def release_refresh(self, sid, owner):
        self._call('PATCH', params={**self._filter(sid), 'refresh_owner': f'eq.{owner}'}, json={'refresh_owner': None, 'refresh_until': None})


def build_session_store(config):
    if config['SESSION_BACKEND'] == 'supabase':
        return SupabaseSessionStore(config['SUPABASE_URL'], config['SUPABASE_SERVICE_ROLE_KEY'], config['SECRET_KEY'], config['SESSION_NAMESPACE'])
    return SQLiteSessionStore(config['AUTH_DB'])
