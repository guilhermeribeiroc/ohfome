# Especificação — remediação dos achados de QA do OhFome

**Estado:** desenho aprovado em conversa; pendente revisão desta especificação antes do plano de implementação.

## Objetivo

Corrigir os defeitos confirmados e validar os achados suspeitos do Esquadrão QA, sem expor credenciais nem colocar dados ou pagamentos reais em risco. O aplicativo está em produção no EasyPanel; o serviço publicado usa o mesmo commit que o workspace (`d57d5fb`) e as credenciais das integrações estão presentes no container. A inspeção remota feita até agora foi somente leitura, exceto por um webhook de teste assinado com ID inexistente, que retornou 200 sem alterar dados.

## Escopo e entregas

O trabalho será dividido em três fases sequenciais, cada uma com testes locais e relatório atualizado:

### 1. Segurança e integridade

- Centralizar a validação de sessão para que usuário desativado perca imediatamente acesso a todas as APIs.
- Aplicar autorização de papel/módulo no servidor às operações de produtos, insumos e demais rotas, preservando o acesso de administrador somente aos módulos contratados.
- Substituir o uso direto do primeiro valor de `X-Forwarded-For` por identificação de cliente que respeite a cadeia de proxies confiáveis do EasyPanel/Traefik. O limitador deve sobreviver a reinícios e funcionar entre réplicas, com expiração e limpeza previsíveis.
- Definir uma máquina de estados explícita para pedidos e entregas; rejeitar reaberturas e impedir que uma entrega cancelada seja marcada como entregue. Preservar atomicidade entre pedido, entrega, comanda, disponibilidade do entregador e financeiro.
- Corrigir as constraints de pagamento dividido e revisar vínculos compostos por estabelecimento. A migration deve primeiro detectar inconsistências já existentes e abortar sem apagar/corrigir registros automaticamente; qualquer reparo de dados será apresentado antes de ser aplicado.
- Tornar a criação/repetição de cobrança Pix idempotente, com chave estável por pedido/tentativa e restrição única no banco. Não efetuar cobrança real durante os testes.

### 2. Validação, privacidade e experiência

- Validar conteúdo real de uploads (assinatura do arquivo, tamanho e tipos permitidos), não apenas o MIME informado pelo cliente.
- Validar datas de calendário, senha mínima em cadastro/alteração, limites e mensagens para serviços indisponíveis.
- Remover ou reduzir PII persistida em `localStorage`; quando necessário, definir prazo e limpeza no logout sem quebrar o fluxo de pedido.
- Corrigir contraste, rótulos acessíveis e tipografia de inputs, preservando o visual atual.
- Revisar aviso de privacidade e caminho para solicitar acesso/exclusão de dados sem prometer exclusão que conflite com retenções legais. O texto será informativo e encaminhará solicitações ao estabelecimento, salvo se existir um processo seguro já implementado.

### 3. Build, infraestrutura e validação final

- Corrigir os cinco erros de lint identificados e eliminar a dependência de rede durante build: resolver `@anthropic-ai/sdk` como dependência declarada e garantir fontes locais/fallback reproduzível.
- Fixar imagens-base do Docker em versões/digests atualizáveis de forma controlada; documentar atualização e rollback.
- Confirmar volume persistente de uploads (já foi observado montado em `/app/public/uploads`) e revisar headers de segurança no ponto correto, evitando CSP/HSTS incompatível com Mercado Pago, QZ Tray e domínios públicos.
- Adicionar testes automatizados para guards de papel/sessão, transições de estado, constraints/tenant isolation, rate limit, idempotência e validação de entrada.
- Executar lint, TypeScript, build Webpack e suíte de testes. Fazer smoke test no ambiente local com banco descartável; testes de provedor serão somente sandbox. O webhook de produção só receberá sondas não mutáveis com ID inexistente.

## Arquitetura e fluxo

