# Horários e disponibilidade do cardápio público

## Objetivo

Permitir que cada restaurante publique horários com múltiplos turnos por dia,
pause o recebimento de pedidos em imprevistos e impeça pedidos fora do período
disponível. O cliente deve ver o status antes de iniciar a compra.

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

## Implementação e testes

- Criar um módulo de domínio compartilhado que normaliza horários, calcula a
  disponibilidade no fuso definido e evita regras duplicadas.
- Criar endpoint administrativo autenticado para leitura/gravação e validar
  formato, ordem `inicio < fim`, limite de turnos e sobreposições.
- Usar a regra no endpoint público e no POST de pedido.
- Trocar os metadados globais do cardápio para apontar somente para
  `ohfome-icone-quadrado.png` com uma nova versão de cache, substituindo o
  favicon antigo após recarregamento forçado.
- Cobrir os cenários: aberto, fechado, dois turnos, pausa manual, tentativa de
  pedido direto fora do horário e favicon novo no cardápio.
