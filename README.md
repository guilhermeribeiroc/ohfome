# OhFome

Plataforma multi-tenant de gestão para redes de estabelecimentos de comida
(churrascarias, pizzarias, hamburguerias, japonesa, padarias/cafeterias e
outros). Cada estabelecimento se cadastra, escolhe os módulos que quer usar e
opera com dados 100% isolados dos demais.

## Módulos

Um estabelecimento escolhe, no cadastro, quais destes módulos quer ativar
(pode ser só um, todos, ou qualquer combinação):

| Módulo | Tela | O que faz |
|---|---|---|
| **Balcão** | `/pedidos` | Kanban com todos os pedidos do estabelecimento (novo → em preparo → pronto → saiu para entrega → finalizado). Cria pedidos de balcão. |
| **Cozinha** | `/cozinha` | Mesma base de pedidos, mas só até "pronto" — tela focada em preparo. |
| **Garçom** | `/mesas` | Interface mobile-first: abrir mesa, lançar itens do cardápio, enviar pra cozinha. Inclui gestão de mesas (criar/editar/excluir). |
| **Estoque & Preços** | `/estoque` | Cadastro de produtos com calculadora de precificação bidirecional (custo+margem → preço, ou preço → margem), cadastro de insumos com controle de saldo, entrada de estoque, e ficha técnica (vincula insumo a produto pra baixa automática no momento da venda). |
| **Delivery** | `/delivery` | Entregadores, atribuição de entregas, acompanhamento de status. |
| **Cardápio Digital** | `/site` | Gera um link público (`/cardapio/<slug>`) sem necessidade de login — cliente final monta o pedido e ele cai automaticamente no sistema como pedido de delivery. Tela de gestão mostra os pedidos vindos do link e reaproveita a calculadora de preços pra cadastrar o cardápio. |

### Planos no cadastro

Todo cadastro inclui o acesso de **Administração**. A escolha comercial usa Balcão como base e identifica o plano automaticamente:

| Módulos selecionados | Plano |
| --- | --- |
| Balcão | Básico |
| Balcão + Cardápio Digital | Básico 2.0 |
| Balcão + Garçom | Profissional |
| Balcão + Garçom + Cozinha | Intermediário |
| Balcão + Garçom + Cardápio Digital, com ou sem Cozinha | Plus |

Cada usuário criado no cadastro tem um papel (`admin`, `balcao`, `cozinha`,
`garcom`, `estoque`, `delivery` ou `site`) e só enxerga o módulo do seu papel
— exceto o `admin`, que enxerga todos os módulos contratados pelo
estabelecimento.

## Stack

- **Next.js 16** (App Router, Turbopack) + **React 19** + **TypeScript**
- **Tailwind CSS v4**
- **PostgreSQL 17** rodando em Docker, com **Row Level Security** isolando
  os dados de cada estabelecimento
- Autenticação própria: **bcrypt** para senha, cookie de sessão assinado com
  **HMAC** (sem biblioteca externa de auth)
- Fontes: **Bricolage Grotesque** (display) + **Lexend** (texto)

## Estrutura do projeto

```
Milleto_Restaurante/
├── database/
│   ├── schema.sql          # schema completo: tabelas, enums, triggers,
│   │                       # RLS, funções SECURITY DEFINER, grants
│   └── .env.local          # credenciais do Postgres (gitignored)
│
└── web/                     # aplicação Next.js
    ├── .env.local            # DATABASE_URL + SESSION_SECRET (gitignored)
    └── src/
        ├── app/
        │   ├── (auth)/login, registro/      # telas públicas de acesso
        │   ├── (app)/pedidos, cozinha,       # dashboard autenticado
        │   │        mesas, estoque,
        │   │        delivery, site/
        │   ├── cardapio/[slug]/              # cardápio digital público
        │   └── api/                          # rotas de API (auth, CRUD,
        │                                      # rota pública /api/publico)
        ├── components/                       # um diretório por módulo
        └── lib/                              # db.ts, session.ts,
                                               # tenant-context.tsx, etc.
```

