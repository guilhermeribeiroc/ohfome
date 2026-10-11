# Plano de implementação: conta de demonstração permanente

> Execução somente após a aprovação deste plano. A credencial de teste do
> Mercado Pago nunca será incluída neste repositório.

## Resultado esperado

O estabelecimento existente `restauranteteste`/`teste123` torna-se a Pizzaria
Bom Sabor, uma conta demonstrativa permanente em produção. Ela terá catálogo
amplo, dados operacionais fictícios e Pix Mercado Pago de teste isolado. Outros
estabelecimentos não terão alterações de comportamento nem poderão usar a
credencial de teste.

## 1. Definir a modalidade de demonstração no banco

**Arquivos:**

- Criar `database/migrations/034_conta_demonstracao_permanente.sql`
- Atualizar `database/schema.sql`

1. Adicionar `demonstracao boolean not null default false` em
   `estabelecimentos`.
2. Adicionar `ambiente text not null default 'producao'` em
   `mercado_pago_conexoes`, limitado a `producao` e `teste`.
3. Tornar os campos de refresh e expiração compatíveis com token de teste de
   longa duração, sem alterar a semântica das conexões OAuth de produção.
4. Criar um trigger que só aceite `ambiente = 'teste'` quando o estabelecimento
   for marcado como demonstração **e** tiver slug `restauranteteste`. O trigger
   também impedirá que uma conexão de teste seja migrada para outro tenant.
5. Preservar RLS, concessões e a política de isolamento por
   `app.estabelecimento_id`; incluir as novas colunas no `schema.sql` para uma
   instalação limpa reproduzir o banco de produção.

**Verificação:** aplicar a migration em banco temporário com a migration 033;
verificar que conexão de teste no tenant demo é aceita e que tentativas em
outro tenant falham dentro da transação.

## 2. Adaptar a integração do Mercado Pago por ambiente

**Arquivos:**

- Alterar `web/src/lib/mercado-pago.ts`
- Alterar `web/src/app/api/pagamentos/mercado-pago/conectar/route.ts`
- Alterar `web/src/app/api/pagamentos/mercado-pago/callback/route.ts`
- Alterar `web/src/app/api/pagamentos/pix/route.ts`
- Criar `web/scripts/provisionar-mercado-pago-demo.mjs`

1. Estender a leitura da conexão para retornar seu ambiente. Para `producao`,
   manter o fluxo atual: renovar token OAuth quando necessário. Para `teste`,
   usar somente o token cifrado e nunca tentar OAuth nem refresh.
2. Manter o mesmo caminho de criação e consulta de ordens Pix. A diferença será
   somente a credencial de teste usada no servidor; o QR e seus status vêm da
   API do Mercado Pago, sem saldo real.
3. Bloquear as rotas de conectar/desconectar OAuth de alterar uma conexão de
   teste. Uma conta normal continua usando o botão atual de conexão OAuth.
4. Retornar apenas um identificador seguro de ambiente (`teste` ou
   `producao`) para o administrador da própria conta; nunca retornar access
   token, refresh token, QR anterior ou dados de outro tenant.
5. Criar um script de provisionamento de servidor que lê
   `OHFOME_DEMO_MP_TEST_ACCESS_TOKEN` e o segredo de cifragem já configurado,
   verifica o slug e a flag de demonstração, cifra o token e grava a conexão de
   teste. O script recusará token ausente ou conta errada e não imprimirá o
   valor recebido. O responsável pelo provisionamento deverá fornecer somente
   a credencial indicada como teste no painel do Mercado Pago.

**Verificação:** testes unitários diretos das decisões de ambiente e uma
execução controlada com token fictício cifrado; confirmar que o fluxo OAuth
continua compilando e que um tenant comum não chega ao token de teste.

## 3. Informar o ambiente no painel sem expô-lo no cardápio

**Arquivos:**

- Alterar `web/src/lib/auth-queries.ts`
- Alterar `web/src/lib/tenant-context.tsx`
- Alterar `web/src/app/(app)/layout.tsx`
- Alterar `web/src/app/(app)/configuracoes/pagamentos/page.tsx`

1. Incluir a flag `demonstracao` apenas no contexto autenticado do tenant.
2. Exibir um aviso compacto e não bloqueante no painel: “Ambiente de
   demonstração — pagamentos Mercado Pago em teste”.
