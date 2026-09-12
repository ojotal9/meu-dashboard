# Publicar o VilaPack Python na Vercel

Este projeto está adaptado para Python 3.12 e Flask na Vercel. O Supabase existente continua responsável pelo login e pelos dados. O domínio pode permanecer vinculado ao seu projeto atual.

**A adaptação foi feita nos arquivos locais. Nenhum deploy, variável da Vercel ou alteração no seu banco foi realizado nesta entrega.**

## 1. Preparar o Supabase

Faça um backup dos dados atuais. No SQL Editor do seu projeto Supabase, revise e execute nesta ordem:

1. `supabase_migration.sql`: prepara os campos e a função das operações financeiras. Se já aplicou este arquivo na entrega anterior, não precisa reaplicá-lo.
2. `supabase_sessions.sql`: cria a tabela privada de sessões e as funções de renovação do login. É necessário para a Vercel, mesmo se a primeira migração já foi aplicada.

Os arquivos não são executados automaticamente. A segunda migração não altera as tabelas financeiras. As políticas existentes de acesso aos dados permanecem válidas; o usuário de teste deve ter um registro na tabela `perfis` e as permissões correspondentes.

## 2. Colocar o código no repositório

Extraia o ZIP e adicione a pasta `vilapack-python` ao seu repositório `meu-dashboard`. Ela contém o aplicativo completo. Mantenha os arquivos ocultos, incluindo `.python-version` e `.vercelignore`. Não envie `.env`, `instance` ou ambientes virtuais.

Para revisar a mudança antes de trocar o site ativo, envie essa pasta inicialmente em uma branch de trabalho, por exemplo `dashboard-python`. O código React existente pode permanecer na raiz do repositório.

## 3. Configurar a Vercel

No projeto vinculado ao repositório, em **Settings → Build and Deployment**, use:

| Campo | Valor |
| --- | --- |
| Root Directory | `vilapack-python` se você adicionou a pasta na raiz do repositório |
| Framework Preset | `Flask` |
| Build Command | Padrão do framework; desative o override antigo |
| Install Command | Padrão do framework; desative o override antigo |
| Output Directory | Padrão do framework; desative o override antigo |

Se você colocar os arquivos Python diretamente na raiz de um repositório separado, Root Directory será a raiz. Não mantenha `npm run build` ou `dist` da configuração React. Não coloque `python app.py` no Build Command: ele inicia um servidor local, e a Vercel importa `index:app` diretamente.