## Banco de dados

O schema (`database/schema.sql`) cobre: `estabelecimentos` (tenants),
`usuarios`, `mesas`, `comandas`, `categorias_produto`, `produtos` (com
precificação automática via trigger), `insumos`, `produto_insumos` (ficha
técnica), `movimentacoes_estoque`, `pedidos`, `itens_pedido`,
`historico_status_pedido`, `entregadores`, `entregas`,
`whatsapp_mensagens`, `movimentacoes_financeiras`, `custos_fixos`.

**Isolamento entre estabelecimentos**: toda tabela relevante tem
`estabelecimento_id` e uma policy de RLS que só libera linhas onde
`estabelecimento_id = current_setting('app.estabelecimento_id')`. A
aplicação define essa variável de sessão logo após autenticar (veja
`comEstabelecimento` em `web/src/lib/db.ts`).

**Login e cadastro** passam por funções `SECURITY DEFINER`
(`fn_autenticar`, `fn_registrar_estabelecimento`) — a role usada pela
aplicação (`ohfome_app`) nunca tem acesso irrestrito às tabelas de usuários
ou estabelecimentos, só o que essas funções expõem.

**Cardápio público** também passa por funções dedicadas
(`fn_cardapio_publico`, `fn_criar_pedido_publico`) — o preço de cada item
é sempre lido do banco no momento da criação do pedido, nunca confiado no
que o navegador do cliente manda.

## Rodando localmente

### 1. Banco de dados (Docker)

```bash
docker run -d \
  --name ohfome-postgres \
  --restart unless-stopped \
  -p 127.0.0.1:5432:5432 \
  -e POSTGRES_DB=ohfome \
  -e POSTGRES_USER=ohfome_admin \
  -e POSTGRES_PASSWORD='<senha-forte>' \
  -v ohfome_pgdata:/var/lib/postgresql/data \
  postgres:17-alpine
```

Crie a role de aplicação (privilégio mínimo, nunca acessa como
superusuário) e aplique o schema:

```bash
docker exec -e PGPASSWORD='<senha-do-admin>' ohfome-postgres \
  psql -U ohfome_admin -d ohfome \
  -c "create role ohfome_app login password '<outra-senha-forte>';"

cat database/schema.sql | docker exec -i -e PGPASSWORD='<senha-do-admin>' ohfome-postgres \
  psql -U ohfome_admin -d ohfome
```

### 2. Variáveis de ambiente

Crie `web/.env.local` (veja `web/.env.example`):

```
DATABASE_URL=postgresql://ohfome_app:<senha-da-role-ohfome_app>@127.0.0.1:5432/ohfome
SESSION_SECRET=<string aleatória com 32+ caracteres>
```

### 3. Aplicação

```bash
cd web
npm install
npm run dev
```

Abra `http://localhost:3000`. Não existe conta padrão — clique em
"Cadastre seu estabelecimento" para criar a primeira.

## Segurança — resumo

- Nenhuma senha em texto puro (bcrypt, custo 12)
- RLS no Postgres como segunda camada de isolamento, além dos filtros da
  aplicação
- Role de aplicação sem `BYPASSRLS`, sem `SUPERUSER`, sem `DDL`
- Cookie de sessão `httpOnly`, `sameSite=lax`, assinado com HMAC
- Rate limit básico contra força bruta no login e no cardápio público
- Preço de venda sempre recalculado no servidor a partir do banco — nunca
  aceito do cliente
- Segredos (`DATABASE_URL`, `SESSION_SECRET`, credenciais do Postgres) só
  existem em arquivos `.env*`, que estão no `.gitignore`

## O que ainda não existe

- Front-end de gestão de `custos_fixos` / `movimentacoes_financeiras`
  (tabelas já existem no schema, sem tela)
- Envio real de mensagens (WhatsApp) — só o log de recebimento
  (`whatsapp_mensagens`) está modelado
- Deploy em produção (hoje só roda localmente)
