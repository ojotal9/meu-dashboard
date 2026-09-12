# Atualização de desempenho

O painel carregava seis tabelas do Supabase em todas as páginas, inclusive Clientes, Configurações e Equipe. Cada tabela não vazia também exigia uma chamada adicional para detectar o fim da paginação. As requisições HTTP abriam novas sessões de conexão.

A atualização concentra as mudanças de execução em `app.py` e `data.py`:

- Páginas consultam somente as tabelas necessárias para o conteúdo exibido, os meses do filtro e as sugestões dos formulários.
- CSV consulta somente sua tabela de origem.
- A primeira página solicita `Prefer: count=exact` e usa `Content-Range` para encerrar a leitura ao obter todos os registros. Limites do servidor menores que 1.000 linhas continuam respeitados. Sem contagem, a paginação continua até a resposta vazia.
- Conexões TCP/TLS são reutilizadas, inclusive entre consultas realizadas por novas threads. Clientes HTTP são separados por thread, cabeçalhos de autenticação são fornecidos por chamada e cookies recebidos são descartados.
- Operações de gravação não recebem repetição automática em caso de erro de rede.

| Página | Tabelas financeiras consultadas antes | Depois |
| --- | ---: | ---: |
| Visão geral | 6 | 5 |
| Clientes | 6 | 1 |
| Configurações | 6 | 0 |
| Equipe e acessos | 6 | 0 |
| Transações | 6 | 2 |
| Contas a receber | 6 | 3 |
| Contas a pagar | 6 | 2 |
| Saídas | 6 | 2 |
| Resumo por cliente | 6 | 1 |
| Lucro por venda | 6 | 1 |
| Histórico mensal | 6 | 3 |

A tabela não inclui a validação da sessão e do perfil. Equipe mantém suas consultas específicas de perfis e atividade. Consultas em paralelo reduzem tempo de espera; o número de tabelas não representa uma redução proporcional garantida no tempo total.

## Verificação

Passaram **129 testes automatizados e 30 subtestes**. A atualização acrescenta verificações de igualdade do HTML das 11 páginas e do CSV das 9 exportações em relação ao carregamento completo anterior; paginação com contagem, sem contagem e com limites menores; reutilização real de conexão HTTP local; isolamento de cookies e cabeçalhos; e ausência de repetição automática de gravações.

No endereço `https://financeiro-vilapack.vercel.app`, as medições públicas anteriores à atualização foram:

| Rota | Tempo observado em três requisições |
| --- | --- |
| `/health` | 0,23–0,55 s |
| `/login` | 0,21–0,35 s |
| `/static/app.css` | aproximadamente 0,09 s |

São medidas pontuais deste computador. Não incluem a navegação autenticada, chamadas do banco dentro do painel ou uma comparação de desempenho antes/depois em produção. O ganho real deve ser medido após publicar um Preview da atualização.

A [documentação de Requests](https://requests.readthedocs.io/en/latest/user/advanced/#session-objects) descreve a reutilização de conexões. A [documentação do PostgREST](https://docs.postgrest.org/en/stable/references/api/pagination_count.html) explica os cabeçalhos de paginação. Contagens exatas podem custar mais em bases grandes; nesta atualização elas são solicitadas apenas na primeira página de cada leitura.

## Aplicar a atualização

1. Extraia `vilapack-atualizacao-desempenho.zip` em uma pasta nova.
2. No GitHub, crie uma branch a partir de `main`, por exemplo `melhoria-desempenho`.
3. Envie a pasta `vilapack-python` contida nesse ZIP para a raiz do repositório nessa branch. Ela contém os arquivos alterados e os testes; o upload atualiza esses caminhos e preserva os demais arquivos do projeto.
4. Aguarde o Preview da Vercel. Compare a navegação, os totais e um cadastro de teste com a versão atual.
5. Após validar, abra uma solicitação para juntar essa branch à `main` e publique a alteração.

Esta atualização não precisa de novos scripts SQL, chaves ou dependências. O ZIP completo `vilapack-python.zip` também contém a versão atualizada.

Se a lentidão continuar, o próximo diagnóstico é medir as chamadas autenticadas e conferir a proximidade entre a região da função Vercel e a região do Supabase, conforme a [orientação da Vercel](https://vercel.com/docs/functions/configuring-functions/region). A região não foi alterada por esta atualização.
