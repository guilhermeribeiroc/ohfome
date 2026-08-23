# Imagens persistentes de produtos

## Objetivo

Corrigir imagens de produtos que ficam pretas no cardápio público depois de
serem enviadas pelo painel administrativo.

## Causa

O upload de produtos grava arquivos em `public/uploads/produtos` e persiste a
URL estática `/uploads/produtos/<arquivo>`. Em produção, arquivos gravados após
o build não são servidos pelo Next como conteúdo estático e retornam `404`.

## Solução aprovada

1. Estender o armazenamento de imagens já usado por banners e logos para
   aceitar a categoria `produtos`.
2. Fazer `POST /api/uploads/produto` usar esse armazenamento e retornar
   `/api/arquivos/produtos/<arquivo>`.
3. Permitir `GET /api/arquivos/produtos/[arquivo]`, com a mesma validação de
   nome, tipo MIME e cache das outras imagens.
4. Migrar as URLs existentes de `/uploads/produtos/` para
   `/api/arquivos/produtos/` somente depois de confirmar que os arquivos estão
   presentes no volume de produção.

## Critérios de aceite

- Uma nova imagem enviada pelo painel retorna `201` e é exibida pelo cardápio.
- As duas imagens que hoje retornam `404` passam a responder `200`.
- As imagens continuam disponíveis após um novo deploy.
- Produtos sem imagem preservam a imagem padrão do cardápio.
