# VilaPack · Gestão financeira em Python

Recriação do dashboard VilaPack em **Python e Flask**, com interface responsiva, temas claro e escuro, gráficos, filtros, busca, exportação CSV e formulários de cadastro. O servidor entrega HTML, CSS e JavaScript leve; não é necessário instalar Node.js.

Baseado no [repositório original](https://github.com/ojotal9/meu-dashboard), que utiliza React/JavaScript, no commit `21da0c1186d0ace04b2ab6478c5c240271e4577f`.

## Executar no Windows

Requer **Python 3.12 ou superior**. Esta entrega foi validada com Python 3.12.

Você pode abrir `iniciar-demo.bat` para experimentar ou `iniciar.bat` depois de configurar o Supabase. Na primeira execução, eles criam o ambiente virtual e instalam as dependências.

Para fazer a instalação manualmente, abra o PowerShell na pasta deste projeto e execute:

```powershell
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe app.py --demo
```

Acesse **[http://127.0.0.1:5000](http://127.0.0.1:5000)**. Para encerrar, pressione `Ctrl+C` no terminal.

Com o ambiente virtual já ativado, o comando equivalente é `python app.py --demo`.

A demonstração funciona sem login e sem configurar o Supabase. Usa uma base SQLite isolada em `instance/demo.sqlite3`, com seis meses de dados fictícios. Alterações feitas nela permanecem entre execuções. O cadastro inicial é feito apenas quando a base está vazia; nenhum dado real ou credencial acompanha o projeto.

## Conectar ao seu Supabase

O modo de produção mantém o **Supabase para login e dados compartilhados**, usando o projeto e os perfis de acesso existentes.

1. Exporte um backup do dashboard original e revise `supabase_migration.sql` antes de executá-lo no SQL Editor do seu projeto Supabase. A migração é aditiva: acrescenta vínculos entre contas/saídas e transações, compatibiliza campos e instala a função que grava operações relacionadas em uma transação. As políticas existentes de acesso por linha, chamadas RLS, são preservadas. Revise também as permissões do projeto com o administrador.
2. **Aplique essa migração antes de usar a nova versão com dados reais.** Ela não foi aplicada nesta entrega e o aplicativo não a executa automaticamente.
3. Na primeira configuração, copie `.env.example` para `.env` e preencha:

```dotenv
SUPABASE_URL=https://SEU-PROJETO.supabase.co
SUPABASE_ANON_KEY=SUA-CHAVE-PUBLICA
SUPABASE_SERVICE_ROLE_KEY=
SECRET_KEY=UM-VALOR-ALEATORIO-LONGO-E-PRIVADO
DEMO_MODE=0
HOST=127.0.0.1
PORT=5000
COOKIE_SECURE=0
```

Com sessões locais (padrão fora da Vercel), `SUPABASE_SERVICE_ROLE_KEY` é opcional e necessária para criar ou excluir logins pela administração. Com `SESSION_BACKEND=supabase`, inclusive na Vercel, ela é obrigatória também para o armazenamento privado das sessões. Ela fica no servidor. Operações financeiras usam o token do usuário autenticado e as permissões do Supabase.

Use uma `SECRET_KEY` privada e estável. Você pode gerar um valor com:

```powershell
.\.venv\Scripts\python.exe -c "import secrets; print(secrets.token_hex(32))"
```

Inicie o modo conectado **sem `--demo`**:

```powershell
.\.venv\Scripts\python.exe app.py
```

Entre com uma conta existente que tenha registro na tabela `perfis`. Sem configuração, a aplicação apresenta a tela de login com orientação de conexão; não libera acesso aos dados. Se tiver definido `DEMO_MODE=1` nas variáveis do terminal, remova essa definição antes de executar em produção.

Ao publicar por HTTPS, configure `COOKIE_SECURE=1` e o servidor/proxy responsável pelo HTTPS. Para acesso local por HTTP, mantenha `0`. Não publique `.env` nem a pasta `instance`, que contém a base demonstrativa e sessões locais do servidor.

## Publicar na Vercel

Consulte o passo a passo em **[VERCEL.md](VERCEL.md)**. O projeto inclui entrypoint Flask, dependências Python, configuração da Vercel e arquivos públicos. Para publicar, aplique também `supabase_sessions.sql` e configure as variáveis do servidor.

Na Vercel, as sessões são compartilhadas e criptografadas no Supabase; não dependem de SQLite ou de arquivos locais. O navegador recebe somente um identificador de sessão. O modo demo é desativado obrigatoriamente nesse ambiente.

## Funcionalidades e regras

Os **11 módulos** estão operacionais na demonstração local: Visão geral, Transações, Contas a receber, Contas a pagar, Saídas, Clientes, Resumo por cliente, Lucro por venda, Histórico mensal, Configurações e Equipe e acessos. A gestão de logins reais exige conexão ao Supabase.

- Contas parceladas geram um lançamento por parcela no mês do vencimento. Quitar ou reabrir altera o status, sem duplicar a transação. Centavos restantes ficam na última parcela; vencimentos respeitam o último dia de cada mês.
- Saídas operacionais também geram transações vinculadas. Para alterar uma transação automática, use seu registro de origem.
- Os totais preservam o reconhecimento das contas pelo vencimento, inclusive enquanto pendentes. Não representam exclusivamente dinheiro já recebido ou pago.
- Lucro por venda considera entradas com custo de matéria-prima informado: receita menos custo. Esse custo não cria outra saída. Metas específicas do mês têm prioridade sobre a meta geral.
- Administradores acessam todos os módulos; colaboradores seguem suas páginas permitidas e restrições de exclusão, verificadas no servidor.

## Backup e diferenças em relação ao original

O backup JSON inclui clientes, saídas, transações, contas e metas; não inclui logins ou senhas. A importação aceita backups **v1 e v2** e **acrescenta os registros à base atual**, preservando os existentes. O original substituía a base. **Não importe o mesmo arquivo novamente**, pois isso pode duplicar registros.

A atualização entre usuários utiliza recarregamento a cada aproximadamente **65 segundos de ociosidade**, com a aba visível e sem formulário aberto. Isso substitui o realtime do original. A indicação de atividade mostra usuários que acessaram **esta versão Python nos últimos 2 minutos**, com pulso a cada 45 segundos na aba visível. Ela não inclui sessões abertas somente na versão React.

## Verificação

Os testes cobrem cálculos, parcelas, vínculos, importação, rotas, CSRF, permissões, isolamento da demonstração e sessões compartilhadas entre instâncias. Para executar:

Resultado desta entrega: **98 testes e 30 subtestes passaram**. Também foram verificadas a instalação em ambiente limpo pelo `uv.lock`, a disponibilidade de dependências para Linux/Python 3.12, os campos de `vercel.json` e a sintaxe SQL/PL/pgSQL das migrações.

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe -m pytest tests -q
```

As migrações SQL receberam revisão estática; **não foram executadas contra um PostgreSQL/Supabase real**. A autenticação e a integração remota foram verificadas com respostas simuladas. A conexão final depende da configuração e das políticas do seu projeto Supabase. Nenhum deploy real foi realizado nesta entrega.
