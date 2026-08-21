# Horários, disponibilidade e PWA operacional

## Objetivo

Permitir que cada restaurante publique horários com múltiplos turnos por dia,
pause o recebimento de pedidos em imprevistos e impeça pedidos fora do período
disponível. O cliente deve ver o status antes de iniciar a compra. Também
permitir que a equipe instale o sistema administrativo como aplicativo pelo
navegador, sem transformar o cardápio público em PWA.

## Decisões aprovadas

- Cada dia da semana aceita zero ou mais turnos, por exemplo `11:00–14:00` e
  `18:00–23:00`.
- Um dia sem turnos é fechado.
- O administrador pode pausar manualmente o cardápio a qualquer momento.
- A pausa prevalece sobre os horários e pode ter uma mensagem para o cliente.
- O fuso usado para avaliar a disponibilidade é `America/Fortaleza`.
- Fora do horário ou em pausa, o cardápio permanece navegável, mas não permite
  adicionar/finalizar pedidos.
- A API revalida a disponibilidade antes de criar o pedido; a interface não é
  a única proteção.
- O PWA é destinado ao sistema operacional do restaurante e administrativo;
  o cardápio público continua sendo uma página web responsiva.
- Quando o navegador permitir, o sistema exibirá uma ação explícita
  **Instalar aplicativo** e usará o fluxo nativo do Chrome/Edge ou do celular.
- O aplicativo instalado terá ícone, nome e cores do OhFome e abrirá em janela
  própria, sem depender da barra do navegador.
- O cache do PWA deve guardar a estrutura estática da interface para melhorar
  abertura e navegação, mas dados operacionais continuam buscados na rede.
- Criação de pedidos, confirmação de Pix e impressão não funcionam offline; a
  interface deixa isso claro em vez de aceitar ações que poderiam duplicar ou
  perder pedidos.

## Persistência

Usar a tabela existente `estado_aplicacao`, com a chave
`horario_funcionamento`. O JSON terá o formato:

```json
{
  "pausado": false,
  "mensagemPausa": "Não estamos recebendo pedidos no momento.",
  "turnos": {
    "0": [],
    "1": [{ "inicio": "11:00", "fim": "14:00" }, { "inicio": "18:00", "fim": "23:00" }],
    "2": [],
    "3": [],
    "4": [],
    "5": [],
    "6": []
  }
}
```

`0` é domingo e `6` é sábado. Horários de fechamento depois da meia-noite não
entram nesta primeira versão; o administrador deve dividir o turno em dois
dias. Isso elimina ambiguidades na avaliação do servidor.

## Fluxo e interface

1. Em Configurações, uma seção **Horários do cardápio** mostra os sete dias,
   cada um com botão para adicionar turno, campos de início/fim e remoção.
2. A mesma seção contém a chave **Pausar recebimento de pedidos** e campo de
   mensagem exibida ao público.
3. O endpoint público do cardápio retorna `disponibilidade` com `aberto`,
   `motivo`, `proximaAbertura` e os turnos publicados.
4. O cardápio mostra um selo “Aberto agora” ou “Fechado”, a próxima abertura
   quando existir e a mensagem de pausa quando aplicável.
5. Ao fechar, os CTAs do carrinho/finalização ficam desabilitados com uma
   explicação clara.
6. A criação de pedido público consulta a mesma regra antes de inserir dados;
   se indisponível retorna `409` com a mensagem ao cliente.

## PWA administrativo

1. O layout administrativo publica um `manifest` com nome, nome curto, cores,
   ícones quadrados e modo `standalone`.
2. Um registrador de service worker controla atualização e cache de arquivos
   estáticos do sistema, sem cachear respostas de APIs nem páginas de pedidos.
3. No menu de perfil/configurações haverá um item **Instalar OhFome**. Em
   navegadores compatíveis ele abre o prompt nativo; nos demais apresenta
   passos curtos para instalar pelo menu do navegador.
4. Ao abrir instalado, a aplicação mantém autenticação normal e mostra um
   aviso de conexão quando estiver offline. Botões que exigem rede ficam
   bloqueados com explicação.
5. O cardápio público não registra esse fluxo de instalação nem armazena
   pedidos em cache; segue acessível como site.

## Implementação e testes

- Criar um módulo de domínio compartilhado que normaliza horários, calcula a
  disponibilidade no fuso definido e evita regras duplicadas.
- Criar endpoint administrativo autenticado para leitura/gravação e validar
  formato, ordem `inicio < fim`, limite de turnos e sobreposições.
- Usar a regra no endpoint público e no POST de pedido.
- Trocar os metadados globais do cardápio para apontar somente para
  `ohfome-icone-quadrado.png` com uma nova versão de cache, substituindo o
  favicon antigo após recarregamento forçado.
- Criar manifesto, ícones e service worker do PWA apenas para as rotas
  autenticadas, além da ação de instalação e do estado offline.
- Cobrir os cenários: aberto, fechado, dois turnos, pausa manual, tentativa de
  pedido direto fora do horário, favicon novo no cardápio, instalação pelo
  Chrome/Edge, abertura como aplicativo e bloqueio seguro de ações offline.
