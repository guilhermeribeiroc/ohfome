# Logo PNG transparente no login

## Objetivo

Usar uma versão PNG transparente da marca completa OhFome na tela de login, removendo a moldura branca que hoje circunda o SVG.

## Alteração

- Gerar `ohfome-logo.png` a partir do SVG vetorial existente, preservando transparência.
- Substituir a referência do SVG pela PNG nas versões desktop e móvel do login.
- Remover o contêiner branco da logo; manter apenas espaçamento e sombra discreta quando necessário para legibilidade.
- Manter o ícone vetorial separado como elemento decorativo e para favicon.

## Verificação

- A logo não apresenta fundo branco no painel escuro e na versão móvel.
- A imagem mantém boa nitidez em telas comuns e não causa alteração nos campos de acesso.
