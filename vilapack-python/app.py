"""VilaPack — Python/Flask dashboard, Supabase in production."""
import csv
import io
import json
import os
import secrets
from pathlib import Path
from datetime import date
from decimal import Decimal
from flask import Flask, g, request, render_template, redirect, url_for, flash, abort, Response
from dotenv import load_dotenv
from data import DashboardService, LocalStore, SupabaseAuth, DataError, FINANCIAL_TABLES
from analytics import build_summary, seed_demo
from auth import initialize_auth, require_access, can_access, can_action

BASE = Path(__file__).resolve().parent
MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
CATEGORIES = ['Venda','Serviço','Matéria-prima','Frete','Salário','Aluguel','Imposto','Manutenção','Contas a Pagar','Contas a Receber','Outros']
PAYMENTS = [('pix','Pix'),('dinheiro','Dinheiro'),('cartao_credito','Cartão de crédito'),('cartao_debito','Cartão de débito')]
PAGES = {
    'inicio': ('Visão geral','Seu financeiro, de um jeito mais claro.','overview'),
    'transacoes': ('Transações','Entradas e saídas organizadas em um só lugar.','arrows'),
    'contas-receber': ('Contas a receber','Acompanhe vencimentos e confirme seus recebimentos.','receive'),
    'contas-pagar': ('Contas a pagar','Organize seus compromissos e pagamentos.','send'),
    'materia-prima': ('Saídas','Custos de produção e despesas da operação.','box'),
    'clientes': ('Clientes','Relacionamentos que fazem o seu negócio crescer.','users'),
    'resumo-cliente': ('Resumo por cliente','Entradas e saídas agrupadas por cliente ou lançamento.','chart'),
    'margem-produto': ('Lucro por venda','Receita menos o custo de matéria-prima informado.','pie'),
    'historico': ('Histórico mensal','A evolução dos resultados ao longo do tempo.','calendar'),
    'configuracoes': ('Configurações','Preferências e cópias dos seus dados.','settings'),
    'usuarios': ('Equipe e acessos','Gerencie usuários, páginas e permissões.','shield'),
}
TABLE_PAGE = {'clientes':'clientes','transacoes':'transacoes','materia_primas':'materia-prima','contas_receber':'contas-receber','contas_pagar':'contas-pagar','metas':'inicio','perfis':'usuarios'}
PAGE_TABLE = {v:k for k,v in TABLE_PAGE.items() if k != 'metas'}

# Only load the data actually rendered by each page, including month choices
# and client suggestions in forms. Authentication and RLS still run each time.
PAGE_DATA = {
    'inicio': ('transacoes','clientes','contas_receber','contas_pagar','metas'),
    'transacoes': ('transacoes','clientes'),
    'contas-receber': ('contas_receber','transacoes','clientes'),
    'contas-pagar': ('contas_pagar','transacoes'),
    'materia-prima': ('materia_primas','transacoes'),
    'clientes': ('clientes',),
    'resumo-cliente': ('transacoes',),
    'margem-produto': ('transacoes',),
    'historico': ('transacoes','contas_receber','contas_pagar'),
    'configuracoes': (),
    'usuarios': (),
}
EXPORT_DATA = {
    'inicio': ('transacoes',), 'transacoes': ('transacoes',), 'clientes': ('clientes',),
    'materia-prima': ('materia_primas',), 'contas-receber': ('contas_receber',),
    'contas-pagar': ('contas_pagar',), 'resumo-cliente': ('transacoes',),
    'margem-produto': ('transacoes',), 'historico': ('transacoes',),
}


def field(name, label, kind='text', required=False, options=None):
    return dict(name=name, label=label, kind=kind, required=required, options=options or [])


