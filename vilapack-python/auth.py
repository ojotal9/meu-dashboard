"""Supabase authentication with opaque, server-side sessions."""
import secrets
import time
from flask import g, session, request, redirect, url_for, render_template, abort
from data import LocalStore, SupabaseStore, SupabaseAuth, DataError
from session_store import build_session_store


def csrf_token():
    if 'csrf' not in session:
        session['csrf'] = secrets.token_urlsafe(32)
    return session['csrf']


def can_access(page):
    p = getattr(g, 'profile', None) or {}
    if page == 'usuarios':
        return p.get('role') == 'admin'
    return p.get('role') == 'admin' or page in (p.get('paginas_permitidas') or [])


def can_action(page, action='remover'):
    p = getattr(g, 'profile', None) or {}
    return can_access(page) and (p.get('role') == 'admin' or action not in (p.get('acoes_restritas') or {}).get(page, []))


def require_access(page, action=None):
    if not (can_action(page, action) if action else can_access(page)):
        abort(403)


def initialize_auth(app):
    vault = build_session_store(app.config)
    app.extensions['vilapack_sessions'] = vault

    def auth_client():
        return SupabaseAuth(app.config['SUPABASE_URL'], app.config['SUPABASE_ANON_KEY'],
                            app.config.get('SUPABASE_SERVICE_ROLE_KEY'))

    def clear_session():
        sid = session.get('sid')
        if sid:
            vault.delete(sid)
        session.clear()

    def online_users():
        if app.config['DEMO_MODE']:
            return {'demo'}
        return vault.online_users()

    def refresh_tokens(sid, tokens):
        owner = secrets.token_urlsafe(24)
        if not vault.claim_refresh(sid, owner):
            # A different instance is already renewing this session. The current
            # access token can still be used while valid; do not rotate twice.
            latest = vault.get(sid)
            if latest and latest.get('expires_at', 0) > time.time() + 5:
                return latest
            raise DataError('A sessão está sendo renovada. Atualize a página em instantes.')
        try:
            current = vault.get(sid)
            if not current:
                raise DataError('A sessão foi encerrada. Entre novamente.')
            if current.get('expires_at', 0) >= time.time() + 60:
                return current
            refreshed = auth_client().refresh(current['refresh_token'])
            refreshed.setdefault('expires_at', time.time() + refreshed.get('expires_in', 3600))
            refreshed.setdefault('user', current.get('user'))
            vault.replace_tokens(sid, refreshed, owner)
            return refreshed
        finally:
            vault.release_refresh(sid, owner)

    @app.before_request
    def prepare_request():
        g.profile = None
        g.store = None
        g.auth_error = None
        if request.method == 'POST':
            given = request.form.get('csrf_token', '')
            expected = session.get('csrf', '')
            if not expected or not secrets.compare_digest(given, expected):
                abort(400, 'A sessão do formulário expirou. Atualize a página e tente novamente.')
        if request.endpoint in ('static', 'login', 'health', 'logout'):
            return
        if app.config['DEMO_MODE']:
            g.store = LocalStore(app.config['DEMO_DB'])
            g.profile = {'id': 'demo', 'nome': 'Marina', 'email': 'demo@vilapack.local', 'role': 'admin'}
            return
        sid = session.get('sid')
        if not sid:
            return redirect(url_for('login'))
        try:
            tokens = vault.get(sid)
            if not tokens:
                clear_session()
                return redirect(url_for('login'))
            if tokens.get('expires_at', 0) < time.time() + 60:
                tokens = refresh_tokens(sid, tokens)
            g.store = SupabaseStore(app.config['SUPABASE_URL'], app.config['SUPABASE_ANON_KEY'], tokens['access_token'])
            user = tokens.get('user') or auth_client().user(tokens['access_token'])
            g.profile = g.store.get('perfis', user['id'])
            if not g.profile:
                abort(403, 'Seu login ainda não possui um perfil de acesso. Fale com o administrador.')
            vault.touch(sid, g.profile['id'])
        except DataError as exc:
            g.auth_error = str(exc)
            return render_template('login.html', error='Não foi possível validar sua sessão. Entre novamente.', configured=True), 503

    @app.route('/login', methods=['GET', 'POST'])
    def login():
        configured = bool(app.config['SUPABASE_URL'] and app.config['SUPABASE_ANON_KEY'])
        if app.config['DEMO_MODE']:
            return redirect(url_for('dashboard', page='inicio'))
        error = None
        if request.method == 'POST':
            if not configured:
                error = 'Configure SUPABASE_URL e SUPABASE_ANON_KEY no arquivo .env do servidor.'
            else:
                try:
                    tokens = auth_client().login(request.form.get('email', '').strip(), request.form.get('password', ''))
                    tokens.setdefault('expires_at', time.time() + tokens.get('expires_in', 3600))
                    clear_session()
                    sid = secrets.token_urlsafe(48)
                    vault.save(sid, tokens)
                    session['sid'] = sid
                    csrf_token()
                    return redirect(url_for('dashboard', page='inicio'))
                except DataError:
                    error = 'Não foi possível entrar. Confira seu e-mail, senha e a conexão com o Supabase.'
        return render_template('login.html', error=error, configured=configured)

    @app.post('/logout')
    def logout():
        if not app.config['DEMO_MODE']:
            sid = session.get('sid')
            try:
                tokens = vault.get(sid) if sid else None
                if tokens:
                    auth_client().logout(tokens['access_token'])
            except DataError:
                app.logger.warning('A revogação remota não foi confirmada durante o logout.')
            finally:
                try:
                    if sid:
                        vault.delete(sid)
                except DataError:
                    app.logger.warning('O armazenamento de sessões estava indisponível durante o logout.')
        session.clear()
        return redirect(url_for('login'))

    @app.get('/pulso')
    def heartbeat():
        return '',204

    app.jinja_env.globals.update(csrf_token=csrf_token, can_access=can_access, can_action=can_action,online_users=online_users)

    @app.teardown_request
    def close_store(error=None):
        store = getattr(g, 'store', None)
        if isinstance(store, LocalStore):
            store.close()