3. Na tela Pix, distinguir “credencial de teste conectada” de conexão real e
   esconder ações OAuth que não se aplicam à conta demo.
4. Não incluir a flag ou credenciais na resposta pública de
   `fn_cardapio_publico`; o consumidor vê o fluxo normal de pedido e o QR.

**Verificação:** login da conta demo apresenta o selo; login comum não o vê;
a resposta de cardápio público não contém `demonstracao`, ambiente de pagamento
ou qualquer segredo.

## 4. Substituir a seed por uma carga permanente e idempotente

**Arquivos:**

- Reescrever `database/seeds/pizzaria-bom-sabor-demo.sql`
- Criar `database/seeds/README.md`

1. Remover a condição frágil que exige exatamente 12 produtos existentes.
Validar em vez disso a conta por slug, administrador e flag de demonstração.
2. Carregar cerca de 30 produtos estáveis nas categorias pizzas salgadas,
   pizzas doces, combos, porções, bebidas e sobremesas. Cada produto terá
   descrição, preço de custo, preço de venda e imagem válida servida pela
   aplicação. Atualizar pelo nome estável do catálogo demo, inserir os ausentes
   e não apagar produtos ou pedidos criados manualmente em demonstrações.
3. Ativar todos os módulos do estabelecimento e cadastrar usuários fictícios
   para administrador, balcão, cozinha, estoque e caixa, além de entregadores
   nomeados. O acesso existente `teste123` será preservado. Senhas de contas
   auxiliares não serão mostradas nem armazenadas em texto aberto.
4. Cadastrar clientes fictícios, mesas, bairros com taxas distintas, custos
   fixos e movimentações financeiras de exemplo.
5. Ativar controle unitário para bebidas e sobremesas, criar os saldos e
   movimentos iniciais no estoque de produtos. Pizzas e produtos preparados
   sob demanda permanecerão sem controle unitário.
6. Recriar somente os pedidos explicitamente marcados com
   `Demonstração Pizzaria Bom Sabor`, com itens, totais, pagamentos e estados
   válidos. Incluir pedido em cada fluxo acordado e associar entregadores aos
   pedidos em entrega. Os pedidos feitos posteriormente pelo usuário não são
   tocados.
7. Aplicar a carga integralmente em transação e documentar pré-requisitos,
   comando, relatório esperado e como interromper sem dados parciais.

**Verificação:** rodar duas vezes em banco temporário; as contagens de dados
demo devem ser estáveis, os pedidos manuais de controle devem sobreviver e o
catálogo público deve retornar disponibilidade correta.

## 5. Provisionar e validar sem dados reais

1. Fazer backup verificável das linhas da conta de demonstração no ambiente
   alvo antes de aplicar a migration ou a carga.
2. Aplicar a migration 033, se ainda não estiver presente, e depois a 034.
3. Executar a carga SQL e conferir as contagens de categorias, produtos,
   equipe, entregadores, bairros, estoque, clientes e pedidos.
4. Inserir a credencial de teste apenas no ambiente seguro de execução e rodar
   o script de provisionamento nativo do Node (`.mjs`). Não copiar o token para terminal compartilhado,
   logs, commit ou mensagem.
5. Testar manualmente com `teste123`: login, painel, busca de cliente, venda
   balcão, retirada, delivery, entrega com entregador, ajuste de estoque e
   cardápio público.
6. Criar um pedido Pix com e-mail fictício e confirmar que o QR de teste é
   exibido. Se houver conta compradora de teste configurada no Mercado Pago,
   validar a confirmação simulada; caso contrário, conferir criação e expiração
   da ordem sem pagamento.
7. Tentar configurar a conexão de teste em tenant de controle e confirmar a
   rejeição. Confirmar que nenhum endpoint público entrega o token.

## 6. Verificação de código e entrega

1. Executar `npx tsc --noEmit`, `npm run lint`, `npm run build` e
   `git diff --check` em `web/`.
2. Aplicar a migration e a seed em banco de teste temporário, exercitar as
   restrições de isolamento e os caminhos de estoque/Pix.
3. Revisar o diff para garantir que só foram alterados os arquivos do plano e
   da funcionalidade, preservando arquivos locais não relacionados.
4. Criar commit separado da implementação com instrução explícita de aplicar
   migration 034 e provisionar o token de teste fora do Git.
