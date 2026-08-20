# Catálogo local de drivers para a estação de impressão

## Objetivo

Permitir que o administrador prepare o computador da estação sem procurar drivers fora do OhFome. Na página **Configurações → Impressão**, ele escolhe o sistema operacional e o modelo da impressora; o sistema apresenta os links e passos corretos antes de conectar o QZ Tray.

## Escopo da primeira versão

O catálogo será um dado estático no frontend, sem banco de dados. A seleção é salva no `localStorage` do computador que imprime, pois uma mesma conta pode usar estações e impressoras diferentes.

Modelos iniciais:

- Oasis OIA-8387 / POS-58;
- Epson TM-T20 / TM-T20X;
- Elgin i8 / i9;
- Bematech MP-4200 TH;
- Daruma DR800;
- Sweda SI-300S;
- genérica ESC/POS de 58 mm;
- genérica ESC/POS de 80 mm;
- outro modelo.

Cada entrada define largura sugerida, instrução de conexão e links de suporte/driver separados por Windows e macOS. Quando o fabricante não fornece um driver macOS atual, a tela informa explicitamente que o usuário deve instalar a fila pelo macOS/CUPS ou consultar o suporte do fabricante; ela não oferece um arquivo incompatível.

Os links devem apontar para páginas oficiais de suporte sempre que disponíveis, não para executáveis arquivados pelo OhFome. Isso evita distribuir binários de terceiros, mantém a licença sob responsabilidade do fabricante e reduz links diretos quebrados.

## Experiência da tela

No topo do guia haverá uma seção **Escolha sua impressora**:

1. botões para Windows e macOS;
2. cartões de seleção de modelo;
3. um resumo do modelo selecionado com largura recomendada e tipo de conexão;
4. ações na ordem de instalação: driver, QZ Tray e instalador de confiança OhFome;
5. botão para abrir o painel e concluir escolhendo a fila encontrada pelo QZ.

O guia genérico atual permanece abaixo do assistente para cobertura de modelos não listados. A escolha de modelo não tenta detectar hardware nem muda a impressora escolhida pelo QZ: nomes USB, rede e Bluetooth variam por sistema operacional e o QZ continua sendo a fonte de verdade para a fila local.

## Fluxo e erros

- Ao mudar o sistema ou modelo, a seleção é persistida imediatamente no navegador.
- Se não houver driver listado, o usuário recebe instrução clara para abrir a página do fabricante e instalar uma fila compatível antes de conectar o QZ.
- Para rede e Bluetooth, o usuário deve primeiro adicionar a impressora nas configurações do sistema; em seguida ela aparece na lista do QZ Tray.
- Se o QZ não encontrar a fila, o fluxo direciona para a configuração da estação e a impressão de teste.

## Validação

- Selecionar Oasis POS-58 no Windows expõe o driver POS-58 e largura de 58 mm.
- Selecionar Epson no Windows expõe a página oficial TM-T20X e largura de 80 mm.
- Trocar de macOS para Windows troca os links e mantém o modelo selecionado.
- Recarregar a página preserva sistema e modelo daquela estação.
- O projeto passa em `tsc --noEmit` e o diff não contém erros de espaço.

## Fora de escopo

- Baixar ou instalar automaticamente drivers proprietários.
- Detectar automaticamente marca/modelo pela porta USB, rede ou Bluetooth.
- Administrar catálogo pelo banco nesta primeira entrega.
- Garantir suporte a qualquer impressora não listada.