SCHEMAS = {
 'clientes': [field('nome','Nome do cliente',required=True),field('telefone','Telefone'),field('email','E-mail','email'),field('cpf','CPF / CNPJ'),field('representante','Representante')],
 'transacoes': [field('cliente','Cliente / descrição',required=True),field('tipo','Movimentação','select',True,[('entrada','Entrada'),('saida','Saída')]),field('valor','Valor (R$)','number',True),field('data','Mês de referência','month',True),field('categoria','Categoria','select',True,[(c,c) for c in CATEGORIES]),field('produto','Produto'),field('custo_materia_prima','Custo da matéria-prima (R$)','number')],
 'materia_primas': [field('tipo','Tipo de saída','select',True,[(c,c) for c in ['Produção','Matéria-prima','Fretes','Comercial','Administrativo','Manutenção']]),field('valor','Valor (R$)','number',True),field('data','Data','date',True),field('observacao','Observação','textarea')],
 'metas': [field('titulo','Nome da meta',required=True),field('valor','Meta de entradas (R$)','number',True),field('mes','Mês específico (opcional)','month')],
}
for table, person in [('contas_receber','cliente'),('contas_pagar','fornecedor')]:
    SCHEMAS[table] = [field('descricao','Descrição',required=True),field(person,person.title()),field('valor','Valor total (R$)','number',True),field('vencimento','Primeiro vencimento','date',True),field('forma_pagamento','Forma de pagamento','select',True,PAYMENTS),field('parcelas','Número de parcelas','integer')]

COLUMNS = {
 'clientes': [('nome','Cliente','text'),('telefone','Telefone','text'),('email','E-mail','text'),('cpf','CPF / CNPJ','text'),('representante','Representante','text')],
 'transacoes': [('cliente','Cliente / lançamento','text'),('categoria','Categoria','text'),('data','Referência','month'),('tipo','Tipo','badge'),('valor','Valor','money')],
 'materia_primas': [('tipo','Tipo','text'),('observacao','Observação','text'),('data','Data','date'),('valor','Valor','money')],
 'contas_receber': [('descricao','Descrição','text'),('cliente','Cliente','text'),('vencimento','Vencimento','date'),('parcela','Parcela','text'),('status_real','Status','badge'),('valor','Valor','money')],
 'contas_pagar': [('descricao','Descrição','text'),('fornecedor','Fornecedor','text'),('vencimento','Vencimento','date'),('parcela','Parcela','text'),('status_real','Status','badge'),('valor','Valor','money')],
 'resumo-cliente': [('nome','Cliente / lançamento','text'),('entrada','Entradas','money'),('saida','Saídas','money'),('saldo','Saldo','money')],
 'margem-produto': [('cliente','Cliente','text'),('produto','Produto','text'),('data','Referência','month'),('valor','Receita','money'),('custo_materia_prima','Custo','money'),('lucro','Lucro','money'),('margem','Margem','percent')],
 'historico': [('mes','Mês','month'),('entrada','Entradas','money'),('saida','Saídas','money'),('saldo','Saldo','money')],
 'perfis': [('nome','Nome','text'),('email','E-mail','text'),('role','Perfil','text'),('estado','Atividade','badge')],
}


def money(value):
    try:
        n = Decimal(str(value or 0))
        return 'R$ ' + f'{n:,.2f}'.replace(',','X').replace('.',',').replace('X','.')
    except Exception:
        return '—'


def month_label(value):
    try:
        y,m = value[:7].split('-')
        return f'{MONTHS[int(m)-1]} {y}'
    except (ValueError, TypeError, IndexError):
        return value or 'Todos os meses'


def date_label(value):
    try:
        return date.fromisoformat(value[:10]).strftime('%d/%m/%Y')
    except (ValueError, TypeError):
        return value or '—'