As verificações de autorização serão aplicadas nas rotas servidoras, próximas às operações de banco, usando helpers comuns para identidade ativa, papel e módulo. A camada de interface continuará escondendo módulos não disponíveis, mas não será considerada controle de segurança.

As transições serão verificadas antes de qualquer escrita, e as alterações relacionadas ocorrerão na mesma transação PostgreSQL. As constraints compostas reforçarão a mesma regra no banco. O limitador usará fonte compartilhada e uma origem de IP validada pela configuração de proxy confiável, sem confiar em valores arbitrários enviados pelo cliente.

As correções serão desenvolvidas e testadas contra um banco descartável criado a partir do schema/migrations. Não será copiada a base de produção para a máquina local. Credenciais permanecerão no EasyPanel; código, logs e relatórios não conterão valores secretos.

## Segurança operacional

- Nenhuma chave ou senha será exibida, commitada ou enviada a serviços não necessários.
- Chaves Mercado Pago/Anthropic de produção não serão usadas para testes com cobrança, geração paga ou alteração de conta. Se um teste de ponta a ponta do pagamento for necessário, usar conta e credenciais sandbox.
- Não modificar dados da base de produção, aplicar migrations, trocar variáveis, reiniciar containers, alterar proxy ou publicar imagem como parte da fase local.
- Antes de qualquer migration/deploy, mostrar diff, pré-condições, backup/rollback e impacto esperado; a etapa produtiva exige confirmação específica no momento da execução.
- A conexão SSH atual entra como `root`. Não adicionar chaves ou usuários, nem mudar essa configuração durante a remediação sem plano e autorização próprios.

## Critérios de aceite

1. Um usuário desativado recebe 401 em `/api/auth/me` e não pode escrever em nenhuma rota autenticada.
2. `balcao` não pode operar estoque/produtos fora da matriz de permissões; cada papel só executa ações de seu módulo e tenant.
3. Pedidos finais/cancelados e entregas canceladas não aceitam transições inválidas; pedido e entrega permanecem coerentes após concorrência ou repetição.
4. Constraints rejeitam pagamento misto incompleto e vínculos entre tenants distintos, sem alterar dados legados silenciosamente.
5. Variar cabeçalhos enviados pelo cliente não contorna rate limit; limite compartilhado funciona após reinício e respeita proxy confiável.
6. Tentativas repetidas de checkout não criam cobranças duplicadas; falhas externas podem ser tentadas novamente com estado conhecido.
7. Inputs, uploads e datas inválidas são rejeitados; privacidade, acessibilidade e erros de indisponibilidade têm comportamento claro.
8. Lint, verificação TypeScript, build sem acesso de rede e testes automatizados passam no ambiente local.
9. Deploy de produção permanece separado, com rollback e confirmação específica do usuário.

## Fora do escopo desta implementação

- Processar pagamentos reais ou acessar dados pessoais de clientes na VPS.
- Alterar o comportamento comercial do Pix, taxas, retenção contábil/legal ou políticas de reembolso sem validação do proprietário.
- Criar automação de backup, novos usuários SSH ou alterar acesso root.
- Declarar conformidade legal; o texto de privacidade e as retenções precisam de revisão jurídica/operacional do negócio.

## Riscos e decisões

- A matriz correta de permissões pode depender do plano/módulos contratados; os testes devem cobrir papel e módulo, não apenas uma lista global de roles.
- Registros legados inconsistentes podem impedir a migration. Nesse caso, parar e apresentar apenas contagens/IDs técnicos mínimos e opções de reparo, sem remoção automática.
- Uma política CSP estrita pode quebrar checkout, fontes, impressão ou subdomínios; iniciar em modo de observação/teste e ajustar antes de exigir enforcement.
- O rate limit deve considerar o proxy real do EasyPanel; se o endereço do cliente não puder ser derivado com confiança, combinar chave por conta e limites globais, documentando o trade-off.
