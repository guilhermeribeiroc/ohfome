# Troca de foto do produto pelo clique na imagem

## Objetivo

No editor de produtos do estoque, a imagem exibida deve ser o controle
principal para trocar a foto do produto.

## Comportamento

- A prévia da foto é um botão acessível, com rótulo `Trocar foto do produto`.
- Ao clicar ou usar teclado, abre o seletor atual de JPEG, PNG ou WebP.
- Enquanto o upload ocorre, o botão fica desativado e mostra carregamento.
- Sem foto cadastrada, o mesmo bloco de imagem padrão continua clicável.
- O campo para colar URL da imagem permanece disponível como alternativa.

## Segurança e testes

O upload continua usando a rota existente e só atualiza a edição local após a
resposta bem-sucedida. Validar clique, teclado, estado de envio, falha de
upload e compilação de produção.
