# OhFome — web

Aplicação Next.js do OhFome. A documentação completa do projeto (módulos,
arquitetura, banco de dados, como rodar tudo do zero) está no
[README da raiz](../README.md).

## Comandos

```bash
npm install
npm run dev      # http://localhost:3000, requer web/.env.local configurado
npm run build
npm run lint
```

Veja `.env.example` para as variáveis necessárias.

## Rolagem suave do cardápio público

O cardápio em `/cardapio/[slug]` usa Lenis exclusivamente nessa rota. A
dependência já está registrada no projeto e é instalada junto com as demais
ao executar `npm install`. Em uma instalação manual, use:

```bash
npm install @studio-freight/lenis
```

O ciclo de animação, a desmontagem e o `scrollTo` das categorias ficam
encapsulados em `src/components/cardapio-publico/CardapioPublico.tsx`; nenhuma
outra tela administrativa recebe smooth scroll.
