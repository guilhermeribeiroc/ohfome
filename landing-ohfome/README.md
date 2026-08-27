# Landing do OhFome

Landing page estática e independente do sistema de gestão. Ela pode ser hospedada separadamente, por exemplo em `www.ohfome.app` ou `ohfome.app`, enquanto a aplicação fica em `gestao.ohfome.app` e os cardápios em subdomínios dos estabelecimentos.

## Publicação

Envie todo o conteúdo desta pasta ao host estático. Não há banco de dados, login, API ou dependência do projeto principal.

O scroll suave usa Lenis via CDN. Para funcionamento sem internet/CDN, baixe o pacote Lenis e altere a primeira linha de `app.js` para apontar ao arquivo local.

Os links de ação já apontam para:

- `https://gestao.ohfome.app/registro`
- `https://gestao.ohfome.app/login`

Altere-os em `index.html` se o domínio de produção mudar.
