# Carga da conta demonstrativa

Esta carga transforma o estabelecimento existente `restauranteteste`, cujo administrador é `teste123`, na Pizzaria Bom Sabor. Ela exige as migrations `033_operacao_pizzaria.sql` e `034_conta_demonstracao_permanente.sql`.

```sh
psql "$DATABASE_URL" -f database/seeds/pizzaria-bom-sabor-demo.sql
```

A seed roda em uma transação. Em caso de erro, nada é aplicado. É seguro executá-la mais de uma vez: catálogo, equipe, bairros, mesas e dados financeiros marcados como demonstração são atualizados; pedidos e produtos criados manualmente durante uma apresentação não são removidos.

Para ativar o QR Code, use somente uma credencial marcada como **test** no Mercado Pago e execute, em ambiente seguro, `npm run provisionar:mp-demo` dentro de `web/`. São obrigatórias as variáveis `DATABASE_URL`, `MERCADO_PAGO_TOKEN_ENCRYPTION_KEY`, `OHFOME_DEMO_ESTABELECIMENTO_ID` e `OHFOME_DEMO_MP_TEST_ACCESS_TOKEN`. Nunca inclua a credencial em arquivos versionados, terminal gravado ou chat.
