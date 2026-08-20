# Plano de implementação: operação de impressão e identidade

**Base:** [especificação aprovada](../specs/2026-08-20-operacao-impressao-e-identidade-design.md)  
**Ordem de entrega:** impressão → precificação → banner → login

## Princípios de entrega

- Entregar e validar a impressão antes das mudanças visuais.
- Preservar os pedidos no PostgreSQL até o envio ao spooler local ser confirmado.
- Não prometer confirmação física do papel: o QZ confirma o envio ao spooler, não a saída do papel.
- Não colocar chaves/certificados do QZ no Git ou no cliente; continuam somente em variáveis seguras do ambiente.
- Aplicar cada migration no PostgreSQL da VPS antes do deploy que a utiliza.

## Fase 1 — Estação de impressão resiliente

### 1. Modelar propriedade e rastreabilidade da fila

**Arquivos:**

- Criar `database/migrations/017_estacao_impressao_resiliente.sql`.
- Atualizar `database/schema.sql` para refletir a migration.
- Atualizar `web/src/lib/types.ts` com os tipos de status da estação e do job.

**Mudanças:**

1. Adicionar a `impressao_jobs` os campos `estacao_id`, `token_reserva`, `ultimo_heartbeat_em` e `concluido_em`/metadados de erro quando ainda não existirem.
2. Criar índices por `estabelecimento_id`, `status`, `created_at` e por reserva da estação para leitura eficiente da fila.
3. Garantir que um job em impressão só possa ser concluído, renovado ou devolvido à fila pela estação e token que o reservaram.
4. Definir expiração da reserva pelo último heartbeat, não somente pelo instante inicial da reserva.
5. Manter jobs expirados como pendentes com motivo de recuperação, sem apagá-los.

**Validação:** aplicar migration em banco de teste/VPS, consultar a estrutura e confirmar que uma atualização com estação/token incorretos retorna conflito.

### 2. Centralizar a lógica de estação no cliente

**Arquivos:**

- Criar `web/src/components/cozinha/useEstacaoImpressao.ts`.
- Criar `web/src/components/cozinha/StatusEstacaoImpressao.tsx`.
- Refatorar `web/src/components/cozinha/ImpressaoQzTray.tsx` para usar esses módulos.
- Manter a montagem global em `web/src/app/(app)/layout.tsx`.

**Mudanças:**

1. Gerar uma vez um UUID de estação e persistir no `localStorage` do computador.
2. Coordenar as abas com `BroadcastChannel`, usando `localStorage` como fallback: uma única aba é líder de impressão; as demais apenas exibem o estado.
3. Implementar uma máquina de estados: `inicializando`, `conectando`, `pronta`, `reconectando`, `sem_impressora`, `qz_indisponivel`, `falha`.
4. Persistir impressora, largura, cópias, modo automático e identidade da estação no computador.
5. Usar backoff de reconexão limitado (por exemplo, 1 s, 2 s, 5 s, 10 s e 30 s), sem múltiplas tentativas paralelas.
6. Verificar periodicamente o websocket do QZ e renovar o heartbeat dos jobs em processamento.
7. Manter no histórico local somente IDs e datas recentes de jobs enviados, com limpeza automática, para reduzir reenvio após recarregar a página.

**Validação:** duas abas na mesma estação; apenas uma reserva jobs, a aba líder pode ser fechada e a outra assume sem imprimir duas vezes.

### 3. Endurecer os endpoints de fila

**Arquivos:**

- Atualizar `web/src/app/api/impressao/jobs/route.ts`.
- Atualizar `web/src/app/api/impressao/jobs/[id]/route.ts`.
- Criar `web/src/app/api/impressao/estacao/route.ts` apenas se a leitura de saúde não couber no endpoint existente.

**Mudanças:**

1. `GET /api/impressao/jobs` recebe o identificador da estação e devolve fila, contadores e saúde da estação.
2. `reservar` exige `estacaoId`, devolve `tokenReserva` e registra o heartbeat.
3. Adicionar a ação `heartbeat` para estender a reserva de trabalho enquanto o QZ estiver ativo.
4. `concluir` e `falhar` exigem o mesmo token; jobs não pertencentes à estação retornam `409`.
5. Expirar reservas somente quando o heartbeat vencer; devolver jobs ao estado pendente na ordem original.
6. Expor falhas esgotadas no painel, sem misturá-las à fila automática.