def create_app(config=None):
    load_dotenv(BASE / '.env')
    app = Flask(__name__, static_folder='public/static', static_url_path='/static')
    vercel = os.environ.get('VERCEL') == '1'
    instance = Path(os.environ.get('VILAPACK_INSTANCE', BASE / 'instance'))
    environment = os.environ.get('VERCEL_ENV','local')
    scope = os.environ.get('VERCEL_URL','preview') if environment == 'preview' else environment
    app.config.update(SECRET_KEY=os.environ.get('SECRET_KEY'), VERCEL_MODE=vercel,
        SESSION_BACKEND=os.environ.get('SESSION_BACKEND','supabase' if vercel else 'sqlite'),
        SESSION_NAMESPACE=os.environ.get('SESSION_NAMESPACE', f'vilapack:{scope}'),
        DEMO_MODE=os.environ.get('DEMO_MODE','0') == '1',
        DEMO_DB=str(instance/'demo.sqlite3'), AUTH_DB=str(instance/'sessions.sqlite3'),
        SUPABASE_URL=os.environ.get('SUPABASE_URL',os.environ.get('VITE_SUPABASE_URL','')),
        SUPABASE_ANON_KEY=os.environ.get('SUPABASE_ANON_KEY',os.environ.get('VITE_SUPABASE_ANON_KEY','')),
        SUPABASE_SERVICE_ROLE_KEY=os.environ.get('SUPABASE_SERVICE_ROLE_KEY',''),
        SESSION_COOKIE_HTTPONLY=True, SESSION_COOKIE_SAMESITE='Lax',
        SESSION_COOKIE_NAME='__Host-vilapack' if vercel else 'session',
        SESSION_COOKIE_SECURE=vercel or os.environ.get('COOKIE_SECURE','0') == '1',
        MAX_CONTENT_LENGTH=4*1024*1024 if vercel else 10*1024*1024)
    if config:
        app.config.update(config)
    if app.config['SESSION_BACKEND'] not in ('sqlite','supabase'):
        raise ValueError('SESSION_BACKEND deve ser sqlite ou supabase.')
    if app.config['VERCEL_MODE']:
        if app.config['DEMO_MODE'] or app.config['SESSION_BACKEND'] != 'supabase':
            raise ValueError('Na Vercel use DEMO_MODE=0 e SESSION_BACKEND=supabase.')
        if not app.config['SUPABASE_URL'] or not app.config['SUPABASE_ANON_KEY']:
            raise ValueError('Configure SUPABASE_URL e SUPABASE_ANON_KEY na Vercel.')
        app.config.update(SESSION_COOKIE_SECURE=True, SESSION_COOKIE_NAME='__Host-vilapack', SESSION_COOKIE_DOMAIN=None)
    if app.config['SESSION_BACKEND']=='supabase':
        if not app.config['SECRET_KEY'] or len(app.config['SECRET_KEY'])<32:
            raise ValueError('Configure SECRET_KEY com pelo menos 32 caracteres para as sessões compartilhadas.')
    elif not app.config['SECRET_KEY']:
        instance.mkdir(parents=True, exist_ok=True)
        secret_file = instance / '.session-key'
        if not secret_file.exists():
            secret_file.write_text(secrets.token_hex(32), encoding='utf-8')
        app.config['SECRET_KEY'] = secret_file.read_text(encoding='utf-8')
    if app.config['DEMO_MODE']:
        demo_store=LocalStore(app.config['DEMO_DB'])
        try:
            seed_demo(demo_store)
        finally:
            demo_store.close()
    initialize_auth(app)
    app.jinja_env.filters.update(money=money, month=month_label, datebr=date_label)
    app.jinja_env.globals.update(pages=PAGES, schemas=SCHEMAS, table_page=TABLE_PAGE, payments=dict(PAYMENTS))

    @app.context_processor
    def context():
        return dict(demo=app.config['DEMO_MODE'], today=date.today().isoformat(), profile=getattr(g,'profile',None) or {},
                    admin_ready=bool(app.config['SUPABASE_SERVICE_ROLE_KEY']), page=request.view_args.get('page','inicio') if request.view_args else 'inicio')

    @app.after_request
    def headers(response):
        response.headers['X-Content-Type-Options']='nosniff'
        response.headers['X-Frame-Options']='SAMEORIGIN'
        response.headers['Referrer-Policy']='same-origin'
        if request.endpoint != 'static':
            response.headers['Cache-Control']='no-store'
        return response

    def load_data(tables):
        data={table:[] for table in FINANCIAL_TABLES}
        store=g.store
        if isinstance(store,LocalStore) or len(tables)<=1:
            data.update({t:store.list(t) for t in tables})
        else:
            from concurrent.futures import ThreadPoolExecutor
            with ThreadPoolExecutor(max_workers=len(tables)) as pool:
                data.update(zip(tables,pool.map(store.list,tables)))
        return data

    @app.get('/health')
    def health():
        return {'status':'ok'}

    @app.get('/')
    def index():
        return redirect(url_for('dashboard',page='inicio'))

    @app.get('/painel/<page>')
    def dashboard(page):
        if page not in PAGES:
            abort(404)
        if page == 'inicio' and not can_access(page):
            first = next((p for p in PAGES if can_access(p)),None)
            if first:
                return redirect(url_for('dashboard',page=first))
        require_access(page)
        month=request.args.get('mes',date.today().strftime('%Y-%m'))
        if month != 'todos':
            try:
                date.fromisoformat(month+'-01')
            except ValueError:
                month=date.today().strftime('%Y-%m')
        data=load_data(PAGE_DATA[page])
        summary=build_summary(data,month)
        table=PAGE_TABLE.get(page)
        rows=[]
        if table == 'perfis':
            rows=g.store.list('perfis') if not app.config['DEMO_MODE'] else [g.profile]
            online=app.jinja_env.globals['online_users']()
            for row in rows:
                row['estado']='online' if row['id'] in online else 'offline'
        elif table in ('contas_receber','contas_pagar'):
            rows=summary['receivables' if table=='contas_receber' else 'payables']
        elif table:
            rows=data[table]
            if table != 'clientes' and month != 'todos':
                rows=[r for r in rows if str(r.get('data','')).startswith(month)]
        elif page in ('resumo-cliente','margem-produto','historico'):
            rows=summary[{'resumo-cliente':'customers','margem-produto':'sales','historico':'history'}[page]]
            if page=='historico' and month!='todos':
                rows=[r for r in rows if r['mes']==month]
        for r in rows:
            if 'parcelas' in r:
                r['parcela']=f"{r.get('parcela_atual',1)}/{r.get('parcelas',1)}"
        query=request.args.get('q','').strip()
        if query:
            rows=[r for r in rows if query.casefold() in ' '.join(str(v) for v in r.values()).casefold()]
        status=request.args.get('status','')
        if status:
            rows=[r for r in rows if r.get('status_real',r.get('tipo'))==status]
        cols=COLUMNS.get(table or page,[])
        sort=request.args.get('sort','')
        direction=request.args.get('dir','asc')
        if sort in {c[0] for c in cols}:
            rows=sorted(rows,key=lambda r:(r.get(sort) is None,r.get(sort) if isinstance(r.get(sort),(float,int)) else str(r.get(sort,'')).casefold()),reverse=direction=='desc')
        months=sorted({date.today().strftime('%Y-%m')} | {str(t['data'])[:7] for t in data['transacoes'] if t.get('data')},reverse=True)
        chart=summary['history'][-6:]
        max_chart=max([max(r['entrada'],r['saida']) for r in chart]+[1])*1.15
        products={}
        for sale in summary['sales']:
            name=sale.get('produto') or 'Sem produto'
            item=products.setdefault(name,{'nome':name,'receita':Decimal(0),'custo':Decimal(0)})
            item['receita']+=Decimal(str(sale['valor']))
            item['custo']+=Decimal(str(sale['custo_materia_prima']))
        products=sorted(products.values(),key=lambda p:p['receita'],reverse=True)[:8]
        product_max=max([max(p['receita'],p['custo']) for p in products]+[1])
        account_chart=[{'mes':r['mes'],'entrada':r['receber'],'saida':r['pagar']} for r in summary['accounts_history'][-6:]]
        account_max=max([max(r['entrada'],r['saida']) for r in account_chart]+[1])*1.15
        all_rows=rows
        number=max(1,request.args.get('pagina',1,type=int))
        rows=rows[(number-1)*20:number*20]
        return render_template('dashboard.html', title=PAGES[page][0],subtitle=PAGES[page][1],data=data,s=summary,
            month=month,months=months,table=table,rows=rows,columns=cols,query=query,status=status,sort=sort,direction=direction,
            chart=chart,max_chart=max_chart,products=products,product_max=product_max,account_chart=account_chart,account_max=account_max,
            row_count=len(all_rows),page_number=number,page_count=max(1,(len(all_rows)+19)//20))

    def return_page(table):
        return redirect(url_for('dashboard',page=TABLE_PAGE[table],mes=request.form.get('mes_filtro','todos')))

    @app.post('/salvar/<table>')
    def save(table):
        if table not in SCHEMAS:
            abort(404)
        require_access(TABLE_PAGE[table])
        payload={f['name']:request.form.get(f['name'],'').strip() for f in SCHEMAS[table]}
        if table.startswith('contas_'):
            payload['parcelas']=payload.get('parcelas') or '1'
        if table=='transacoes':
            payload['custo_materia_prima']=payload['custo_materia_prima'] or '0'
        try:
            DashboardService(g.store).save(table,payload,request.form.get('id') or None)
            flash('Registro salvo com sucesso.','success')
        except DataError as exc:
            flash(str(exc),'error')
        return return_page(table)

    @app.post('/remover/<table>/<id>')
    def delete(table,id):
        if table not in SCHEMAS:
            abort(404)
        require_access(TABLE_PAGE[table],'remover')
        try:
            DashboardService(g.store).remove(table,id)
            flash('Registro removido.','success')
        except DataError as exc:
            flash(str(exc),'error')
        return return_page(table)

    @app.post('/quitar/<table>/<id>')
    def settle(table,id):
        if table not in ('contas_receber','contas_pagar'):
            abort(404)
        require_access(TABLE_PAGE[table])
        try:
            DashboardService(g.store).settle(table,id,reopen=request.form.get('reopen')=='1')
            flash('Status atualizado.','success')
        except DataError as exc:
            flash(str(exc),'error')
        return return_page(table)

    @app.get('/backup')
    def backup():
        require_access('configuracoes')
        if g.profile.get('role')!='admin':
            abort(403)
        payload=DashboardService(g.store).export_backup()
        return Response(json.dumps(payload,ensure_ascii=False,indent=2),mimetype='application/json',headers={'Content-Disposition':f'attachment; filename=vilapack-backup-{date.today()}.json'})

    @app.post('/importar')
    def import_backup():
        require_access('configuracoes')
        if g.profile.get('role')!='admin':
            abort(403)
        try:
            upload=request.files.get('arquivo')
            if not upload:
                raise DataError('Selecione um arquivo JSON de backup.')
            result=DashboardService(g.store).import_backup(json.load(upload))
            flash('Backup importado. Os registros existentes foram preservados.','success')
        except (DataError,ValueError,UnicodeError) as exc:
            flash(str(exc) if isinstance(exc,DataError) else 'Arquivo JSON inválido. Nenhum dado foi importado.','error')
        return redirect(url_for('dashboard',page='configuracoes'))

    @app.get('/exportar/<page>')
    def export_csv(page):
        if page not in ('inicio','transacoes','clientes','materia-prima','contas-receber','contas-pagar','resumo-cliente','margem-produto','historico'):
            abort(404)
        require_access(page)
        if page=='inicio':
            require_access('transacoes')
        data=load_data(EXPORT_DATA[page])
        month=request.args.get('mes','todos')
        if month!='todos':
            try:
                date.fromisoformat(month+'-01')
            except ValueError:
                abort(400)
        s=build_summary(data,month)
        table=PAGE_TABLE.get(page)
        cols=COLUMNS.get(table or page,COLUMNS['transacoes'])
        rows=data.get(table,[]) if table else s.get({'historico':'history','margem-produto':'sales','resumo-cliente':'customers'}.get(page,''),data['transacoes'])
        if table in ('contas_receber','contas_pagar'):
            rows=s['receivables' if table=='contas_receber' else 'payables']
            for row in rows:
                row['parcela']=f"{row.get('parcela_atual',1)}/{row.get('parcelas',1)}"
        if month!='todos':
            rows=[r for r in rows if not any(k in r for k in ('data','vencimento','mes')) or str(r.get('data',r.get('vencimento',r.get('mes','')))).startswith(month)]
        buf=io.StringIO(newline='')
        writer=csv.writer(buf,delimiter=';')
        writer.writerow([c[1] for c in cols])
        for row in rows:
            values=[]
            for key,label,kind in cols:
                v=row.get(key,'')
                if isinstance(v,str) and v.startswith(('=','+','-','@')):
                    v="'"+v
                values.append(v)
            writer.writerow(values)
        return Response('\ufeff'+buf.getvalue(),mimetype='text/csv; charset=utf-8',headers={'Content-Disposition':f'attachment; filename=vilapack-{page}.csv'})

    @app.post('/usuarios/salvar')
    def save_user():
        require_access('usuarios')
        if app.config['DEMO_MODE']:
            flash('A gestão de logins fica disponível ao conectar o Supabase.','info')
            return redirect(url_for('dashboard',page='usuarios'))
        uid=request.form.get('id')
        payload={k:request.form.get(k,'').strip() for k in ('nome','email','role')}
        payload['paginas_permitidas']=[p for p in request.form.getlist('paginas') if p in PAGES and p!='usuarios']
        payload['acoes_restritas']={p:['remover'] for p in request.form.getlist('sem_remover') if p in PAGES}
        try:
            if not payload['nome'] or payload['role'] not in ('admin','funcionario'):
                raise DataError('Preencha nome e perfil válidos.')
            if uid:
                if uid==g.profile['id'] and payload['role']!='admin':
                    raise DataError('Você não pode remover seu próprio acesso de administrador.')
                payload.pop('email')
                g.store.update('perfis',uid,payload)
            else:
                if not app.config['SUPABASE_SERVICE_ROLE_KEY']:
                    raise DataError('Configure SUPABASE_SERVICE_ROLE_KEY no servidor para criar logins.')
                auth=SupabaseAuth(app.config['SUPABASE_URL'],app.config['SUPABASE_ANON_KEY'],app.config['SUPABASE_SERVICE_ROLE_KEY'])
                user=auth.create_user(dict(payload,senha=request.form.get('password','')))
                uid=user.get('id') or user.get('user',{}).get('id')
                try:
                    g.store.insert('perfis',dict(payload,id=uid))
                except DataError:
                    auth.delete_user(uid)
                    raise
            flash('Acesso atualizado.','success')
        except DataError as exc:
            flash(str(exc),'error')
        return redirect(url_for('dashboard',page='usuarios'))

    @app.post('/usuarios/remover/<id>')
    def remove_user(id):
        require_access('usuarios')
        try:
            if id==g.profile['id'] or app.config['DEMO_MODE']:
                raise DataError('Não é possível remover este usuário.')
            SupabaseAuth(app.config['SUPABASE_URL'],app.config['SUPABASE_ANON_KEY'],app.config['SUPABASE_SERVICE_ROLE_KEY']).delete_user(id)
            flash('Login removido.','success')
        except DataError as exc:
            flash(str(exc),'error')
        return redirect(url_for('dashboard',page='usuarios'))

    @app.errorhandler(DataError)
    def data_error(exc):
        return render_template('error.html',code=503,message=str(exc)),503

    @app.errorhandler(400)
    @app.errorhandler(403)
    @app.errorhandler(404)
    @app.errorhandler(413)
    def http_error(exc):
        size_mb = app.config['MAX_CONTENT_LENGTH']//(1024*1024)
        messages={400:'O formulário não pôde ser validado. Atualize a página e tente novamente.',403:'Seu perfil não tem permissão para esta ação.',404:'Esta página não foi encontrada.',413:f'O arquivo deve ter no máximo {size_mb} MB.'}
        return render_template('error.html',code=exc.code,message=messages[exc.code]),exc.code

    return app


if __name__=='__main__':
    import argparse
    parser=argparse.ArgumentParser(description='VilaPack · Gestão financeira')
    parser.add_argument('--demo',action='store_true',help='Abrir demonstração local isolada, com dados fictícios')
    args=parser.parse_args()
    if args.demo:
        os.environ['DEMO_MODE']='1'
    from waitress import serve
    app=create_app()
    host=os.environ.get('HOST','127.0.0.1')
    port=int(os.environ.get('PORT','5000'))
    print(f'VilaPack disponível em http://{host}:{port}',flush=True)
    serve(app,host=host,port=port)
