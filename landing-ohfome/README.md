# Landing do OhFome

Landing estática publicada no mesmo domínio do sistema, em `ohfome.app/site`.

## Easypanel

1. No serviço `landing-ohfome`, selecione **GitHub** como fonte.
2. Escolha o repositório `guilhermeribeiroc/ohfome`, branch `master` e Build Path `/landing-ohfome`.
3. Na seção **Build**, escolha **Dockerfile**. O arquivo já está nesta pasta.
4. Em **Domains**, crie a rota com hostname `ohfome.app`, path `/site`, porta `80` e HTTPS ativado.
5. No serviço do sistema, mantenha `ohfome.app` com path `/` e porta `3000`.
6. Faça o deploy. A landing responderá em `/site`; login, gestão e APIs continuam no serviço do sistema.

## Cloudflare

Mantenha o registro A de `ohfome.app` apontando para o IP do servidor Easypanel. Se o certificado HTTPS ainda não estiver emitido, deixe o proxy da Cloudflare desligado até a primeira emissão.

## Endereços

- Landing: `https://ohfome.app/site`
- Sistema: `https://ohfome.app/login`
- Cardápios públicos: `https://cliente.ohfome.app`