**Validação:** simular conflito, expiração de heartbeat, falha transitória e falha após o limite de tentativas.

### 4. Reposicionar e ampliar o indicador visual

**Arquivos:**

- Atualizar `web/src/components/cozinha/ImpressaoQzTray.tsx`.
- Atualizar estilos globais somente se houver colisão com cabeçalhos ou navegação móvel.

**Mudanças:**

1. Mover o botão de `bottom-right` para `top-right`, respeitando área segura em celular.
2. Abrir o painel logo abaixo do botão, sem cobrir o cabeçalho da página.
3. Mostrar estado por cor e texto, mas nunca depender apenas da cor.
4. Exibir: nome da impressora, jobs pendentes, último pedido, última comunicação e ações `Reconectar`, `Testar`, `Reenviar`.
5. Preservar o atalho para a configuração guiada da impressora.

**Validação:** desktop, celular, rota de cozinha, pedidos, mesas e configurações; sem sobreposição de botões importantes.

### 5. Criar roteiro operacional da estação

**Arquivos:**

- Atualizar `web/src/app/(app)/configuracoes/impressao/page.tsx`.
- Atualizar os guias e instaladores QZ já publicados em `web/public/qz/` quando necessário.

**Mudanças:**

1. Adicionar checklist de abertura: computador ligado, impressora com papel, QZ Tray aberto, indicador verde e teste concluído.
2. Adicionar checklist de recuperação: verificar papel/USB/rede, abrir QZ, aguardar reconexão, conferir fila e reenviar somente jobs falhos.
3. Incluir recomendação de não suspender o computador da estação durante o expediente.

**Validação:** uma pessoa sem contexto segue o guia em Windows, macOS e Linux e obtém uma impressão de teste.

## Fase 2 — Precificação realmente bidirecional

### 6. Atualizar a regra no banco e na API

**Arquivos:**

- Criar `database/migrations/018_precificacao_bidirecional.sql`.
- Atualizar `database/schema.sql`.
- Atualizar `web/src/app/api/produtos/route.ts`.
- Atualizar `web/src/app/api/produtos/[id]/route.ts`.

**Mudanças:**

1. Remover a restrição que bloqueia margem negativa e substituí-la por regra compatível com preço de venda não negativo.
2. Ajustar a função/trigger de precificação para aceitar origem da edição: venda recalcula margem; custo ou margem recalculam venda.
3. Tratar custo zero explicitamente: não dividir por zero; persistir a margem como valor neutro/documentado enquanto a interface mostra “não calculável”.
4. Validar arredondamento monetário no banco para duas casas.

**Validação:** produtos com lucro, margem zero, prejuízo e custo zero por criação e edição via API.

### 7. Simplificar a calculadora de produtos

**Arquivos:**

- Atualizar `web/src/components/estoque/PrecificacaoCalculadora.tsx`.
- Atualizar utilitários de moeda em `web/src/lib/moeda.ts` apenas se necessário.

**Mudanças:**

1. Exibir os três campos sempre ativos no cadastro e na edição.
2. Rastrear o último campo alterado e recalcular o campo dependente imediatamente.
3. Substituir o seletor de modo por indicação textual de origem do cálculo, se ainda for útil.
4. Destacar margem negativa e prejuízo por unidade; não impedir salvar.
5. Mostrar estado especial para custo zero sem exibir `Infinity`, `NaN` ou percentual falso.
6. Proteger autosave contra respostas antigas sobrescrevendo a edição mais nova.

**Validação:** testar alteração rápida de custo/margem/venda, atualização de página e persistência correta no cardápio público.

## Fase 3 — Banner persistente do cardápio

### 8. Criar modelo de banners e armazenamento durável

**Arquivos:**

- Criar `database/migrations/019_banners_cardapio.sql`.
- Atualizar `database/schema.sql`.
- Criar `web/src/app/api/estabelecimento/banners/route.ts`.
- Criar `web/src/app/api/estabelecimento/banners/[id]/route.ts`.
- Criar `web/src/app/api/uploads/banner/route.ts`.
- Criar `web/src/lib/armazenamento-imagens.ts`.