O `pyproject.toml` declara o entrypoint e todas as dependências; `uv.lock` fixa as versões resolvidas e `.python-version` seleciona Python 3.12. CSS, JavaScript e imagens estão em `public/static`, publicados em `/static/...` pelo CDN da Vercel. Essa estrutura segue a [documentação oficial de Flask](https://vercel.com/docs/frameworks/backend/flask) e do [runtime Python](https://vercel.com/docs/functions/runtimes/python).

As configurações de build do projeto também afetam os próximos deploys. Evite disparar um deploy de produção da branch antiga enquanto testa a pasta nova. Para testar com total independência das configurações atuais, use temporariamente outro projeto Vercel conectado à mesma branch; depois aplique as configurações verificadas ao projeto que possui seu domínio.

## 4. Cadastrar as variáveis

Em **Settings → Environment Variables**, configure os ambientes em que vai publicar (Preview e Production):

| Variável | Valor |
| --- | --- |
| `SUPABASE_URL` | URL do seu projeto Supabase |
| `SUPABASE_ANON_KEY` | Chave pública `anon` legada ou `sb_publishable_...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave privada `service_role` legada ou `sb_secret_...` |
| `SECRET_KEY` | Valor aleatório privado, estável, com pelo menos 32 caracteres |
| `DEMO_MODE` | `0` |
| `SESSION_BACKEND` | `supabase` |

A chave privada é necessária para armazenar as sessões e administrar logins. As operações financeiras continuam usando o token do usuário autenticado, respeitando as políticas do Supabase. Não crie versões dessas chaves privadas com prefixo `VITE_` ou `NEXT_PUBLIC_`. Cadastre-as como variáveis do servidor; não coloque os valores no GitHub.

Gere a `SECRET_KEY` no seu computador e copie o resultado diretamente para a Vercel:

```powershell
python -c "import secrets; print(secrets.token_hex(32))"
```

Mantenha o mesmo valor nos redeploys do mesmo ambiente. Trocar essa chave encerra as sessões anteriores. Você pode usar valores diferentes em Preview e Production. `VERCEL`, `VERCEL_ENV` e `VERCEL_URL` são fornecidas pela plataforma; não cadastre manualmente. Cookies seguros são ativados automaticamente.

`SESSION_NAMESPACE` é opcional: por padrão, produção usa `vilapack:production` e cada preview fica separado pelo endereço do deployment. Para vários projetos de produção no mesmo Supabase, defina um namespace diferente para cada projeto. **Essa separação vale para o login; previews que usam o mesmo Supabase acessam os mesmos dados financeiros**, conforme as permissões do usuário.

## 5. Validar e publicar

Crie um deployment da branch com a pasta Python, inicialmente em Preview. Após alterar variáveis, faça um novo deployment para carregá-las. Verifique:

1. `/health` responde com sucesso. Essa rota confirma a inicialização; não testa a conexão com o banco.
2. A página de login carrega com logo, CSS e imagens.
3. Um usuário existente consegue entrar e acessar os módulos permitidos.
4. Totais, clientes e contas correspondem ao dashboard atual. Para testar gravações, use registros de teste identificados e depois remova-os pela aplicação.
5. Sair encerra o acesso; um colaborador continua sujeito às restrições de páginas e ações.

Depois da validação, publique a branch contendo a pasta Python no ambiente Production do projeto atual. O domínio permanece nesse projeto. Guarde a referência do deployment React anterior para poder usar o rollback da Vercel caso necessário. Um rollback de código não reverte alterações feitas nos dados.

## Como as sessões funcionam

O navegador recebe apenas um identificador aleatório e o token de proteção dos formulários. Os tokens de acesso e renovação são criptografados no servidor antes de serem enviados à tabela `vila_web_sessions`. A chave de criptografia deriva da `SECRET_KEY`, que fica na Vercel. A tabela armazena o hash do identificador da sessão.

Todas as instâncias consultam essa tabela compartilhada. Uma trava no banco evita que duas instâncias renovem o mesmo token ao mesmo tempo. O logout remove a sessão; uma renovação em andamento não pode recriá-la. A duração máxima no servidor é de sete dias, com limpeza das sessões expiradas nos próximos logins do mesmo namespace. Cookies também podem ser removidos pelo navegador ao encerrar a sessão de navegação.

Nenhum arquivo local é necessário para sessões ou dados no modo Vercel. SQLite permanece disponível para demonstração e desenvolvimento local.

## Limites e diagnóstico

- O aplicativo limita requisições a 4 MiB na Vercel, incluindo o formulário e anexos. Para backups maiores, use uma exportação direta do Supabase. Downloads também estão sujeitos aos limites da plataforma.
- A função está configurada para até 60 segundos. Importações grandes e bancos volumosos devem ser avaliados no preview; a validação local não mede latência nem capacidade em produção.
- Se o deploy não inicia, confira Root Directory, preset Flask, variáveis obrigatórias e Build Logs. O aplicativo recusa modo demo, sessões SQLite e chaves ausentes na Vercel.
- Se a tela de login abre, mas a entrada falha, confirme as credenciais e a execução de `supabase_sessions.sql`. A chave privada precisa pertencer ao mesmo projeto da URL e da chave pública.
- Se o login funciona, mas páginas ou gravações falham, confira `perfis`, as políticas RLS existentes e `supabase_migration.sql`.
- Se aparecer um site sem estilos, confirme que `public/static` foi incluído e remova antigos rewrites para `index.html` do projeto React.

Os testes locais simulam o Supabase e múltiplas instâncias. As migrações receberam revisão e validação de sintaxe; **não foram executadas no seu banco**. O deployment real e as permissões do Supabase ainda precisam ser confirmados no ambiente configurado.