**Mudanças:**

1. Criar `banners_cardapio` com `id`, `estabelecimento_id`, `url`, `ordem`, `ativo`, datas e limite de cinco banners por estabelecimento no serviço.
2. Adicionar ao estabelecimento o modo `padrao`, `fixo` ou `carrossel`.
3. Implementar uma abstração de armazenamento: diretório persistente montado no EasyPanel como implementação inicial; interface preparada para S3/R2.
4. Validar autenticação, posse do estabelecimento, tipo JPG/PNG/WebP, limite de 5 MB e dimensão/corte no cliente.
5. Atualizar a função pública do PostgreSQL e `web/src/app/api/publico/[slug]/route.ts` para devolver modo e banners ativos.

**Validação:** upload, reordenação, remoção, acesso isolado por estabelecimento e sobrevivência a um novo deploy.

### 9. Criar editor e renderizador do banner

**Arquivos:**

- Atualizar `web/src/components/site/SiteModule.tsx`.
- Criar `web/src/components/site/EditorBannerCardapio.tsx`.
- Atualizar `web/src/components/cardapio-publico/CardapioPublico.tsx`.
- Atualizar os tipos públicos em `web/src/lib/types.ts` e/ou tipos locais do cardápio.

**Mudanças:**

1. Criar a seção “Aparência do cardápio” com modos sem imagem, fixa e carrossel.
2. Permitir envio, prévia 16:9, reordenação, substituição e remoção de até cinco fotos.
3. Renderizar fallback atual quando não houver imagem válida.
4. Aplicar `object-fit: cover`, camada escura de contraste e texto sobreposto acessível.
5. Implementar carrossel com troca de cinco segundos, botões/pontos navegáveis e `prefers-reduced-motion`.

**Validação:** uma, cinco e nenhuma imagem em celular/desktop; texto sempre legível; carrossel não impede navegação do cardápio.

## Fase 4 — Identidade do login

### 10. Refinar layout da autenticação

**Arquivos:**

- Atualizar `web/src/app/(auth)/layout.tsx`.
- Atualizar `web/src/app/(auth)/login/page.tsx` apenas se for necessário melhorar a hierarquia do título.
- Reutilizar `web/public/marca/ohfome-logo.svg` e `web/public/marca/ohfome-icone.svg`.

**Mudanças:**

1. Ampliar a logo completa em desktop e celular.
2. Inserir o ícone como marca-d’água decorativa com contraste e opacidade seguros.
3. Enxugar a mensagem institucional e preservar a clareza do formulário.
4. Não alterar rotas, autenticação, campos, validação ou acessibilidade existente.

**Validação:** navegação por teclado, mensagens de erro, telas pequenas e contraste suficiente.

## Verificação final e deploy

1. Executar `npx tsc --noEmit`, `npm run lint` e `npm run build` em `web/`.
2. Aplicar migrations 017–019 no PostgreSQL da VPS, em ordem, e registrar o resultado.
3. Confirmar que o serviço EasyPanel tem armazenamento persistente para uploads antes de liberar banner em produção.
4. Fazer deploy.
5. Validar a estação com pedidos de balcão, mesa, delivery e retirada; QZ reiniciado; internet restabelecida; duas abas; reimpressão.
6. Validar precificação, banner e login no ambiente publicado.
7. Conferir novamente as variáveis de certificado QZ no EasyPanel após deploy, pois elas são necessárias para impressão silenciosa.

## Riscos e controles

| Risco | Controle |
| --- | --- |
| QZ/PC/impressora indisponível | Fila persistente, reconexão e indicação visível de saúde. |
| Duplicação após queda no instante de impressão | Token de reserva, liderança por estação, histórico local e reimpressão explícita. |
| Imagem perdida em deploy | Volume persistente antes de habilitar upload de banners. |
| Cálculo divergente entre tela e banco | Mesma regra de arredondamento no cliente e trigger/API no servidor. |
| Interface visual prejudicar operação | Critérios responsivos, contraste e validação manual em celular e desktop. |
